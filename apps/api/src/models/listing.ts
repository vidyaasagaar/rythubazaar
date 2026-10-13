import { Schema, model, type Types } from 'mongoose';
import {
  CATEGORIES,
  CERTIFICATION_STATUSES,
  GROWING_PRACTICES,
  LISTING_STATUSES,
  UNITS,
  type Category,
  type CertificationStatus,
  type GrowingPractice,
  type ListingStatus,
  type Unit,
} from '@rythubazaar/shared';

export interface IStatusChange<S extends string = string> {
  from: S | null;
  to: S;
  at: Date;
  actorId?: Types.ObjectId | null;
  actorRole?: string | null;
  note?: string;
}

export interface IListing {
  _id: Types.ObjectId;
  farmerId: Types.ObjectId;
  cropName: string;
  category: Category;
  description: string;
  photos: string[];
  unit: Unit;
  pricePerUnitPaise: number;
  quantityTotal: number;
  quantityReserved: number;
  quantitySold: number;
  harvestDate?: Date | null;
  availableFrom?: Date | null;
  availableUntil?: Date | null;
  location: { village: string; district: string; state: string };
  growingPractice: GrowingPractice;
  certification: {
    status: CertificationStatus;
    body?: string;
    certificateNumber?: string;
    validUntil?: Date | null;
    reviewedBy?: Types.ObjectId | null;
    reviewedAt?: Date | null;
    reviewNote?: string;
  };
  status: ListingStatus;
  source: 'WEB' | 'CALL';
  sourceCallId?: string | null;
  statusHistory: IStatusChange<ListingStatus>[];
  createdAt: Date;
  updatedAt: Date;
}

export const statusChangeSchema = new Schema(
  {
    from: { type: String, default: null },
    to: { type: String, required: true },
    at: { type: Date, required: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    actorRole: { type: String, default: null },
    note: { type: String, maxlength: 300 },
  },
  { _id: false },
);

const listingSchema = new Schema<IListing>(
  {
    farmerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    cropName: { type: String, required: true, maxlength: 80 },
    category: { type: String, enum: CATEGORIES, required: true },
    description: { type: String, default: '', maxlength: 1000 },
    photos: { type: [String], default: [] },
    unit: { type: String, enum: UNITS, required: true },
    pricePerUnitPaise: { type: Number, required: true, min: 100 },
    quantityTotal: { type: Number, required: true, min: 0 },
    quantityReserved: { type: Number, default: 0, min: 0 },
    quantitySold: { type: Number, default: 0, min: 0 },
    harvestDate: { type: Date, default: null },
    availableFrom: { type: Date, default: null },
    availableUntil: { type: Date, default: null },
    location: {
      village: { type: String, required: true },
      district: { type: String, required: true },
      state: { type: String, required: true },
    },
    growingPractice: { type: String, enum: GROWING_PRACTICES, default: 'CONVENTIONAL' },
    certification: {
      status: { type: String, enum: CERTIFICATION_STATUSES, default: 'NONE' },
      body: String,
      certificateNumber: String,
      validUntil: { type: Date, default: null },
      reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      reviewedAt: { type: Date, default: null },
      reviewNote: String,
    },
    status: { type: String, enum: LISTING_STATUSES, default: 'DRAFT' },
    source: { type: String, enum: ['WEB', 'CALL'], default: 'WEB' },
    sourceCallId: { type: String, default: null },
    statusHistory: { type: [statusChangeSchema], default: [] },
  },
  { timestamps: true },
);
listingSchema.index({ farmerId: 1, status: 1, createdAt: -1 });
listingSchema.index({ status: 1, category: 1, createdAt: -1 });
listingSchema.index({ status: 1, pricePerUnitPaise: 1 });
listingSchema.index({ 'location.district': 1 });
listingSchema.index({ 'certification.status': 1 });

export const Listing = model<IListing>('Listing', listingSchema);

export function availableQuantity(
  l: Pick<IListing, 'quantityTotal' | 'quantityReserved' | 'quantitySold'>,
): number {
  return Math.max(0, l.quantityTotal - l.quantityReserved - l.quantitySold);
}
