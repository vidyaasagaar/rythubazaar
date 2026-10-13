import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { AppError } from '../lib/errors';
import { isDbConnected } from '../lib/db';
import type { Env } from '../config/env';

export const CSRF_COOKIE = 'rb_csrf';
export const CSRF_HEADER = 'x-csrf-token';

/** Correlation ID ties together related operations (e.g. every request in one call session). */
export function correlation(req: Request, res: Response, next: NextFunction) {
  const incoming = req.get('x-correlation-id');
  req.correlationId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  res.setHeader('x-correlation-id', req.correlationId);
  next();
}

export function newCsrfToken(): string {
  return randomBytes(24).toString('base64url');
}

export function csrfCookieOptions(env: Env) {
  // Readable by the page (double-submit pattern), but SameSite keeps it first-party.
  return { httpOnly: false, secure: env.cookieSecure, sameSite: 'lax' as const, path: '/' };
}

/**
 * Double-submit CSRF protection for cookie-authenticated, state-changing requests:
 * the X-CSRF-Token header must match the rb_csrf cookie. Cross-site pages cannot read
 * the cookie, so they cannot forge the header.
 */
export function csrfProtection(req: Request, _res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.path.startsWith('/webhooks/')) return next();
  const cookie = req.cookies?.[CSRF_COOKIE] as string | undefined;
  const header = req.get(CSRF_HEADER);
  if (!cookie || !header || cookie.length !== header.length) {
    return next(new AppError(403, 'CSRF_FAILED', 'Missing or invalid CSRF token'));
  }
  if (!timingSafeEqual(Buffer.from(cookie), Buffer.from(header))) {
    return next(new AppError(403, 'CSRF_FAILED', 'Missing or invalid CSRF token'));
  }
  next();
}

export function requireDatabase(req: Request, _res: Response, next: NextFunction) {
  if (!isDbConnected()) {
    return next(new AppError(503, 'DATABASE_UNAVAILABLE', 'Database is unavailable. No changes were made.'));
  }
  next();
}

function limiter(env: Env, windowMs: number, limit: number) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => !env.RATE_LIMIT_ENABLED,
    handler: (_req, _res, next) =>
      next(new AppError(429, 'RATE_LIMITED', 'Too many requests. Try again later.')),
  });
}

export function rateLimits(env: Env) {
  return {
    auth: limiter(env, 15 * 60 * 1000, 30),
    callCreate: limiter(env, 10 * 60 * 1000, 40),
    callInput: limiter(env, 60 * 1000, 120),
    sensitive: limiter(env, 60 * 1000, 30),
    general: limiter(env, 60 * 1000, 300),
  };
}
