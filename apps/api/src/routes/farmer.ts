import { Router } from 'express';
import { z } from 'zod';
import {
  LISTING_STATUSES,
  ORDER_STATUSES,
  farmerProfileSchema,
  listingCreateSchema,
  listingStatusChangeSchema,
  listingUpdateSchema,
  orderTransitionSchema,
  paginationSchema,
} from '@rythubazaar/shared';
import { FarmerProfile, Listing, Order, Payout } from '../models';
import { ah, ok, pageMeta, parse } from '../lib/http';
import { denyOwnership, requirePermission } from '../middleware/auth';
import {
  changeListingStatus,
  createListing,
  getOwnedListing,
  toOwnerListing,
  updateListing,
} from '../services/listings';
import { presentOrder, transitionOrder } from '../services/orders';
import { presentPayout } from '../services/payouts';
import { audit } from '../services/audit';
import type { AppDeps } from '../context';

export function farmerRouter(deps: AppDeps) {
  const r = Router();
  const guard = requirePermission('listings:manage:own');

  // ---------- Profile ----------
  r.get(
    '/profile',
    requirePermission('profile:farmer'),
    ah(async (req, res) => {
      const profile = await FarmerProfile.findOne({ userId: req.user!._id }).lean();
      ok(res, profile ? { ...profile, id: profile._id.toString(), userId: profile.userId.toString() } : null);
    }),
  );

  r.put(
    '/profile',
    requirePermission('profile:farmer'),
    ah(async (req, res) => {
      const input = parse(farmerProfileSchema, req.body);
      const profile = await FarmerProfile.findOneAndUpdate(
        { userId: req.user!._id },
        { $set: input, $setOnInsert: { userId: req.user!._id } },
        { upsert: true, new: true },
      ).lean();
      await audit({
        category: 'BUSINESS',
        action: 'FARMER_PROFILE_UPDATED',
        outcome: 'SUCCESS',
        actor: req.user!,
        resourceType: 'FarmerProfile',
        resourceId: profile!._id.toString(),
        correlationId: req.correlationId,
      });
      ok(res, { ...profile, id: profile!._id.toString() });
    }),
  );

  // ---------- Overview ----------
  r.get(
    '/overview',
    guard,
    ah(async (req, res) => {
      const farmerId = req.user!._id;
      const [activeListings, draftListings, openOrders, payoutAgg, recent, hasProfile] = await Promise.all([
        Listing.countDocuments({ farmerId, status: 'ACTIVE' }),
        Listing.countDocuments({ farmerId, status: 'DRAFT' }),
        Order.countDocuments({ farmerId, status: { $in: ['PLACED', 'CONFIRMED', 'READY_FOR_COLLECTION'] } }),
        Payout.aggregate<{ _id: string; amount: number; count: number }>([
          { $match: { farmerId } },
          { $group: { _id: '$status', amount: { $sum: '$amountPaise' }, count: { $sum: 1 } } },
        ]),
        Order.find({ farmerId }).sort({ createdAt: -1 }).limit(5),
        FarmerProfile.exists({ userId: farmerId }),
      ]);
      const byStatus = Object.fromEntries(
        payoutAgg.map((p) => [p._id, { amountPaise: p.amount, count: p.count }]),
      );
      ok(res, {
        activeListings,
        draftListings,
        openOrders,
        payouts: byStatus,
        profileComplete: !!hasProfile,
        recentOrders: recent.map((o) => presentOrder(o.toObject(), req.user!)),
      });
    }),
  );

  // ---------- Listings ----------
  r.get(
    '/listings',
    guard,
    ah(async (req, res) => {
      const q = parse(paginationSchema.extend({ status: z.enum(LISTING_STATUSES).optional() }), req.query);
      const filter: Record<string, unknown> = { farmerId: req.user!._id };
      if (q.status) filter.status = q.status;
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
    '/listings',
    guard,
    ah(async (req, res) => {
      const input = parse(listingCreateSchema, req.body);
      const listing = await createListing(req.user!, input, {
        source: 'WEB',
        correlationId: req.correlationId,
      });
      ok(res, toOwnerListing(listing.toObject()), 201);
    }),
  );

  r.get(
    '/listings/:id',
    guard,
    ah(async (req, res) => {
      const listing = await getOwnedListing(req.user!, req.params.id, () => denyOwnership(req, 'listing'));
      ok(res, toOwnerListing(listing.toObject()));
    }),
  );

  r.patch(
    '/listings/:id',
    guard,
    ah(async (req, res) => {
      const input = parse(listingUpdateSchema, req.body);
      const listing = await updateListing(
        req.user!,
        req.params.id,
        input,
        () => denyOwnership(req, 'listing'),
        req.correlationId,
      );
      ok(res, toOwnerListing(listing.toObject()));
    }),
  );

  r.post(
    '/listings/:id/status',
    guard,
    ah(async (req, res) => {
      const { status } = parse(listingStatusChangeSchema, req.body);
      const listing = await changeListingStatus(
        req.user!,
        req.params.id,
        status,
        () => denyOwnership(req, 'listing'),
        req.correlationId,
      );
      ok(res, toOwnerListing(listing.toObject()));
    }),
  );

  // ---------- Orders ----------
  r.get(
    '/orders',
    requirePermission('orders:read:farmer'),
    ah(async (req, res) => {
      const q = parse(paginationSchema.extend({ status: z.enum(ORDER_STATUSES).optional() }), req.query);
      const filter: Record<string, unknown> = { farmerId: req.user!._id };
      if (q.status) filter.status = q.status;
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

  r.post(
    '/orders/:id/transition',
    requirePermission('orders:transition:farmer'),
    ah(async (req, res) => {
      const input = parse(orderTransitionSchema, req.body);
      const order = await transitionOrder(
        req.user!,
        req.params.id,
        input.to,
        { reason: input.reason, correlationId: req.correlationId, notifier: deps.notifier },
        () => denyOwnership(req, 'order'),
      );
      ok(res, presentOrder(order.toObject(), req.user!));
    }),
  );

  // ---------- Payouts ----------
  r.get(
    '/payouts',
    requirePermission('payouts:read:own'),
    ah(async (req, res) => {
      const { page, pageSize } = parse(paginationSchema, req.query);
      const filter = { farmerId: req.user!._id };
      const [rows, total] = await Promise.all([
        Payout.find(filter)
          .sort({ createdAt: -1 })
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .lean(),
        Payout.countDocuments(filter),
      ]);
      ok(res, rows.map(presentPayout), 200, pageMeta(page, pageSize, total));
    }),
  );

  return r;
}
