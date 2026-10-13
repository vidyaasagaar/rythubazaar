import type { Role } from './roles';

// ---------- Listings ----------
export const LISTING_STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED'] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const LISTING_TRANSITIONS: Record<ListingStatus, readonly ListingStatus[]> = {
  DRAFT: ['ACTIVE', 'ARCHIVED'],
  ACTIVE: ['PAUSED', 'ARCHIVED'],
  PAUSED: ['ACTIVE', 'ARCHIVED'],
  ARCHIVED: [],
};

export const UNITS = ['KG', 'QUINTAL', 'DOZEN', 'PIECE', 'BUNCH'] as const;
export type Unit = (typeof UNITS)[number];

export const CATEGORIES = [
  'VEGETABLES',
  'FRUITS',
  'LEAFY_GREENS',
  'GRAINS_PULSES',
  'SPICES',
  'OTHER',
] as const;
export type Category = (typeof CATEGORIES)[number];

/**
 * Growing practice claims. Everything except a staff-verified certificate is
 * shown to buyers as "farmer-reported", never as verified.
 */
export const GROWING_PRACTICES = [
  'CONVENTIONAL',
  'NATURAL_FARMER_REPORTED',
  'ORGANIC_FARMER_REPORTED',
  'ORGANIC_CERTIFIED_CLAIMED',
] as const;
export type GrowingPractice = (typeof GROWING_PRACTICES)[number];

export const CERTIFICATION_STATUSES = ['NONE', 'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED'] as const;
export type CertificationStatus = (typeof CERTIFICATION_STATUSES)[number];

// ---------- Orders ----------
export const ORDER_STATUSES = [
  'PLACED',
  'CONFIRMED',
  'READY_FOR_COLLECTION',
  'COLLECTED',
  'DISPATCHED',
  'DELIVERED',
  'DELIVERY_FAILED',
  'CANCELLED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** The happy path, used for progress trackers. */
export const ORDER_PROGRESS: readonly OrderStatus[] = [
  'PLACED',
  'CONFIRMED',
  'READY_FOR_COLLECTION',
  'COLLECTED',
  'DISPATCHED',
  'DELIVERED',
];

export type OrderActor = 'CUSTOMER_OWNER' | 'FARMER_OWNER' | 'OPERATIONS';

export interface OrderTransitionRule {
  from: OrderStatus;
  to: OrderStatus;
  actors: readonly OrderActor[];
  requiresReason?: boolean;
  requiresAgent?: boolean;
  requiresCollection?: boolean;
}

export const ORDER_TRANSITIONS: readonly OrderTransitionRule[] = [
  { from: 'PLACED', to: 'CONFIRMED', actors: ['FARMER_OWNER', 'OPERATIONS'] },
  { from: 'CONFIRMED', to: 'READY_FOR_COLLECTION', actors: ['FARMER_OWNER', 'OPERATIONS'] },
  {
    from: 'READY_FOR_COLLECTION',
    to: 'COLLECTED',
    actors: ['OPERATIONS'],
    requiresAgent: true,
    requiresCollection: true,
  },
  { from: 'COLLECTED', to: 'DISPATCHED', actors: ['OPERATIONS'], requiresAgent: true },
  { from: 'DISPATCHED', to: 'DELIVERED', actors: ['OPERATIONS'] },
  { from: 'DISPATCHED', to: 'DELIVERY_FAILED', actors: ['OPERATIONS'], requiresReason: true },
  { from: 'DELIVERY_FAILED', to: 'DISPATCHED', actors: ['OPERATIONS'], requiresAgent: true },
  { from: 'PLACED', to: 'CANCELLED', actors: ['CUSTOMER_OWNER', 'FARMER_OWNER', 'OPERATIONS'] },
  { from: 'CONFIRMED', to: 'CANCELLED', actors: ['FARMER_OWNER', 'OPERATIONS'], requiresReason: true },
  { from: 'READY_FOR_COLLECTION', to: 'CANCELLED', actors: ['OPERATIONS'], requiresReason: true },
  { from: 'DELIVERY_FAILED', to: 'CANCELLED', actors: ['OPERATIONS'], requiresReason: true },
];

/** Statuses where reserved stock is still held for the order (not yet collected). */
export const ORDER_STATUSES_HOLDING_RESERVATION: readonly OrderStatus[] = [
  'PLACED',
  'CONFIRMED',
  'READY_FOR_COLLECTION',
];

/** Statuses where a delivery agent may be (re)assigned. */
export const ORDER_STATUSES_ASSIGNABLE: readonly OrderStatus[] = [
  'CONFIRMED',
  'READY_FOR_COLLECTION',
  'COLLECTED',
  'DELIVERY_FAILED',
];

export function findOrderTransition(from: OrderStatus, to: OrderStatus): OrderTransitionRule | undefined {
  return ORDER_TRANSITIONS.find((t) => t.from === from && t.to === to);
}

export function allowedOrderTransitions(from: OrderStatus, actor: OrderActor): OrderTransitionRule[] {
  return ORDER_TRANSITIONS.filter((t) => t.from === from && t.actors.includes(actor));
}

export function orderActorFor(role: Role, owns: { customer: boolean; farmer: boolean }): OrderActor | null {
  if (role === 'OPERATIONS' || role === 'ADMIN') return 'OPERATIONS';
  if (role === 'FARMER' && owns.farmer) return 'FARMER_OWNER';
  if (role === 'CUSTOMER' && owns.customer) return 'CUSTOMER_OWNER';
  return null;
}

// ---------- Payouts ----------
export const PAYOUT_STATUSES = ['PENDING', 'INITIATED', 'SUCCEEDED', 'FAILED'] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

/** USER = permission-checked admin action; PROVIDER = trusted provider result (or controlled mock). */
export const PAYOUT_TRANSITIONS: readonly {
  from: PayoutStatus;
  to: PayoutStatus;
  source: 'USER' | 'PROVIDER';
}[] = [
  { from: 'PENDING', to: 'INITIATED', source: 'USER' },
  { from: 'FAILED', to: 'INITIATED', source: 'USER' },
  { from: 'INITIATED', to: 'SUCCEEDED', source: 'PROVIDER' },
  { from: 'INITIATED', to: 'FAILED', source: 'PROVIDER' },
];

export function canTransitionPayout(
  from: PayoutStatus,
  to: PayoutStatus,
  source: 'USER' | 'PROVIDER',
): boolean {
  return PAYOUT_TRANSITIONS.some((t) => t.from === from && t.to === to && t.source === source);
}

// ---------- Returns ----------
export const RETURN_STATUSES = ['REQUESTED', 'APPROVED', 'REJECTED', 'REFUNDED'] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];
export const RETURN_TRANSITIONS: Record<ReturnStatus, readonly ReturnStatus[]> = {
  REQUESTED: ['APPROVED', 'REJECTED'],
  APPROVED: ['REFUNDED'],
  REJECTED: [],
  REFUNDED: [],
};
export const RETURN_REASONS = ['DAMAGED', 'WRONG_ITEM', 'QUALITY', 'MISSING', 'OTHER'] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];

// ---------- Support ----------
export const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

// ---------- Calls ----------
export const CALL_OUTCOMES = [
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'ABANDONED',
  'INTERRUPTED',
  'FAILED',
  'NOT_AVAILABLE',
] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

export const CALL_EVENT_KINDS = [
  'CALL_STARTED',
  'PROMPT',
  'KEYPAD',
  'SPEECH',
  'INTERPRETATION',
  'TOOL_REQUEST',
  'TOOL_RESULT',
  'BUSINESS_EVENT',
  'LANGUAGE_CHANGED',
  'ERROR',
  'CALL_ENDED',
  'DIAL_FAILED',
] as const;
export type CallEventKind = (typeof CALL_EVENT_KINDS)[number];

/** Lanes used by the audit center to separate what the caller did from what the system did. */
export const CALL_EVENT_LANE: Record<
  CallEventKind,
  'CALLER' | 'INTERPRETATION' | 'TOOL' | 'BUSINESS' | 'SYSTEM'
> = {
  KEYPAD: 'CALLER',
  SPEECH: 'CALLER',
  INTERPRETATION: 'INTERPRETATION',
  TOOL_REQUEST: 'TOOL',
  TOOL_RESULT: 'TOOL',
  BUSINESS_EVENT: 'BUSINESS',
  PROMPT: 'SYSTEM',
  CALL_STARTED: 'SYSTEM',
  CALL_ENDED: 'SYSTEM',
  LANGUAGE_CHANGED: 'SYSTEM',
  ERROR: 'SYSTEM',
  DIAL_FAILED: 'SYSTEM',
};

export const CALL_END_REASONS = ['HANGUP', 'INTERRUPTED'] as const;
export type CallEndReason = (typeof CALL_END_REASONS)[number];

// ---------- Errors ----------
export const ERROR_CODES = [
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'INVALID_CREDENTIALS',
  'EMAIL_TAKEN',
  'INSUFFICIENT_STOCK',
  'LISTING_UNAVAILABLE',
  'PRICE_CHANGED',
  'CART_EMPTY',
  'INVALID_TRANSITION',
  'IDEMPOTENCY_KEY_REQUIRED',
  'IDEMPOTENCY_KEY_REUSED',
  'REQUEST_IN_PROGRESS',
  'DATABASE_UNAVAILABLE',
  'RATE_LIMITED',
  'CSRF_FAILED',
  'NUMBER_NOT_AVAILABLE',
  'CALL_ENDED',
  'PROVIDER_UNAVAILABLE',
  'RETURN_NOT_ALLOWED',
  'PROFILE_REQUIRED',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_FILE',
  'INTERNAL_ERROR',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
