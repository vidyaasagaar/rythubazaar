import { z } from 'zod';
import { IVR_CROPS, UNITS, findCrop } from '@rythubazaar/shared';
import { Order, User } from '../../models';
import { AppError } from '../../lib/errors';
import { createListing } from '../listings';
import { createTicket } from '../support';
import type { AuthUser } from '../../types/express';

/**
 * The complete allowlist of backend actions the IVR may request. Arguments are validated with
 * Zod and every tool re-checks the caller's identity and role from the database. Nothing else
 * (no queries, no arbitrary functions) is reachable from the call flow.
 */
export interface ToolContext {
  callerUserId: string | null;
  callId: string;
  correlationId: string;
}

export type ToolResult =
  | { ok: true; data: Record<string, unknown>; business?: { type: string; ids: Record<string, string> } }
  | { ok: false; code: string; message: string };

async function loadCaller(ctx: ToolContext): Promise<AuthUser | null> {
  if (!ctx.callerUserId) return null;
  const u = await User.findById(ctx.callerUserId).lean();
  if (!u || u.status !== 'ACTIVE') return null;
  return {
    id: u._id.toString(),
    _id: u._id,
    role: u.role,
    name: u.name,
    preferredLanguage: u.preferredLanguage,
  };
}

const tools = {
  createListingDraft: {
    args: z.object({
      cropKey: z.enum(IVR_CROPS.map((c) => c.key) as [string, ...string[]]),
      unit: z.enum(UNITS),
      quantity: z.number().int().min(1).max(100_000),
      priceRupees: z.number().int().min(1).max(100_000),
    }),
    async run(
      args: { cropKey: string; unit: (typeof UNITS)[number]; quantity: number; priceRupees: number },
      ctx: ToolContext,
    ): Promise<ToolResult> {
      const caller = await loadCaller(ctx);
      if (!caller || caller.role !== 'FARMER')
        return { ok: false, code: 'FORBIDDEN', message: 'Caller is not a farmer' };
      const crop = findCrop(args.cropKey)!;
      const listing = await createListing(
        caller,
        {
          cropName: crop.names['en-IN'],
          category: crop.category,
          description: '',
          photos: [],
          unit: args.unit,
          pricePerUnitPaise: args.priceRupees * 100,
          quantityTotal: args.quantity,
          growingPractice: 'CONVENTIONAL',
        },
        { source: 'CALL', callId: ctx.callId, correlationId: ctx.correlationId },
      );
      const ref = listing._id.toString().slice(-6).toUpperCase();
      return {
        ok: true,
        data: { listingId: listing._id.toString(), ref, status: listing.status },
        business: { type: 'LISTING_DRAFT_CREATED', ids: { listingId: listing._id.toString() } },
      };
    },
  },
  getOrderStatus: {
    args: z.object({ orderNumber: z.string().regex(/^RB\d{6}$/) }),
    async run(args: { orderNumber: string }, ctx: ToolContext): Promise<ToolResult> {
      const caller = await loadCaller(ctx);
      if (!caller || !['CUSTOMER', 'FARMER'].includes(caller.role)) {
        return { ok: false, code: 'UNAUTHENTICATED', message: 'Caller is not signed in' };
      }
      // Ownership enforced in the query: only the caller's own (customer or farmer) orders.
      const order = await Order.findOne(
        { orderNumber: args.orderNumber, $or: [{ customerId: caller._id }, { farmerId: caller._id }] },
        { status: 1, orderNumber: 1 },
      ).lean();
      if (!order) return { ok: true, data: { found: false } };
      return { ok: true, data: { found: true, orderId: order._id.toString(), status: order.status } };
    },
  },
  createSupportCallback: {
    args: z.object({}),
    async run(_args: Record<string, never>, ctx: ToolContext): Promise<ToolResult> {
      const caller = await loadCaller(ctx);
      if (!caller || !['CUSTOMER', 'FARMER'].includes(caller.role)) {
        return { ok: false, code: 'UNAUTHENTICATED', message: 'Caller is not signed in' };
      }
      const ticket = await createTicket(
        caller,
        {
          subject: 'Callback request (phone call)',
          message: `Requested through the IVR during call ${ctx.callId}.`,
        },
        { channel: 'CALL', callId: ctx.callId, correlationId: ctx.correlationId },
      );
      return {
        ok: true,
        data: { ticketId: ticket._id.toString(), ref: ticket.ticketNumber },
        business: { type: 'SUPPORT_CALLBACK_CREATED', ids: { ticketId: ticket._id.toString() } },
      };
    },
  },
} as const;

export type ToolName = keyof typeof tools;
export const TOOL_NAMES = Object.keys(tools) as ToolName[];

export async function runTool(name: ToolName, rawArgs: unknown, ctx: ToolContext): Promise<ToolResult> {
  const tool = tools[name];
  if (!tool) return { ok: false, code: 'FORBIDDEN', message: 'Unknown tool' };
  const parsed = tool.args.safeParse(rawArgs);
  if (!parsed.success) return { ok: false, code: 'VALIDATION_FAILED', message: 'Invalid tool arguments' };
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await (tool.run as (a: any, c: ToolContext) => Promise<ToolResult>)(parsed.data, ctx);
  } catch (err) {
    if (err instanceof AppError) return { ok: false, code: err.code, message: err.message };
    return { ok: false, code: 'INTERNAL_ERROR', message: 'Tool failed' };
  }
}
