import { Schema, model, type Types } from 'mongoose';
import { ORDER_STATUSES, type OrderStatus, type Unit } from '@rythubazaar/shared';
import { statusChangeSchema, type IStatusChange } from './listing';

export interface IOrderItem {
  listingId: Types.ObjectId;
  cropName: string;
  unit: Unit;
  unitPricePaise: number;
  quantity: number;
  lineTotalPaise: number;
}

export interface IOrder {
  _id: Types.ObjectId;
  orderNumber: string;
  checkoutGroupId: string;
  customerId: Types.ObjectId;
  farmerId: Types.ObjectId;
  farmName: string;
  /** Immutable order-time snapshot. Never recomputed after creation. */
  items: IOrderItem[];
  pricing: {
    subtotalPaise: number;
    deliveryFeePaise: number;
    serviceFeePaise: number;
    discountPaise: number;
    totalPaise: number;
    farmerPayoutPaise: number;
    currency: 'INR';
  };
  deliveryAddress: {
    recipientName: string;
    phone: string;
    line1: string;
    locality: string;
    district: string;
    state: string;
    pincode: string;
  };
  payment: { mode: 'DEMO_PAY_ON_DELIVERY'; status: 'NOT_CHARGED_DEMO' };
  status: OrderStatus;
  statusHistory: IStatusChange<OrderStatus>[];
  delivery: {
    agentId?: Types.ObjectId | null;
    agentName?: string | null;
    agentPhone?: string | null;
    assignedAt?: Date | null;
    assignedBy?: Types.ObjectId | null;
    failedAttempts: number;
  };
  assignmentHistory: { agentId: Types.ObjectId; agentName: string; at: Date; actorId: Types.ObjectId }[];
  pickup: {
    collectedAt?: Date | null;
    collectedBy?: Types.ObjectId | null;
    quantitiesVerified?: boolean;
    qualityGrade?: 'A' | 'B' | 'C' | null;
    weightKg?: number | null;
    notes?: string | null;
    evidencePhoto?: string | null;
  };
  cancellationReason?: string | null;
  deliveredAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const orderSchema = new Schema<IOrder>(
  {
    orderNumber: { type: String, required: true },
    checkoutGroupId: { type: String, required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    farmerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    farmName: { type: String, default: '' },
    items: [
      new Schema(
        {
          listingId: { type: Schema.Types.ObjectId, ref: 'Listing', required: true },
          cropName: { type: String, required: true },
          unit: { type: String, required: true },
          unitPricePaise: { type: Number, required: true },
          quantity: { type: Number, required: true },
          lineTotalPaise: { type: Number, required: true },
        },
        { _id: false },
      ),
    ],
    pricing: {
      subtotalPaise: { type: Number, required: true },
      deliveryFeePaise: { type: Number, required: true },
      serviceFeePaise: { type: Number, required: true },
      discountPaise: { type: Number, required: true },
      totalPaise: { type: Number, required: true },
      farmerPayoutPaise: { type: Number, required: true },
      currency: { type: String, default: 'INR' },
    },
    deliveryAddress: {
      recipientName: String,
      phone: String,
      line1: String,
      locality: String,
      district: String,
      state: String,
      pincode: String,
    },
    payment: {
      mode: { type: String, default: 'DEMO_PAY_ON_DELIVERY' },
      status: { type: String, default: 'NOT_CHARGED_DEMO' },
    },
    status: { type: String, enum: ORDER_STATUSES, default: 'PLACED' },
    statusHistory: { type: [statusChangeSchema], default: [] },
    delivery: {
      agentId: { type: Schema.Types.ObjectId, ref: 'DeliveryAgent', default: null },
      agentName: { type: String, default: null },
      agentPhone: { type: String, default: null },
      assignedAt: { type: Date, default: null },
      assignedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      failedAttempts: { type: Number, default: 0 },
    },
    assignmentHistory: {
      type: [
        new Schema(
          {
            agentId: { type: Schema.Types.ObjectId, ref: 'DeliveryAgent', required: true },
            agentName: { type: String, required: true },
            at: { type: Date, required: true },
            actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    pickup: {
      collectedAt: { type: Date, default: null },
      collectedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      quantitiesVerified: { type: Boolean, default: false },
      qualityGrade: { type: String, enum: ['A', 'B', 'C', null], default: null },
      weightKg: { type: Number, default: null },
      notes: { type: String, default: null },
      evidencePhoto: { type: String, default: null },
    },
    cancellationReason: { type: String, default: null },
    deliveredAt: { type: Date, default: null },
  },
  { timestamps: true },
);
orderSchema.index({ orderNumber: 1 }, { unique: true });
orderSchema.index({ customerId: 1, createdAt: -1 });
orderSchema.index({ farmerId: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ checkoutGroupId: 1 });

export const Order = model<IOrder>('Order', orderSchema);
