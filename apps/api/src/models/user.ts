import { Schema, model, type Types } from 'mongoose';
import { LANGUAGE_CODES, ROLES, type LanguageCode, type Role } from '@rythubazaar/shared';

export interface IUser {
  _id: Types.ObjectId;
  name: string;
  email: string;
  phone?: string;
  passwordHash: string;
  role: Role;
  preferredLanguage: LanguageCode;
  status: 'ACTIVE' | 'DISABLED';
  /** Bumped on role change to invalidate existing sessions. */
  sessionVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    phone: { type: String, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true },
    preferredLanguage: { type: String, enum: LANGUAGE_CODES, default: 'en-IN' },
    status: { type: String, enum: ['ACTIVE', 'DISABLED'], default: 'ACTIVE' },
    sessionVersion: { type: Number, default: 0 },
  },
  { timestamps: true },
);
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ role: 1, createdAt: -1 });

export const User = model<IUser>('User', userSchema);

export function publicUser(
  u: Pick<IUser, '_id' | 'name' | 'email' | 'phone' | 'role' | 'preferredLanguage'>,
) {
  return {
    id: u._id.toString(),
    name: u.name,
    email: u.email,
    phone: u.phone ?? null,
    role: u.role,
    preferredLanguage: u.preferredLanguage,
  };
}
