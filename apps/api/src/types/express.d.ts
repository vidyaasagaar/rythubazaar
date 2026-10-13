import type { Role } from '@rythubazaar/shared';
import type { Types } from 'mongoose';

export interface AuthUser {
  id: string;
  _id: Types.ObjectId;
  role: Role;
  name: string;
  preferredLanguage: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      correlationId: string;
    }
  }
}
