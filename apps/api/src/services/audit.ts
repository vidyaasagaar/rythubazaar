import type { ClientSession } from 'mongoose';
import type { Request } from 'express';
import { AuditLog, type AuditCategory, type AuditOutcome } from '../models';
import { logger } from '../lib/logger';
import type { AuthUser } from '../types/express';

export interface AuditEntry {
  category: AuditCategory;
  action: string;
  outcome: AuditOutcome;
  actor?: AuthUser | 'SYSTEM' | 'PROVIDER' | null;
  resourceType?: string;
  resourceId?: string;
  correlationId?: string;
  requestId?: string;
  details?: Record<string, unknown>;
}

/** Append an audit record. Never include secrets or raw personal data in `details`. */
export async function audit(entry: AuditEntry, session?: ClientSession): Promise<void> {
  const actor = entry.actor;
  const doc = {
    category: entry.category,
    action: entry.action,
    outcome: entry.outcome,
    actorType:
      actor === 'SYSTEM' ? 'SYSTEM' : actor === 'PROVIDER' ? 'PROVIDER' : actor ? 'USER' : 'ANONYMOUS',
    actorId: actor && typeof actor === 'object' ? actor._id : null,
    actorRole: actor && typeof actor === 'object' ? actor.role : null,
    resourceType: entry.resourceType ?? null,
    resourceId: entry.resourceId ?? null,
    correlationId: entry.correlationId ?? null,
    requestId: entry.requestId ?? null,
    details: entry.details ?? {},
    at: new Date(),
  };
  await AuditLog.create([doc], session ? { session } : {});
}

/** Fire-and-forget variant for non-transactional security logging; failures are logged, not thrown. */
export function auditAsync(entry: AuditEntry): void {
  audit(entry).catch((err: unknown) =>
    logger.error({ err, action: entry.action }, 'Failed to write audit log'),
  );
}

export function requestAuditContext(req: Request): Pick<AuditEntry, 'actor' | 'correlationId' | 'requestId'> {
  return { actor: req.user ?? null, correlationId: req.correlationId, requestId: String(req.id) };
}
