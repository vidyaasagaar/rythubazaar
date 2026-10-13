import { Router, type RequestHandler } from 'express';
import { Types } from 'mongoose';
import {
  cartItemSchema,
  checkoutSchema,
  objectIdSchema,
  paginationSchema,
  returnRequestSchema,
  supportTicketSchema,
} from '@rythubazaar/shared';
import { Cart, Listing, Order, ReturnRequest, SupportTicket, availableQuantity } from '../models';
import { Errors } from '../lib/errors';
import { ah, ok, pageMeta, parse } from '../lib/http';
import { denyOwnership, requirePermission } from '../middleware/auth';
import { placeOrder, quoteCart } from '../services/checkout';
import { loadOrder, presentOrder, transitionOrder } from '../services/orders';
import { requestReturn } from '../services/returns';
import { createTicket } from '../services/support';
import type { AppDeps } from '../context';

export function customerRouter(deps: AppDeps, limits: { sensitive: RequestHandler }) {
  const r = Router();

  // ---------- Cart ----------
  r.get(
    '/cart',
    requirePermission('cart:manage'),
    ah(async (req, res) => ok(res, await quoteCart(req.user!._id, deps.fees))),
  );

  /** Set the quantity of a listing in the cart (adds the line if missing). */
  r.put(
    '/cart/items',
    requirePermission('cart:manage'),
    ah(async (req, res) => {
      const input = parse(cartItemSchema, req.body);
      const listing = await Listing.findById(input.listingId).lean();
      if (!listing || listing.status !== 'ACTIVE')
        throw Errors.conflict('LISTING_UNAVAILABLE', 'This listing is not available');
      const available = availableQuantity(listing);
      if (input.quantity > available) {
        throw Errors.conflict('INSUFFICIENT_STOCK', `Only ${available} available`, { available });
      }
      const listingId = new Types.ObjectId(input.listingId);
      const updated = await Cart.findOneAndUpdate(
        { userId: req.user!._id, 'items.listingId': listingId },
        { $set: { 'items.$.quantity': input.quantity } },
      );
      if (!updated) {
        await Cart.updateOne(
          { userId: req.user!._id },
          { $push: { items: { listingId, quantity: input.quantity, addedAt: new Date() } } },
          { upsert: true },
        );
      }
      ok(res, await quoteCart(req.user!._id, deps.fees));
    }),
  );

  r.delete(
    '/cart/items/:listingId',
    requirePermission('cart:manage'),
    ah(async (req, res) => {
      const listingId = parse(objectIdSchema, req.params.listingId);
      await Cart.updateOne(
        { userId: req.user!._id },
        { $pull: { items: { listingId: new Types.ObjectId(listingId) } } },
      );
      ok(res, await quoteCart(req.user!._id, deps.fees));
    }),
  );

  // ---------- Checkout ----------
  r.post(
    '/checkout',
    requirePermission('orders:create'),
    limits.sensitive,
    ah(async (req, res) => {
      const input = parse(checkoutSchema, req.body);
      const result = await placeOrder(req.user!, input, req.get('idempotency-key'), {
        fees: deps.fees,
        notifier: deps.notifier,
        correlationId: req.correlationId,
      });
      if (result.replayed) res.setHeader('Idempotent-Replayed', 'true');
      res.status(result.status).json(result.body);
    }),
  );

  // ---------- Orders ----------
  r.get(
    '/orders',
    requirePermission('orders:read:own'),
    ah(async (req, res) => {
      const { page, pageSize } = parse(paginationSchema, req.query);
      const filter = { customerId: req.user!._id };
      const [orders, total] = await Promise.all([
        Order.find(filter)
          .sort({ createdAt: -1 })
          .skip((page - 1) * pageSize)
          .limit(pageSize),
        Order.countDocuments(filter),
      ]);
      ok(
        res,
        orders.map((o) => presentOrder(o.toObject(), req.user!)),
        200,
        pageMeta(page, pageSize, total),
      );
    }),
  );

  r.get(
    '/orders/:id',
    requirePermission('orders:read:own'),
    ah(async (req, res) => {
      const order = await loadOrder(req.params.id);
      if (!order.customerId.equals(req.user!._id)) denyOwnership(req, 'order');
      const ret = await ReturnRequest.findOne({ orderId: order._id }).lean();
      ok(res, {
        ...presentOrder(order.toObject(), req.user!),
        return: ret
          ? {
              id: ret._id.toString(),
              status: ret.status,
              reason: ret.reason,
              refund: ret.refund,
              createdAt: ret.createdAt,
            }
          : null,
        returnWindowHours: deps.env.RETURN_WINDOW_HOURS,
      });
    }),
  );

  r.post(
    '/orders/:id/cancel',
    requirePermission('orders:read:own'),
    ah(async (req, res) => {
      const order = await transitionOrder(
        req.user!,
        req.params.id,
        'CANCELLED',
        { reason: 'Cancelled by customer', correlationId: req.correlationId, notifier: deps.notifier },
        () => denyOwnership(req, 'order'),
      );
      ok(res, presentOrder(order.toObject(), req.user!));
    }),
  );

  // ---------- Returns ----------
  r.post(
    '/returns',
    requirePermission('returns:create:own'),
    ah(async (req, res) => {
      const input = parse(returnRequestSchema, req.body);
      const ret = await requestReturn(
        req.user!,
        input,
        deps.env.RETURN_WINDOW_HOURS,
        () => denyOwnership(req, 'order'),
        req.correlationId,
      );
      ok(res, { id: ret._id.toString(), status: ret.status }, 201);
    }),
  );

  r.get(
    '/returns',
    requirePermission('returns:create:own'),
    ah(async (req, res) => {
      const { page, pageSize } = parse(paginationSchema, req.query);
      const filter = { customerId: req.user!._id };
      const [rows, total] = await Promise.all([
        ReturnRequest.find(filter)
          .sort({ createdAt: -1 })
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .lean(),
        ReturnRequest.countDocuments(filter),
      ]);
      ok(
        res,
        rows.map((x) => ({
          id: x._id.toString(),
          orderId: x.orderId.toString(),
          orderNumber: x.orderNumber,
          reason: x.reason,
          status: x.status,
          refund: x.refund,
          createdAt: x.createdAt,
        })),
        200,
        pageMeta(page, pageSize, total),
      );
    }),
  );

  // ---------- Support (customers and farmers) ----------
  r.post(
    '/support/tickets',
    requirePermission('support:create'),
    ah(async (req, res) => {
      const input = parse(supportTicketSchema, req.body);
      const t = await createTicket(req.user!, input, { channel: 'WEB', correlationId: req.correlationId });
      ok(res, { id: t._id.toString(), ticketNumber: t.ticketNumber, status: t.status }, 201);
    }),
  );

  r.get(
    '/support/tickets',
    requirePermission('support:create'),
    ah(async (req, res) => {
      const { page, pageSize } = parse(paginationSchema, req.query);
      const filter = { userId: req.user!._id };
      const [rows, total] = await Promise.all([
        SupportTicket.find(filter)
          .sort({ createdAt: -1 })
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .lean(),
        SupportTicket.countDocuments(filter),
      ]);
      ok(
        res,
        rows.map((t) => ({
          id: t._id.toString(),
          ticketNumber: t.ticketNumber,
          subject: t.subject,
          status: t.status,
          channel: t.channel,
          createdAt: t.createdAt,
        })),
        200,
        pageMeta(page, pageSize, total),
      );
    }),
  );

  return r;
}
