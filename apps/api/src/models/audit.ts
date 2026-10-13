import { Schema, model, type Types } from 'mongoose';

export type AuditCategory = 'BUSINESS' | 'SECURITY' | 'EXPORT' | 'ADMIN';
export type AuditOutcome = 'SUCCESS' | 'DENIED' | 'FAILURE';

export interface IAuditLog {
  _id: Types.ObjectId;
  at: Date;
  category: AuditCategory;
  action: string;
  outcome: AuditOutcome;
  actorType: 'USER' | 'SYSTEM' | 'PROVIDER' | 'ANONYMOUS';
  actorId?: Types.ObjectId | null;
  actorRole?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  correlationId?: string | null;
  requestId?: string | null;
  details?: Record<string, unknown>;
}

const auditSchema = new Schema<IAuditLog>(
  {
    at: { type: Date, default: () => new Date() },
    category: { type: String, enum: ['BUSINESS', 'SECURITY', 'EXPORT', 'ADMIN'], required: true },
    action: { type: String, required: true },
    outcome: { type: String, enum: ['SUCCESS', 'DENIED', 'FAILURE'], required: true },
    actorType: { type: String, enum: ['USER', 'SYSTEM', 'PROVIDER', 'ANONYMOUS'], required: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    actorRole: { type: String, default: null },
    resourceType: { type: String, default: null },
    resourceId: { type: String, default: null },
    correlationId: { type: String, default: null },
    requestId: { type: String, default: null },
    details: { type: Schema.Types.Mixed, default: {} },
  },
  { versionKey: false },
);
auditSchema.index({ at: -1 });
auditSchema.index({ action: 1, at: -1 });
auditSchema.index({ resourceId: 1, at: -1 });
auditSchema.index({ correlationId: 1 });
auditSchema.index({ category: 1, outcome: 1, at: -1 });

// Append-only: application code may insert audit records but never modify or delete them.
// Corrections are recorded as new events.
const blocked = function (this: unknown, next: (err?: Error) => void) {
  next(new Error('Audit log is append-only'));
};
for (const op of [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'findOneAndReplace',
  'replaceOne',
  'deleteOne',
  'deleteMany',
  'findOneAndDelete',
] as const) {
  auditSchema.pre(op, blocked);
}

export const AuditLog = model<IAuditLog>('AuditLog', auditSchema);
