import { randomInt } from 'node:crypto';
import { Types, type ClientSession } from 'mongoose';
import { Order, SupportTicket } from '../models';
import { AppError, Errors } from '../lib/errors';
import { audit } from './audit';
import type { AuthUser } from '../types/express';

async function newTicketNumber(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const candidate = `T${randomInt(100000, 1000000)}`;
    if (!(await SupportTicket.exists({ ticketNumber: candidate }))) return candidate;
  }
  throw new AppError(500, 'INTERNAL_ERROR', 'Could not allocate a ticket number');
}

export async function createTicket(
  actor: AuthUser,
  input: { subject: string; message: string; orderId?: string },
  opts: { channel: 'WEB' | 'CALL'; callId?: string; correlationId?: string; session?: ClientSession },
) {
  if (input.orderId) {
    const order = await Order.findById(input.orderId, { customerId: 1, farmerId: 1 }).lean();
    if (!order || (!order.customerId.equals(actor._id) && !order.farmerId.equals(actor._id))) {
      throw Errors.validation([{ path: 'orderId', message: 'Choose one of your own orders' }]);
    }
  }
  const [ticket] = await SupportTicket.create(
    [
      {
        ticketNumber: await newTicketNumber(),
        userId: actor._id,
        subject: input.subject,
        message: input.message,
        orderId: input.orderId ? new Types.ObjectId(input.orderId) : null,
        channel: opts.channel,
        callId: opts.callId ?? null,
        status: 'OPEN',
        history: [{ from: null, to: 'OPEN', at: new Date(), actorId: actor._id, actorRole: actor.role }],
      },
    ],
    opts.session ? { session: opts.session } : {},
  );
  await audit(
    {
      category: 'BUSINESS',
      action: 'SUPPORT_TICKET_CREATED',
      outcome: 'SUCCESS',
      actor,
      resourceType: 'SupportTicket',
      resourceId: ticket!._id.toString(),
      correlationId: opts.correlationId,
      details: { channel: opts.channel, callId: opts.callId ?? null, ticketNumber: ticket!.ticketNumber },
    },
    opts.session,
  );
  return ticket!;
}
