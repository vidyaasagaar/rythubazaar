import { Schema, model, type Types } from 'mongoose';

export interface ICart {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  items: { listingId: Types.ObjectId; quantity: number; addedAt: Date }[];
  updatedAt: Date;
}

const cartSchema = new Schema<ICart>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    items: {
      type: [
        new Schema(
          {
            listingId: { type: Schema.Types.ObjectId, ref: 'Listing', required: true },
            quantity: { type: Number, required: true, min: 1 },
            addedAt: { type: Date, default: () => new Date() },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { timestamps: true },
);
cartSchema.index({ userId: 1 }, { unique: true });

export const Cart = model<ICart>('Cart', cartSchema);
