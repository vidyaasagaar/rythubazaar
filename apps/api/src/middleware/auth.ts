import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { hasPermission, type Permission } from '@rythubazaar/shared';
import { User } from '../models';
import { Errors } from '../lib/errors';
import { logger } from '../lib/logger';
import { auditAsync } from '../services/audit';
import type { Env } from '../config/env';

export const SESSION_COOKIE = 'rb_session';

interface SessionPayload {
  sub: string;
  sv: number;
}

export function signSession(env: Env, userId: string, sessionVersion: number): string {
  return jwt.sign({ sub: userId, sv: sessionVersion } satisfies SessionPayload, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: `${env.SESSION_TTL_HOURS}h`,
  });
}

export function sessionCookieOptions(env: Env) {
  return {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: env.SESSION_TTL_HOURS * 60 * 60 * 1000,
  };
}

/**
 * Resolve the session cookie into req.user. The role always comes from the database,
 * never from the token or the browser, so role changes take effect immediately.
 */
export function authenticate(env: Env) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
    if (!token) return next();
    try {
      const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as SessionPayload;
      const user = await User.findById(payload.sub).lean();
      if (user && user.status === 'ACTIVE' && user.sessionVersion === payload.sv) {
        req.user = {
          id: user._id.toString(),
          _id: user._id,
          role: user.role,
          name: user.name,
          preferredLanguage: user.preferredLanguage,
        };
      }
    } catch (err) {
      if (!(err instanceof jwt.JsonWebTokenError)) return next(err);
      // Invalid/expired token: treat as anonymous.
    }
    next();
  };
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(Errors.unauthenticated());
  next();
}

function deny(req: Request, permission: string) {
  logger.warn(
    { event: 'access_denied', userId: req.user?.id, role: req.user?.role, permission, path: req.originalUrl },
    'Access denied',
  );
  auditAsync({
    category: 'SECURITY',
    action: 'ACCESS_DENIED',
    outcome: 'DENIED',
    actor: req.user ?? null,
    correlationId: req.correlationId,
    requestId: String(req.id),
    details: { permission, method: req.method, path: req.baseUrl + req.path },
  });
}

export function requirePermission(permission: Permission) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(Errors.unauthenticated());
    if (!hasPermission(req.user.role, permission)) {
      deny(req, permission);
      return next(Errors.forbidden());
    }
    next();
  };
}

/** Use inside handlers for ownership checks; logs and audits the denial. */
export function denyOwnership(req: Request, resource: string): never {
  deny(req, `ownership:${resource}`);
  throw Errors.forbidden(`You do not have access to this ${resource}`);
}
