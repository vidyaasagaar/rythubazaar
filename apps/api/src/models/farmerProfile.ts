import { Schema, model, type Types } from 'mongoose';

export interface IFarmerProfile {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  farmName: string;
  village: string;
  district: string;
  state: string;
  pincode: string;
  bio: string;
  createdAt: Date;
  updatedAt: Date;
}

const farmerProfileSchema = new Schema<IFarmerProfile>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    farmName: { type: String, default: '', maxlength: 100 },
    village: { type: String, required: true, maxlength: 80 },
    district: { type: String, required: true, maxlength: 80 },
    state: { type: String, required: true, maxlength: 80 },
    pincode: { type: String, required: true },
    bio: { type: String, default: '', maxlength: 500 },
  },
  { timestamps: true },
);
farmerProfileSchema.index({ userId: 1 }, { unique: true });
farmerProfileSchema.index({ district: 1 });

export const FarmerProfile = model<IFarmerProfile>('FarmerProfile', farmerProfileSchema);
