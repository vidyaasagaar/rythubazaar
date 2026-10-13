import { Router } from 'express';
import { Types } from 'mongoose';
import { LANGUAGE_LIST, listingQuerySchema } from '@rythubazaar/shared';
import { Listing } from '../models';
import { Errors } from '../lib/errors';
import { isDbConnected, supportsTransactions } from '../lib/db';
import { ah, escapeRegex, ok, pageMeta, parse } from '../lib/http';
import { withFarmers } from '../services/listings';
import type { AppDeps } from '../context';

export function healthRouter() {
  const r = Router();
  r.get('/health', (_req, res) => ok(res, { status: 'ok', uptimeSec: Math.round(process.uptime()) }));
  r.get('/ready', (_req, res) => {
    const db = isDbConnected();
    res.status(db ? 200 : 503).json({
      data: {
        status: db ? 'ready' : 'not_ready',
        database: db ? 'connected' : 'unavailable',
        transactions: supportsTransactions(),
      },
    });
  });
  return r;
}

export function publicRouter(deps: AppDeps) {
  const r = Router();

  /** Non-secret runtime configuration the web app needs, including honest provider modes. */
  r.get('/config', (_req, res) =>
    ok(res, {
      demoDialCodes: deps.telephony.listDemoCodes(),
      telephonyMode: deps.telephony.mode,
      placesRealCalls: deps.telephony.placesRealCalls,
      interpreter: deps.interpreter.name,
      paymentMode: 'DEMO_PAY_ON_DELIVERY',
      payoutProvider: { name: deps.payouts.name, simulated: deps.payouts.simulated },
      notifications: deps.notifier.mode,
      audioRecording: 'DISABLED',
      fees: deps.fees,
      farmerCommissionBps: 0,
      returnWindowHours: deps.env.RETURN_WINDOW_HOURS,
      languages: LANGUAGE_LIST.map((l) => ({
        code: l.code,
        nativeName: l.nativeName,
        englishName: l.englishName,
        speechLocale: l.speechLocale,
        ttsLocale: l.ttsLocale,
        capabilities: l.capabilities,
      })),
    }),
  );

  r.get(
    '/listings',
    ah(async (req, res) => {
      const q = parse(listingQuerySchema, req.query);
      const filter: Record<string, unknown> = { status: 'ACTIVE' };
      if (q.q) filter.cropName = { $regex: escapeRegex(q.q), $options: 'i' };
      if (q.category) filter.category = q.category;
      if (q.district) filter['location.district'] = { $regex: `^${escapeRegex(q.district)}`, $options: 'i' };
      if (q.maxPricePaise) filter.pricePerUnitPaise = { $lte: q.maxPricePaise };
      if (q.availableOnly) {
        filter.$expr = { $gt: ['$quantityTotal', { $add: ['$quantityReserved', '$quantitySold'] }] };
        filter.$or = [
          { availableUntil: null },
          { availableUntil: { $gte: new Date(Date.now() - 24 * 3600 * 1000) } },
        ];
      }
      const sort: Record<string, 1 | -1> =
        q.sort === 'price_asc'
          ? { pricePerUnitPaise: 1 }
          : q.sort === 'price_desc'
            ? { pricePerUnitPaise: -1 }
            : { createdAt: -1 };
      const [items, total] = await Promise.all([
        Listing.find(filter)
          .sort(sort)
          .skip((q.page - 1) * q.pageSize)
          .limit(q.pageSize)
          .lean(),
        Listing.countDocuments(filter),
      ]);
      ok(res, await withFarmers(items), 200, pageMeta(q.page, q.pageSize, total));
    }),
  );

  r.get(
    '/listings/:id',
    ah(async (req, res) => {
      if (!Types.ObjectId.isValid(req.params.id)) throw Errors.notFound('Listing');
      const listing = await Listing.findById(req.params.id).lean();
      // Drafts and archived listings are not public.
      if (!listing || !['ACTIVE', 'PAUSED'].includes(listing.status)) throw Errors.notFound('Listing');
      const [view] = await withFarmers([listing]);
      ok(res, view);
    }),
  );

  return r;
}
