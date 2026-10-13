import { Schema, model, type Types } from 'mongoose';
import {
  PAYOUT_STATUSES,
  RETURN_REASONS,
  RETURN_STATUSES,
  TICKET_STATUSES,
  type PayoutStatus,
  type ReturnReason,
  type ReturnStatus,
  type TicketStatus,
} from '@rythubazaar/shared';
import { statusChangeSchema, type IStatusChange } from './listing';

// ---------- Stock movements ----------
export interface IStockMovement {
  _id: Types.ObjectId;
  listingId: Types.ObjectId;
  orderId?: Types.ObjectId | null;
  type: 'RESERVE' | 'RELEASE' | 'SELL';
  quantity: number;
  actorId?: Types.ObjectId | null;
  at: Date;
}
const stockMovementSchema = new Schema<IStockMovement>({
  listingId: { type: Schema.Types.ObjectId, ref: 'Listing', required: true },
  orderId: { type: Schema.Types.ObjectId, ref: 'Order', default: null },
  type: { type: String, enum: ['RESERVE', 'RELEASE', 'SELL'], required: true },
  quantity: { type: Number, required: true },
  actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  at: { type: Date, default: () => new Date() },
});
stockMovementSchema.index({ listingId: 1, at: -1 });
stockMovementSchema.index({ orderId: 1 });
export const StockMovement = model<IStockMovement>('StockMovement', stockMovementSchema);

// ---------- Delivery agents ----------
export interface IDeliveryAgent {
  _id: Types.ObjectId;
  name: string;
  phone: string;
  zone: string;
  active: boolean;
}
const deliveryAgentSchema = new Schema<IDeliveryAgent>(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true },
    zone: { type: String, required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);
export const DeliveryAgent = model<IDeliveryAgent>('DeliveryAgent', deliveryAgentSchema);

// ---------- Payouts ----------
export interface IPayoutHistory {
  from: PayoutStatus | null;
  to: PayoutStatus;
  at: Date;
  source: 'SYSTEM' | 'USER' | 'PROVIDER';
  actorId?: Types.ObjectId | null;
  note?: string;
}
export interface IPayout {
  _id: Types.ObjectId;
  farmerId: Types.ObjectId;
  orderId: Types.ObjectId;
  orderNumber: string;
  amountPaise: number;
  currency: 'INR';
  status: PayoutStatus;
  provider: 'MOCK';
  simulated: boolean;
  providerReference?: string | null;
  failureReason?: string | null;
  attempts: number;
  history: IPayoutHistory[];
  createdAt: Date;
  updatedAt: Date;
}
const payoutSchema = new Schema<IPayout>(
  {
    farmerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    orderNumber: { type: String, required: true },
    amountPaise: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },
    status: { type: String, enum: PAYOUT_STATUSES, default: 'PENDING' },
    provider: { type: String, default: 'MOCK' },
    simulated: { type: Boolean, default: true },
    providerReference: { type: String, default: null },
    failureReason: { type: String, default: null },
    attempts: { type: Number, default: 0 },
    history: {
      type: [
        new Schema(
          {
            from: { type: String, default: null },
            to: { type: String, required: true },
            at: { type: Date, required: true },
            source: { type: String, enum: ['SYSTEM', 'USER', 'PROVIDER'], required: true },
            actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
            note: String,
          },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { timestamps: true },
);
// One payout per order: protects against double payout creation.
payoutSchema.index({ orderId: 1 }, { unique: true });
payoutSchema.index({ farmerId: 1, createdAt: -1 });
payoutSchema.index({ status: 1, createdAt: -1 });
payoutSchema.index({ providerReference: 1 }, { sparse: true });
export const Payout = model<IPayout>('Payout', payoutSchema);

// ---------- Returns ----------
export interface IReturnRequest {
  _id: Types.ObjectId;
  orderId: Types.ObjectId;
  orderNumber: string;
  customerId: Types.ObjectId;
  farmerId: Types.ObjectId;
  reason: ReturnReason;
  details: string;
  status: ReturnStatus;
  refund: { amountPaise: number; mode: 'DEMO_NO_MONEY_MOVED'; recordedAt?: Date | null };
  /** Business rule: returns never claw back farmer payouts; the company bears the risk. */
  payoutImpact: 'NONE_COMPANY_BEARS_RISK';
  history: IStatusChange<ReturnStatus>[];
  createdAt: Date;
  updatedAt: Date;
}
const returnSchema = new Schema<IReturnRequest>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    orderNumber: { type: String, required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    farmerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, enum: RETURN_REASONS, required: true },
    details: { type: String, default: '', maxlength: 500 },
    status: { type: String, enum: RETURN_STATUSES, default: 'REQUESTED' },
    refund: {
      amountPaise: { type: Number, default: 0 },
      mode: { type: String, default: 'DEMO_NO_MONEY_MOVED' },
      recordedAt: { type: Date, default: null },
    },
    payoutImpact: { type: String, default: 'NONE_COMPANY_BEARS_RISK' },
    history: { type: [statusChangeSchema], default: [] },
  },
  { timestamps: true },
);
returnSchema.index({ orderId: 1 }, { unique: true });
returnSchema.index({ customerId: 1, createdAt: -1 });
returnSchema.index({ status: 1, createdAt: -1 });
export const ReturnRequest = model<IReturnRequest>('ReturnRequest', returnSchema);

// ---------- Support tickets ----------
export interface ISupportTicket {
  _id: Types.ObjectId;
  ticketNumber: string;
  userId: Types.ObjectId;
  subject: string;
  message: string;
  orderId?: Types.ObjectId | null;
  channel: 'WEB' | 'CALL';
  callId?: string | null;
  status: TicketStatus;
  history: IStatusChange<TicketStatus>[];
  createdAt: Date;
  updatedAt: Date;
}
const ticketSchema = new Schema<ISupportTicket>(
  {
    ticketNumber: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    subject: { type: String, required: true, maxlength: 120 },
    message: { type: String, required: true, maxlength: 2000 },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', default: null },
    channel: { type: String, enum: ['WEB', 'CALL'], default: 'WEB' },
    callId: { type: String, default: null },
    status: { type: String, enum: TICKET_STATUSES, default: 'OPEN' },
    history: { type: [statusChangeSchema], default: [] },
  },
  { timestamps: true },
);
ticketSchema.index({ ticketNumber: 1 }, { unique: true });
ticketSchema.index({ userId: 1, createdAt: -1 });
ticketSchema.index({ status: 1, createdAt: -1 });
export const SupportTicket = model<ISupportTicket>('SupportTicket', ticketSchema);

// ---------- Idempotency ----------
export interface IIdempotencyRecord {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  scope: string;
  key: string;
  requestHash: string;
  status: 'IN_PROGRESS' | 'COMPLETED';
  responseStatus?: number;
  responseBody?: unknown;
  createdAt: Date;
}
const idempotencySchema = new Schema<IIdempotencyRecord>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  scope: { type: String, required: true },
  key: { type: String, required: true },
  requestHash: { type: String, required: true },
  status: { type: String, enum: ['IN_PROGRESS', 'COMPLETED'], required: true },
  responseStatus: Number,
  responseBody: Schema.Types.Mixed,
  createdAt: { type: Date, default: () => new Date() },
});
idempotencySchema.index({ userId: 1, scope: 1, key: 1 }, { unique: true });
idempotencySchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 });
export const IdempotencyRecord = model<IIdempotencyRecord>('IdempotencyRecord', idempotencySchema);
