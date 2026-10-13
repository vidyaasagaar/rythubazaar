import { Types, type ClientSession } from 'mongoose';
import {
  LISTING_TRANSITIONS,
  type ListingCreateInput,
  type ListingStatus,
  type ListingUpdateInput,
} from '@rythubazaar/shared';
import { FarmerProfile, Listing, User, availableQuantity, type IListing } from '../models';
import { AppError, Errors } from '../lib/errors';
import { audit } from './audit';
import type { AuthUser } from '../types/express';

const toDate = (d?: string) => (d ? new Date(`${d}T00:00:00.000Z`) : null);

function certificationFrom(
  input: Pick<ListingCreateInput, 'growingPractice' | 'certification'>,
): IListing['certification'] {
  if (input.growingPractice === 'ORGANIC_CERTIFIED_CLAIMED' && input.certification) {
    return {
      status: 'PENDING_VERIFICATION',
      body: input.certification.body,
      certificateNumber: input.certification.certificateNumber,
      validUntil: toDate(input.certification.validUntil),
      reviewedBy: null,
      reviewedAt: null,
    };
  }
  return { status: 'NONE' };
}

export async function requireFarmerProfile(farmerId: Types.ObjectId) {
  const profile = await FarmerProfile.findOne({ userId: farmerId }).lean();
  if (!profile) {
    throw new AppError(
      422,
      'PROFILE_REQUIRED',
      'Complete your farm profile (village, district, state) first',
    );
  }
  return profile;
}

export async function createListing(
  actor: AuthUser,
  input: ListingCreateInput,
  opts: { source: 'WEB' | 'CALL'; callId?: string; correlationId?: string; session?: ClientSession } = {
    source: 'WEB',
  },
) {
  const profile = await requireFarmerProfile(actor._id);
  const [listing] = await Listing.create(
    [
      {
        farmerId: actor._id,
        cropName: input.cropName,
        category: input.category,
        description: input.description,
        photos: input.photos,
        unit: input.unit,
        pricePerUnitPaise: input.pricePerUnitPaise,
        quantityTotal: input.quantityTotal,
        harvestDate: toDate(input.harvestDate),
        availableFrom: toDate(input.availableFrom),
        availableUntil: toDate(input.availableUntil),
        location: input.location ?? {
          village: profile.village,
          district: profile.district,
          state: profile.state,
        },
        growingPractice: input.growingPractice,
        certification: certificationFrom(input),
        // Listings always start as drafts; publishing is an explicit, separate action.
        status: 'DRAFT',
        source: opts.source,
        sourceCallId: opts.callId ?? null,
        statusHistory: [
          { from: null, to: 'DRAFT', at: new Date(), actorId: actor._id, actorRole: actor.role },
        ],
      },
    ],
    opts.session ? { session: opts.session } : {},
  );
  await audit(
    {
      category: 'BUSINESS',
      action: 'LISTING_CREATED',
      outcome: 'SUCCESS',
      actor,
      resourceType: 'Listing',
      resourceId: listing!._id.toString(),
      correlationId: opts.correlationId,
      details: { source: opts.source, callId: opts.callId ?? null, status: 'DRAFT' },
    },
    opts.session,
  );
  return listing!;
}

async function loadOwned(actor: AuthUser, listingId: string) {
  if (!Types.ObjectId.isValid(listingId)) throw Errors.notFound('Listing');
  const listing = await Listing.findById(listingId);
  if (!listing) throw Errors.notFound('Listing');
  if (!listing.farmerId.equals(actor._id)) return { listing, owned: false as const };
  return { listing, owned: true as const };
}

export async function getOwnedListing(actor: AuthUser, listingId: string, onDenied: () => never) {
  const { listing, owned } = await loadOwned(actor, listingId);
  if (!owned) onDenied();
  return listing;
}

export async function updateListing(
  actor: AuthUser,
  listingId: string,
  input: ListingUpdateInput,
  onDenied: () => never,
  correlationId?: string,
) {
  const listing = await getOwnedListing(actor, listingId, onDenied);
  if (listing.status === 'ARCHIVED')
    throw Errors.conflict('INVALID_TRANSITION', 'Archived listings cannot be edited');

  if (input.quantityTotal !== undefined) {
    const committed = listing.quantityReserved + listing.quantitySold;
    if (input.quantityTotal < committed) {
      throw Errors.unprocessable(
        'VALIDATION_FAILED',
        `Quantity cannot be below ${committed} (already reserved or sold)`,
        [{ path: 'quantityTotal', message: `Minimum is ${committed}` }],
      );
    }
  }
  const practice = input.growingPractice ?? listing.growingPractice;
  if (
    practice === 'ORGANIC_CERTIFIED_CLAIMED' &&
    !input.certification &&
    listing.certification.status === 'NONE'
  ) {
    throw Errors.validation([{ path: 'certification', message: 'Certificate details are required' }]);
  }

  const simple = [
    'cropName',
    'category',
    'description',
    'photos',
    'unit',
    'pricePerUnitPaise',
    'quantityTotal',
    'location',
  ] as const;
  for (const key of simple) {
    if (input[key] !== undefined) listing.set(key, input[key]);
  }
  if (input.harvestDate !== undefined) listing.harvestDate = toDate(input.harvestDate);
  if (input.availableFrom !== undefined) listing.availableFrom = toDate(input.availableFrom);
  if (input.availableUntil !== undefined) listing.availableUntil = toDate(input.availableUntil);
  if (input.growingPractice !== undefined) listing.growingPractice = input.growingPractice;
  // Any change to the certificate claim resets verification: staff must check it again.
  if (input.growingPractice !== undefined || input.certification !== undefined) {
    listing.certification = certificationFrom({
      growingPractice: practice,
      certification: input.certification,
    }) as never;
  }
  await listing.save();
  await audit({
    category: 'BUSINESS',
    action: 'LISTING_UPDATED',
    outcome: 'SUCCESS',
    actor,
    resourceType: 'Listing',
    resourceId: listing._id.toString(),
    correlationId,
    details: { fields: Object.keys(input) },
  });
  return listing;
}

export async function changeListingStatus(
  actor: AuthUser,
  listingId: string,
  to: ListingStatus,
  onDenied: () => never,
  correlationId?: string,
) {
  const listing = await getOwnedListing(actor, listingId, onDenied);
  const from = listing.status;
  if (!LISTING_TRANSITIONS[from].includes(to)) throw Errors.invalidTransition(from, to);
  if (to === 'ACTIVE') {
    if (listing.pricePerUnitPaise < 100 || listing.quantityTotal < 1) {
      throw Errors.unprocessable('VALIDATION_FAILED', 'Set a price and quantity before publishing');
    }
  }
  // Conditional update guards against concurrent status changes.
  const updated = await Listing.findOneAndUpdate(
    { _id: listing._id, status: from },
    {
      $set: { status: to },
      $push: { statusHistory: { from, to, at: new Date(), actorId: actor._id, actorRole: actor.role } },
    },
    { new: true },
  );
  if (!updated) throw Errors.conflict('INVALID_TRANSITION', 'Listing changed; reload and try again');
  await audit({
    category: 'BUSINESS',
    action: 'LISTING_STATUS_CHANGED',
    outcome: 'SUCCESS',
    actor,
    resourceType: 'Listing',
    resourceId: listing._id.toString(),
    correlationId,
    details: { from, to },
  });
  return updated;
}

/** Shape for buyers: no internal history, explicit claim basis, computed availability. */
export function toPublicListing(
  l: IListing,
  farmer?: { name: string; farmName?: string; createdAt?: Date } | null,
) {
  return {
    id: l._id.toString(),
    cropName: l.cropName,
    category: l.category,
    description: l.description,
    photos: l.photos,
    unit: l.unit,
    pricePerUnitPaise: l.pricePerUnitPaise,
    quantityAvailable: availableQuantity(l),
    harvestDate: l.harvestDate ?? null,
    availableFrom: l.availableFrom ?? null,
    availableUntil: l.availableUntil ?? null,
    location: l.location,
    growingPractice: l.growingPractice,
    claim: {
      basis: l.certification.status === 'VERIFIED' ? 'STAFF_VERIFIED_CERTIFICATE' : 'FARMER_REPORTED',
      certificationStatus: l.certification.status,
      body: l.certification.status === 'VERIFIED' ? l.certification.body : undefined,
      certificateNumber:
        l.certification.status === 'VERIFIED' ? l.certification.certificateNumber : undefined,
      verifiedAt: l.certification.status === 'VERIFIED' ? l.certification.reviewedAt : undefined,
    },
    status: l.status,
    purchasable: l.status === 'ACTIVE' && availableQuantity(l) > 0 && !isExpired(l),
    farmer: farmer
      ? {
          id: l.farmerId.toString(),
          name: farmer.name,
          farmName: farmer.farmName || null,
          sellingSince: farmer.createdAt ?? null,
        }
      : { id: l.farmerId.toString() },
    createdAt: l.createdAt,
  };
}

export function isExpired(l: Pick<IListing, 'availableUntil'>): boolean {
  if (!l.availableUntil) return false;
  const end = new Date(l.availableUntil);
  end.setUTCDate(end.getUTCDate() + 1);
  return end.getTime() < Date.now();
}

/** Attach farmer display info for a batch of listings in two queries. */
export async function withFarmers(listings: IListing[]) {
  const ids = [...new Set(listings.map((l) => l.farmerId.toString()))].map((id) => new Types.ObjectId(id));
  const [users, profiles] = await Promise.all([
    User.find({ _id: { $in: ids } }, { name: 1, createdAt: 1 }).lean(),
    FarmerProfile.find({ userId: { $in: ids } }, { userId: 1, farmName: 1 }).lean(),
  ]);
  const byId = new Map(users.map((u) => [u._id.toString(), u]));
  const farmById = new Map(profiles.map((p) => [p.userId.toString(), p.farmName]));
  return listings.map((l) => {
    const u = byId.get(l.farmerId.toString());
    return toPublicListing(
      l,
      u ? { name: u.name, farmName: farmById.get(l.farmerId.toString()), createdAt: u.createdAt } : null,
    );
  });
}

/** Owner/staff shape including stock breakdown and history. */
export function toOwnerListing(l: IListing) {
  return {
    ...toPublicListing(l),
    quantityTotal: l.quantityTotal,
    quantityReserved: l.quantityReserved,
    quantitySold: l.quantitySold,
    certification: l.certification,
    source: l.source,
    sourceCallId: l.sourceCallId ?? null,
    statusHistory: l.statusHistory,
    updatedAt: l.updatedAt,
  };
}
