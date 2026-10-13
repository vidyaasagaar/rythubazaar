import { z } from 'zod';
import {
  CATEGORIES,
  CALL_END_REASONS,
  GROWING_PRACTICES,
  LISTING_STATUSES,
  ORDER_STATUSES,
  PAYOUT_STATUSES,
  RETURN_REASONS,
  RETURN_STATUSES,
  TICKET_STATUSES,
  UNITS,
  CERTIFICATION_STATUSES,
  CALL_OUTCOMES,
} from './domain';
import { LANGUAGE_CODES } from './i18n/languages';
import { ROLES, SELF_REGISTER_ROLES } from './roles';

export const objectIdSchema = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');
export const languageCodeSchema = z.enum(LANGUAGE_CODES);
export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email').max(254);
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number');
export const passwordSchema = z.string().min(10, 'Use at least 10 characters').max(128);
const nameSchema = z.string().trim().min(2).max(80);
const placeSchema = z.string().trim().min(2).max(80);
const pincodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter a 6-digit PIN code');
const isoDateSchema = z.string().date('Use YYYY-MM-DD');
export const uploadPathSchema = z
  .string()
  .regex(/^\/uploads\/[a-zA-Z0-9_-]{8,64}\.(jpg|png|webp)$/, 'Invalid image');

// ---------- Auth & profile ----------
export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: phoneSchema.optional(),
  password: passwordSchema,
  role: z.enum(SELF_REGISTER_ROLES),
  preferredLanguage: languageCodeSchema.default('en-IN'),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const updateMeSchema = z
  .object({
    name: nameSchema.optional(),
    phone: phoneSchema.optional(),
    preferredLanguage: languageCodeSchema.optional(),
  })
  .strict();

export const farmerProfileSchema = z.object({
  farmName: z.string().trim().max(100).optional().default(''),
  village: placeSchema,
  district: placeSchema,
  state: placeSchema,
  pincode: pincodeSchema,
  bio: z.string().trim().max(500).optional().default(''),
});
export type FarmerProfileInput = z.infer<typeof farmerProfileSchema>;

// ---------- Listings ----------
const certificationInputSchema = z.object({
  body: z.string().trim().min(2).max(100),
  certificateNumber: z.string().trim().min(2).max(60),
  validUntil: isoDateSchema,
});

export const listingBaseSchema = z.object({
  cropName: z.string().trim().min(2).max(80),
  category: z.enum(CATEGORIES),
  description: z.string().trim().max(1000).default(''),
  photos: z.array(uploadPathSchema).max(4).default([]),
  unit: z.enum(UNITS),
  pricePerUnitPaise: z.number().int().min(100, 'Minimum price is ₹1').max(10_000_000),
  quantityTotal: z.number().int().min(1).max(100_000),
  harvestDate: isoDateSchema.optional(),
  availableFrom: isoDateSchema.optional(),
  availableUntil: isoDateSchema.optional(),
  location: z.object({ village: placeSchema, district: placeSchema, state: placeSchema }).optional(),
  growingPractice: z.enum(GROWING_PRACTICES).default('CONVENTIONAL'),
  certification: certificationInputSchema.optional(),
});

function refineListing(v: Partial<z.infer<typeof listingBaseSchema>>, ctx: z.RefinementCtx): void {
  if (v.growingPractice === 'ORGANIC_CERTIFIED_CLAIMED' && !v.certification) {
    ctx.addIssue({ code: 'custom', path: ['certification'], message: 'Certificate details are required' });
  }
  if (v.availableFrom && v.availableUntil && v.availableUntil < v.availableFrom) {
    ctx.addIssue({ code: 'custom', path: ['availableUntil'], message: 'Must be on or after the start date' });
  }
}

export const listingCreateSchema = listingBaseSchema.superRefine(refineListing);
export type ListingCreateInput = z.infer<typeof listingCreateSchema>;
export const listingUpdateSchema = listingBaseSchema.partial().superRefine(refineListing);
export type ListingUpdateInput = z.infer<typeof listingUpdateSchema>;

export const listingStatusChangeSchema = z.object({ status: z.enum(LISTING_STATUSES) });

export const listingQuerySchema = z.object({
  q: z.string().trim().max(60).optional(),
  category: z.enum(CATEGORIES).optional(),
  district: z.string().trim().max(60).optional(),
  maxPricePaise: z.coerce.number().int().positive().optional(),
  availableOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v !== 'false'),
  sort: z.enum(['newest', 'price_asc', 'price_desc']).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(12),
});

export const certificationReviewSchema = z.object({
  decision: z.enum(['VERIFIED', 'REJECTED']),
  note: z.string().trim().max(300).optional(),
});

// ---------- Cart & checkout ----------
export const cartItemSchema = z.object({
  listingId: objectIdSchema,
  quantity: z.number().int().min(1).max(10_000),
});

export const addressSchema = z.object({
  recipientName: nameSchema,
  phone: phoneSchema,
  line1: z.string().trim().min(5).max(200),
  locality: placeSchema,
  district: placeSchema,
  state: placeSchema,
  pincode: pincodeSchema,
});
export type AddressInput = z.infer<typeof addressSchema>;

export const checkoutSchema = z.object({
  address: addressSchema,
  expectedTotalPaise: z.number().int().nonnegative(),
  paymentMode: z.literal('DEMO_PAY_ON_DELIVERY'),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

// ---------- Orders & operations ----------
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const orderTransitionSchema = z.object({
  to: z.enum(ORDER_STATUSES),
  reason: z.string().trim().max(300).optional(),
});

export const assignDeliverySchema = z.object({ agentId: objectIdSchema });

export const collectionSchema = z.object({
  quantitiesVerified: z.literal(true, {
    errorMap: () => ({ message: 'Confirm that quantities were checked' }),
  }),
  qualityGrade: z.enum(['A', 'B', 'C']),
  weightKg: z.number().positive().max(100_000).optional(),
  notes: z.string().trim().max(500).optional(),
  evidencePhoto: uploadPathSchema.optional(),
});
export type CollectionInput = z.infer<typeof collectionSchema>;

export const adminOrderQuerySchema = paginationSchema.extend({
  status: z.enum(ORDER_STATUSES).optional(),
  q: z.string().trim().max(40).optional(),
  farmerId: objectIdSchema.optional(),
  customerId: objectIdSchema.optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

// ---------- Returns ----------
export const returnRequestSchema = z.object({
  orderId: objectIdSchema,
  reason: z.enum(RETURN_REASONS),
  details: z.string().trim().max(500).optional().default(''),
});

export const returnReviewSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  note: z.string().trim().max(300).optional(),
});

export const returnQuerySchema = paginationSchema.extend({ status: z.enum(RETURN_STATUSES).optional() });

// ---------- Payouts ----------
export const payoutQuerySchema = paginationSchema.extend({
  status: z.enum(PAYOUT_STATUSES).optional(),
  farmerId: objectIdSchema.optional(),
});
export const payoutSimulateSchema = z
  .object({
    outcome: z.enum(['SUCCEEDED', 'FAILED']),
    failureReason: z.string().trim().max(200).optional(),
  })
  .refine((v) => v.outcome !== 'FAILED' || !!v.failureReason, {
    path: ['failureReason'],
    message: 'A failure reason is required',
  });

// ---------- Users ----------
export const roleChangeSchema = z.object({ role: z.enum(ROLES) });
export const userQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(80).optional(),
  role: z.enum(ROLES).optional(),
});

export const adminListingQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(60).optional(),
  status: z.enum(LISTING_STATUSES).optional(),
  certificationStatus: z.enum(CERTIFICATION_STATUSES).optional(),
  farmerId: objectIdSchema.optional(),
});

// ---------- Support ----------
export const supportTicketSchema = z.object({
  subject: z.string().trim().min(3).max(120),
  message: z.string().trim().min(5).max(2000),
  orderId: objectIdSchema.optional(),
});
export const ticketStatusSchema = z.object({ status: z.enum(TICKET_STATUSES) });

// ---------- Calls ----------
export const callCreateSchema = z.object({
  dialedCode: z
    .string()
    .trim()
    .regex(/^[0-9*#]{1,15}$/, 'Digits, * and # only'),
  language: languageCodeSchema.optional(),
});

export const callInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('DTMF'), value: z.string().regex(/^[0-9*#]{1,12}$/) }),
  z.object({ kind: z.literal('SPEECH'), value: z.string().trim().min(1).max(200) }),
  z.object({ kind: z.literal('LANGUAGE'), value: languageCodeSchema }),
  z.object({ kind: z.literal('REPEAT'), value: z.enum(['NORMAL', 'SLOW']) }),
]);
export type CallInput = z.infer<typeof callInputSchema>;

export const callEndSchema = z.object({ reason: z.enum(CALL_END_REASONS) });

export const callQuerySchema = paginationSchema.extend({
  callId: z.string().trim().max(64).optional(),
  dialedCode: z.string().trim().max(15).optional(),
  language: languageCodeSchema.optional(),
  outcome: z.enum(CALL_OUTCOMES).optional(),
  hasError: z.enum(['true', 'false']).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

export const auditQuerySchema = paginationSchema.extend({
  action: z.string().trim().max(60).optional(),
  category: z.enum(['BUSINESS', 'SECURITY', 'EXPORT', 'ADMIN']).optional(),
  resourceId: z.string().trim().max(64).optional(),
  correlationId: z.string().trim().max(64).optional(),
  outcome: z.enum(['SUCCESS', 'DENIED', 'FAILURE']).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

export const exportFormatSchema = z.enum(['json', 'csv', 'md']);
