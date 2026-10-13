import { Router, type Request, type RequestHandler } from 'express';
import { Types } from 'mongoose';
import {
  adminListingQuerySchema,
  adminOrderQuerySchema,
  assignDeliverySchema,
  auditQuerySchema,
  callQuerySchema,
  certificationReviewSchema,
  collectionSchema,
  exportFormatSchema,
  hasPermission,
  orderTransitionSchema,
  payoutQuerySchema,
  payoutSimulateSchema,
  returnQuerySchema,
  returnReviewSchema,
  roleChangeSchema,
  ticketStatusSchema,
  paginationSchema,
  TICKET_STATUSES,
} from '@rythubazaar/shared';
import { z } from 'zod';
import {
  AuditLog,
  CallEvent,
  CallSession,
  DeliveryAgent,
  FarmerProfile,
  Listing,
  Order,
  Payout,
  ReturnRequest,
  SupportTicket,
  User,
} from '../models';
import { AppError, Errors } from '../lib/errors';
import { ah, dateRange, escapeRegex, ok, pageMeta, parse } from '../lib/http';
import { maskEmail, maskPhone, redactDeep } from '../lib/redact';
import { requirePermission } from '../middleware/auth';
import { audit } from '../services/audit';
import { toOwnerListing } from '../services/listings';
import { assignDeliveryAgent, loadOrder, presentOrder, transitionOrder } from '../services/orders';
import { initiatePayout, presentPayout, reconcilePayout, simulatePayoutResult } from '../services/payouts';
import { recordRefund, reviewReturn } from '../services/returns';
import { presentEvent } from '../services/ivr/calls';
import { auditToMarkdown, callsToCsv, callsToJson, callsToMarkdown, toCsv } from '../services/exports';
import type { AppDeps } from '../context';

const noop = (): never => {
  throw Errors.forbidden();
};

function presentUser(
  u: {
    _id: Types.ObjectId;
    name: string;
    email: string;
    phone?: string;
    role: string;
    status: string;
    preferredLanguage: string;
    createdAt: Date;
  },
  req: Request,
) {
  const pii = hasPermission(req.user!.role, 'pii:read');
  return {
    id: u._id.toString(),
    name: u.name,
    email: pii ? u.email : maskEmail(u.email),
    phone: pii ? (u.phone ?? null) : (maskPhone(u.phone) ?? null),
    role: u.role,
    status: u.status,
    preferredLanguage: u.preferredLanguage,
    createdAt: u.createdAt,
  };
}

/** Lean query results and hydrated documents share these presenters, so fields are read loosely. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseDoc = Record<string, any>;

function presentReturn(r: InstanceType<typeof ReturnRequest> | LooseDoc) {
  const x: LooseDoc = typeof r.toObject === 'function' ? r.toObject() : r;
  return {
    id: String(x._id),
    orderId: String(x.orderId),
    orderNumber: x.orderNumber,
    customerId: String(x.customerId),
    farmerId: String(x.farmerId),
    reason: x.reason,
    details: x.details,
    status: x.status,
    refund: x.refund,
    payoutImpact: x.payoutImpact,
    history: x.history,
    createdAt: x.createdAt,
  };
}

function callFilter(q: z.infer<typeof callQuerySchema>) {
  const filter: Record<string, unknown> = {};
  if (q.callId) filter.callId = q.callId;
  if (q.dialedCode) filter.dialedCode = q.dialedCode;
  if (q.language) filter.language = q.language;
  if (q.outcome) filter.outcome = q.outcome;
  if (q.hasError) filter.hasError = q.hasError === 'true';
  const range = dateRange(q.from, q.to);
  if (range) filter.startedAt = range;
  return filter;
}

function auditFilter(q: z.infer<typeof auditQuerySchema>) {
  const filter: Record<string, unknown> = {};
  if (q.action) filter.action = { $regex: `^${escapeRegex(q.action.toUpperCase())}` };
  if (q.category) filter.category = q.category;
  if (q.resourceId) filter.resourceId = q.resourceId;
  if (q.correlationId) filter.correlationId = q.correlationId;
  if (q.outcome) filter.outcome = q.outcome;
  const range = dateRange(q.from, q.to);
  if (range) filter.at = range;
  return filter;
}

function presentSession(s: LooseDoc) {
  return {
    callId: s.callId,
    correlationId: s.correlationId,
    dialedCode: s.dialedCode,
    route: s.route,
    mode: s.mode,
    language: s.language,
    languageSource: s.languageSource,
    userId: s.userId ? String(s.userId) : null,
    userRole: s.userRole ?? 'GUEST',
    node: s.node,
    state: s.state,
    outcome: s.outcome,
    hasError: s.hasError,
    errorSummary: s.errorSummary ?? null,
    interpreter: s.interpreter,
    audioRecording: s.audioRecording,
    eventCount: s.eventCount,
    linked: s.linked,
    startedAt: s.startedAt,
    endedAt: s.endedAt ?? null,
  };
}

export function adminRouter(deps: AppDeps, limits: { sensitive: RequestHandler }) {
  const r = Router();

  // ---------- Overview ----------
  r.get(
    '/overview',
    requirePermission('orders:read:any'),
    ah(async (req, res) => {
      const since = new Date(Date.now() - 24 * 3600 * 1000);
      const [orderAgg, returnsOpen, ticketsOpen, callsToday, callErrors, payoutAgg] = await Promise.all([
        Order.aggregate<{ _id: string; count: number }>([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
        ReturnRequest.countDocuments({ status: { $in: ['REQUESTED', 'APPROVED'] } }),
        SupportTicket.countDocuments({ status: { $ne: 'RESOLVED' } }),
        CallSession.countDocuments({ startedAt: { $gte: since } }),
        CallSession.countDocuments({ startedAt: { $gte: since }, hasError: true }),
        hasPermission(req.user!.role, 'payouts:read:any')
          ? Payout.aggregate<{ _id: string; count: number; amount: number }>([
              { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$amountPaise' } } },
            ])
          : Promise.resolve(null),
      ]);
      ok(res, {
        ordersByStatus: Object.fromEntries(orderAgg.map((o) => [o._id, o.count])),
        returnsOpen,
        ticketsOpen,
        callsLast24h: callsToday,
        callErrorsLast24h: callErrors,
        payoutsByStatus: payoutAgg
          ? Object.fromEntries(payoutAgg.map((p) => [p._id, { count: p.count, amountPaise: p.amount }]))
          : null,
      });
    }),
  );

  // ---------- Orders & deliveries ----------
  r.get(
    '/orders',
    requirePermission('orders:read:any'),
    ah(async (req, res) => {
      const q = parse(adminOrderQuerySchema, req.query);
      const filter: Record<string, unknown> = {};
      if (q.status) filter.status = q.status;
      if (q.q) filter.orderNumber = { $regex: `^${escapeRegex(q.q.toUpperCase())}` };
      if (q.farmerId) filter.farmerId = new Types.ObjectId(q.farmerId);
      if (q.customerId) filter.customerId = new Types.ObjectId(q.customerId);
      const range = dateRange(q.from, q.to);
      if (range) filter.createdAt = range;
      const [rows, total] = await Promise.all([
        Order.find(filter)
          .sort({ createdAt: -1 })
          .skip((q.page - 1) * q.pageSize)
          .limit(q.pageSize),
        Order.countDocuments(filter),
      ]);
      ok(
        res,
        rows.map((o) => presentOrder(o.toObject(), req.user!)),
        200,
        pageMeta(q.page, q.pageSize, total),
      );
    }),
  );

  r.get(
    '/orders/:id',
    requirePermission('orders:read:any'),
    ah(async (req, res) => {
      const order = await loadOrder(req.params.id);
      const [payout, ret, customer, farmer, profile] = await Promise.all([
        hasPermission(req.user!.role, 'payouts:read:any')
          ? Payout.findOne({ orderId: order._id }).lean()
          : null,
        ReturnRequest.findOne({ orderId: order._id }).lean(),
        User.findById(order.customerId).lean(),
        User.findById(order.farmerId).lean(),
        FarmerProfile.findOne({ userId: order.farmerId }).lean(),
      ]);
      ok(res, {
        ...presentOrder(order.toObject(), req.user!),
        customer: customer ? presentUser(customer, req) : null,
        farmer: farmer
          ? { ...presentUser(farmer, req), village: profile?.village, district: profile?.district }
          : null,
        payout: payout ? presentPayout(payout) : null,
        return: ret ? presentReturn(ret) : null,
      });
    }),
  );

  r.post(
    '/orders/:id/transition',
    requirePermission('orders:manage'),
    limits.sensitive,
    ah(async (req, res) => {
      const input = parse(orderTransitionSchema, req.body);
      const order = await transitionOrder(
        req.user!,
        req.params.id,
        input.to,
        { reason: input.reason, correlationId: req.correlationId, notifier: deps.notifier },
        noop,
      );
      ok(res, presentOrder(order.toObject(), req.user!));
    }),
  );

  r.post(
    '/orders/:id/assign',
    requirePermission('deliveries:manage'),
    limits.sensitive,
    ah(async (req, res) => {
      const { agentId } = parse(assignDeliverySchema, req.body);
      const order = await assignDeliveryAgent(req.user!, req.params.id, agentId, req.correlationId);
      ok(res, presentOrder(order.toObject(), req.user!));
    }),
  );

  r.post(
    '/orders/:id/collect',
    requirePermission('deliveries:manage'),
    limits.sensitive,
    ah(async (req, res) => {
      const pickup = parse(collectionSchema, req.body);
      const order = await transitionOrder(
        req.user!,
        req.params.id,
        'COLLECTED',
        { pickup, correlationId: req.correlationId, notifier: deps.notifier },
        noop,
      );
      ok(res, presentOrder(order.toObject(), req.user!));
    }),
  );

  r.get(
    '/delivery-agents',
    requirePermission('orders:read:any'),
    ah(async (req, res) => {
      const agents = await DeliveryAgent.find({ active: true }).sort({ name: 1 }).limit(200).lean();
      const pii = hasPermission(req.user!.role, 'pii:read');
      ok(
        res,
        agents.map((a) => ({
          id: a._id.toString(),
          name: a.name,
          zone: a.zone,
          phone: pii ? a.phone : maskPhone(a.phone),
        })),
      );
    }),
  );

  // ---------- Payouts ----------
  r.get(
    '/payouts',
    requirePermission('payouts:read:any'),
    ah(async (req, res) => {
      const q = parse(payoutQuerySchema, req.query);
      const filter: Record<string, unknown> = {};
      if (q.status) filter.status = q.status;
      if (q.farmerId) filter.farmerId = new Types.ObjectId(q.farmerId);
      const [rows, total] = await Promise.all([
        Payout.find(filter)
          .sort({ createdAt: -1 })
          .skip((q.page - 1) * q.pageSize)
          .limit(q.pageSize)
          .lean(),
        Payout.countDocuments(filter),
      ]);
      ok(res, rows.map(presentPayout), 200, pageMeta(q.page, q.pageSize, total));
    }),
  );

  r.post(
    '/payouts/:id/initiate',
    requirePermission('payouts:manage'),
    limits.sensitive,
    ah(async (req, res) =>
      ok(res, presentPayout(await initiatePayout(req.user!, req.params.id, deps.payouts, req.correlationId))),
    ),
  );

  r.post(
    '/payouts/:id/simulate-result',
    requirePermission('payouts:manage'),
    limits.sensitive,
    ah(async (req, res) => {
      const input = parse(payoutSimulateSchema, req.body);
      const payout = await simulatePayoutResult(
        req.user!,
        req.params.id,
        input.outcome,
        input.failureReason,
        deps.payouts,
        req.correlationId,
      );
      ok(res, presentPayout(payout));
    }),
  );

  r.post(
    '/payouts/:id/reconcile',
    requirePermission('payouts:manage'),
    limits.sensitive,
    ah(async (req, res) => {
      const result = await reconcilePayout(req.user!, req.params.id, deps.payouts, req.correlationId);
      ok(res, { ...result, payout: presentPayout(result.payout) });
    }),
  );

  // ---------- Returns ----------
  r.get(
    '/returns',
    requirePermission('returns:read:any'),
    ah(async (req, res) => {
      const q = parse(returnQuerySchema, req.query);
      const filter: Record<string, unknown> = q.status ? { status: q.status } : {};
      const [rows, total] = await Promise.all([
        ReturnRequest.find(filter)
          .sort({ createdAt: -1 })
          .skip((q.page - 1) * q.pageSize)
          .limit(q.pageSize)
          .lean(),
        ReturnRequest.countDocuments(filter),
      ]);
      ok(res, rows.map(presentReturn), 200, pageMeta(q.page, q.pageSize, total));
    }),
  );

  r.post(
    '/returns/:id/review',
    requirePermission('returns:manage'),
    ah(async (req, res) => {
      const input = parse(returnReviewSchema, req.body);
      ok(
        res,
        presentReturn(
          await reviewReturn(req.user!, req.params.id, input.decision, input.note, req.correlationId),
        ),
      );
    }),
  );

  r.post(
    '/returns/:id/refund',
    requirePermission('returns:manage'),
    ah(async (req, res) =>
      ok(res, presentReturn(await recordRefund(req.user!, req.params.id, req.correlationId))),
    ),
  );

  // ---------- Listings ----------
  r.get(
    '/listings',
    requirePermission('listings:read:any'),
    ah(async (req, res) => {
      const q = parse(adminListingQuerySchema, req.query);
      const filter: Record<string, unknown> = {};
      if (q.q) filter.cropName = { $regex: escapeRegex(q.q), $options: 'i' };
      if (q.status) filter.status = q.status;
      if (q.certificationStatus) filter['certification.status'] = q.certificationStatus;
      if (q.farmerId) filter.farmerId = new Types.ObjectId(q.farmerId);
      const [rows, total] = await Promise.all([
        Listing.find(filter)
          .sort({ updatedAt: -1 })
          .skip((q.page - 1) * q.pageSize)
          .limit(q.pageSize)
          .lean(),
        Listing.countDocuments(filter),
      ]);
      ok(res, rows.map(toOwnerListing), 200, pageMeta(q.page, q.pageSize, total));
    }),
  );

  r.post(
    '/listings/:id/certification',
    requirePermission('listings:verify-certification'),
    ah(async (req, res) => {
      const input = parse(certificationReviewSchema, req.body);
      if (!Types.ObjectId.isValid(req.params.id)) throw Errors.notFound('Listing');
      const listing = await Listing.findOneAndUpdate(
        { _id: req.params.id, 'certification.status': 'PENDING_VERIFICATION' },
        {
          $set: {
            'certification.status': input.decision,
            'certification.reviewedBy': req.user!._id,
            'certification.reviewedAt': new Date(),
            'certification.reviewNote': input.note ?? '',
          },
        },
        { new: true },
      ).lean();
      if (!listing)
        throw new AppError(
          409,
          'INVALID_TRANSITION',
          'No certificate is pending verification for this listing',
        );
      await audit({
        category: 'BUSINESS',
        action: `CERTIFICATION_${input.decision}`,
        outcome: 'SUCCESS',
        actor: req.user!,
        resourceType: 'Listing',
        resourceId: listing._id.toString(),
        correlationId: req.correlationId,
        details: { note: input.note ?? null },
      });
      ok(res, toOwnerListing(listing));
    }),
  );

  // ---------- Users ----------
  r.get(
    '/users',
    requirePermission('users:read'),
    ah(async (req, res) => {
      const q = parse(
        z.object({
          ...paginationSchema.shape,
          q: z.string().trim().max(80).optional(),
          role: z.string().optional(),
        }),
        req.query,
      );
      const filter: Record<string, unknown> = {};
      if (q.role) filter.role = q.role;
      if (q.q) {
        const rx = { $regex: escapeRegex(q.q), $options: 'i' };
        filter.$or = [{ name: rx }, { email: rx }];
      }
      const [rows, total] = await Promise.all([
        User.find(filter)
          .sort({ createdAt: -1 })
          .skip((q.page - 1) * q.pageSize)
          .limit(q.pageSize)
          .lean(),
        User.countDocuments(filter),
      ]);
      ok(
        res,
        rows.map((u) => presentUser(u, req)),
        200,
        pageMeta(q.page, q.pageSize, total),
      );
    }),
  );

  r.patch(
    '/users/:id/role',
    requirePermission('users:manage-roles'),
    limits.sensitive,
    ah(async (req, res) => {
      const { role } = parse(roleChangeSchema, req.body);
      if (!Types.ObjectId.isValid(req.params.id)) throw Errors.notFound('User');
      if (req.user!._id.equals(req.params.id)) throw Errors.forbidden('You cannot change your own role');
      const target = await User.findById(req.params.id);
      if (!target) throw Errors.notFound('User');
      if (
        target.role === 'ADMIN' &&
        role !== 'ADMIN' &&
        (await User.countDocuments({ role: 'ADMIN', status: 'ACTIVE' })) <= 1
      ) {
        throw Errors.forbidden('Cannot remove the last administrator');
      }
      const from = target.role;
      target.role = role;
      target.sessionVersion += 1; // sign the user out everywhere so the new role applies at once
      await target.save();
      await audit({
        category: 'ADMIN',
        action: 'ROLE_CHANGED',
        outcome: 'SUCCESS',
        actor: req.user!,
        resourceType: 'User',
        resourceId: target._id.toString(),
        correlationId: req.correlationId,
        details: { from, to: role },
      });
      ok(res, presentUser(target.toObject(), req));
    }),
  );

  // ---------- Support tickets ----------
  r.get(
    '/tickets',
    requirePermission('support:read:any'),
    ah(async (req, res) => {
      const q = parse(
        z.object({ ...paginationSchema.shape, status: z.enum(TICKET_STATUSES).optional() }),
        req.query,
      );
      const filter: Record<string, unknown> = q.status ? { status: q.status } : {};
      const [rows, total] = await Promise.all([
        SupportTicket.find(filter)
          .sort({ createdAt: -1 })
          .skip((q.page - 1) * q.pageSize)
          .limit(q.pageSize)
          .lean(),
        SupportTicket.countDocuments(filter),
      ]);
      ok(
        res,
        rows.map((t) => ({
          id: t._id.toString(),
          ticketNumber: t.ticketNumber,
          userId: t.userId.toString(),
          subject: t.subject,
          message: t.message,
          orderId: t.orderId?.toString() ?? null,
          channel: t.channel,
          callId: t.callId,
          status: t.status,
          createdAt: t.createdAt,
        })),
        200,
        pageMeta(q.page, q.pageSize, total),
      );
    }),
  );

  r.patch(
    '/tickets/:id/status',
    requirePermission('support:manage'),
    ah(async (req, res) => {
      const { status } = parse(ticketStatusSchema, req.body);
      if (!Types.ObjectId.isValid(req.params.id)) throw Errors.notFound('Ticket');
      const ticket = await SupportTicket.findById(req.params.id);
      if (!ticket) throw Errors.notFound('Ticket');
      const from = ticket.status;
      ticket.status = status;
      ticket.history.push({
        from,
        to: status,
        at: new Date(),
        actorId: req.user!._id,
        actorRole: req.user!.role,
      });
      await ticket.save();
      await audit({
        category: 'BUSINESS',
        action: 'TICKET_STATUS_CHANGED',
        outcome: 'SUCCESS',
        actor: req.user!,
        resourceType: 'SupportTicket',
        resourceId: ticket._id.toString(),
        correlationId: req.correlationId,
        details: { from, to: status },
      });
      ok(res, { id: ticket._id.toString(), status: ticket.status });
    }),
  );

  // ---------- Call audit center ----------
  r.get(
    '/calls',
    requirePermission('calls:read'),
    ah(async (req, res) => {
      const q = parse(callQuerySchema, req.query);
      const filter = callFilter(q);
      const [rows, total] = await Promise.all([
        CallSession.find(filter)
          .sort({ startedAt: -1 })
          .skip((q.page - 1) * q.pageSize)
          .limit(q.pageSize)
          .lean(),
        CallSession.countDocuments(filter),
      ]);
      ok(res, rows.map(presentSession), 200, pageMeta(q.page, q.pageSize, total));
    }),
  );

  r.get(
    '/calls/export',
    requirePermission('audit:export'),
    limits.sensitive,
    ah(async (req, res) => {
      const format = parse(exportFormatSchema, req.query.format ?? 'json');
      const q = parse(callQuerySchema, { ...req.query, page: 1, pageSize: 50 });
      const filter = callFilter(q);
      const sessions = await CallSession.find(filter).sort({ startedAt: -1 }).limit(200).lean();
      const events = await CallEvent.find({ callId: { $in: sessions.map((s) => s.callId) } })
        .sort({ callId: 1, seq: 1 })
        .limit(20_000)
        .lean();
      const byCall = new Map<string, typeof events>();
      for (const e of events) byCall.set(e.callId, [...(byCall.get(e.callId) ?? []), e]);
      const items = sessions.map((s) => ({
        session: presentSession(s),
        events: (byCall.get(s.callId) ?? []).map(presentEvent),
      }));
      const meta = {
        generatedAt: new Date().toISOString(),
        exportedByRole: req.user!.role,
        filters: { ...req.query, format: undefined },
        sessionCount: items.length,
        redacted: true,
        truncated: sessions.length === 200,
      };
      // The export action itself is audited.
      await audit({
        category: 'EXPORT',
        action: 'CALL_AUDIT_EXPORTED',
        outcome: 'SUCCESS',
        actor: req.user!,
        resourceType: 'CallSession',
        correlationId: req.correlationId,
        details: { format, sessionCount: items.length, filters: meta.filters },
      });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      if (format === 'csv') {
        res.type('text/csv').attachment(`call-audit-${stamp}.csv`).send(callsToCsv(items));
      } else if (format === 'md') {
        res.type('text/markdown').attachment(`call-audit-${stamp}.md`).send(callsToMarkdown(items, meta));
      } else {
        res.type('application/json').attachment(`call-audit-${stamp}.json`).send(callsToJson(items, meta));
      }
    }),
  );

  r.get(
    '/calls/:callId',
    requirePermission('calls:read'),
    ah(async (req, res) => {
      const session = await CallSession.findOne({ callId: req.params.callId }).lean();
      if (!session) throw Errors.notFound('Call');
      const events = await CallEvent.find({ callId: session.callId }).sort({ seq: 1 }).limit(2000).lean();
      const audits = await AuditLog.find({ correlationId: session.correlationId })
        .sort({ at: 1 })
        .limit(200)
        .lean();
      ok(res, {
        session: presentSession(session),
        events: events.map(presentEvent),
        auditTrail: audits.map((a) => ({
          at: a.at,
          category: a.category,
          action: a.action,
          outcome: a.outcome,
          actorType: a.actorType,
          actorRole: a.actorRole,
          resourceType: a.resourceType,
          resourceId: a.resourceId,
        })),
      });
    }),
  );

  // ---------- Audit log ----------
  r.get(
    '/audit',
    requirePermission('audit:read'),
    ah(async (req, res) => {
      const q = parse(auditQuerySchema, req.query);
      const filter = auditFilter(q);
      const [rows, total] = await Promise.all([
        AuditLog.find(filter)
          .sort({ at: -1 })
          .skip((q.page - 1) * q.pageSize)
          .limit(q.pageSize)
          .lean(),
        AuditLog.countDocuments(filter),
      ]);
      ok(
        res,
        rows.map((a) => ({
          ...a,
          id: a._id.toString(),
          _id: undefined,
          actorId: a.actorId?.toString() ?? null,
        })),
        200,
        pageMeta(q.page, q.pageSize, total),
      );
    }),
  );

  r.get(
    '/audit/export',
    requirePermission('audit:export'),
    limits.sensitive,
    ah(async (req, res) => {
      const format = parse(exportFormatSchema, req.query.format ?? 'json');
      const q = parse(auditQuerySchema, { ...req.query, page: 1, pageSize: 50 });
      const rows = (await AuditLog.find(auditFilter(q)).sort({ at: -1 }).limit(5000).lean()).map((a) => ({
        at: a.at.toISOString(),
        category: a.category,
        action: a.action,
        outcome: a.outcome,
        actorType: a.actorType,
        actorRole: a.actorRole,
        actorId: a.actorId?.toString() ?? null,
        resourceType: a.resourceType,
        resourceId: a.resourceId,
        correlationId: a.correlationId,
        details: a.details,
      }));
      const meta = {
        generatedAt: new Date().toISOString(),
        filters: { ...req.query, format: undefined },
        count: rows.length,
        redacted: true,
      };
      await audit({
        category: 'EXPORT',
        action: 'AUDIT_LOG_EXPORTED',
        outcome: 'SUCCESS',
        actor: req.user!,
        correlationId: req.correlationId,
        details: { format, count: rows.length, filters: meta.filters },
      });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      if (format === 'csv') {
        res
          .type('text/csv')
          .attachment(`audit-${stamp}.csv`)
          .send(
            toCsv(rows, [
              'at',
              'category',
              'action',
              'outcome',
              'actorType',
              'actorRole',
              'actorId',
              'resourceType',
              'resourceId',
              'correlationId',
              'details',
            ]),
          );
      } else if (format === 'md') {
        res.type('text/markdown').attachment(`audit-${stamp}.md`).send(auditToMarkdown(rows, meta));
      } else {
        res
          .type('application/json')
          .attachment(`audit-${stamp}.json`)
          .send(JSON.stringify({ meta, entries: redactDeep(rows) }, null, 2));
      }
    }),
  );

  // ---------- Config (admin only) ----------
  r.get(
    '/config',
    requirePermission('config:read'),
    ah(async (_req, res) => {
      const { env } = deps;
      ok(res, {
        nodeEnv: env.NODE_ENV,
        demoRoutes: env.demoRoutes,
        telephonyMode: env.TELEPHONY_MODE,
        interpreter: env.AI_INTERPRETER,
        paymentMode: env.PAYMENT_MODE,
        payoutProvider: env.PAYOUT_PROVIDER,
        fees: deps.fees,
        returnWindowHours: env.RETURN_WINDOW_HOURS,
        rateLimitEnabled: env.RATE_LIMIT_ENABLED,
        callIdleTimeoutMinutes: env.CALL_IDLE_TIMEOUT_MINUTES,
        corsOrigins: env.CORS_ORIGINS,
        cookieSecure: env.cookieSecure,
      });
    }),
  );

  return r;
}
