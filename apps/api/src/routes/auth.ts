import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { loginSchema, registerSchema, updateMeSchema } from '@rythubazaar/shared';
import { User, publicUser } from '../models';
import { AppError } from '../lib/errors';
import { ah, ok, parse } from '../lib/http';
import { SESSION_COOKIE, requireAuth, sessionCookieOptions, signSession } from '../middleware/auth';
import { CSRF_COOKIE, csrfCookieOptions, newCsrfToken } from '../middleware/security';
import { audit, auditAsync } from '../services/audit';
import type { AppDeps } from '../context';

// A real hash so unknown-email logins take as long as wrong-password logins (no user enumeration by timing).
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password-placeholder', 10);
const BCRYPT_ROUNDS = 12;

export function authRouter(deps: AppDeps, limits: { auth: import('express').RequestHandler }) {
  const r = Router();
  const { env } = deps;

  r.get('/csrf', (req, res) => {
    let token = req.cookies?.[CSRF_COOKIE] as string | undefined;
    if (!token) {
      token = newCsrfToken();
      res.cookie(CSRF_COOKIE, token, csrfCookieOptions(env));
    }
    ok(res, { csrfToken: token });
  });

  r.post(
    '/register',
    limits.auth,
    ah(async (req, res) => {
      const input = parse(registerSchema, req.body);
      if (await User.exists({ email: input.email })) {
        throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
      }
      const passwordHash = await bcrypt.hash(input.password, env.NODE_ENV === 'test' ? 4 : BCRYPT_ROUNDS);
      let user;
      try {
        user = await User.create({
          name: input.name,
          email: input.email,
          phone: input.phone,
          passwordHash,
          // Self-registration can only create CUSTOMER or FARMER (enforced by the schema).
          role: input.role,
          preferredLanguage: input.preferredLanguage,
        });
      } catch (err) {
        if ((err as { code?: number }).code === 11000)
          throw new AppError(409, 'EMAIL_TAKEN', 'Email already registered');
        throw err;
      }
      await audit({
        category: 'SECURITY',
        action: 'USER_REGISTERED',
        outcome: 'SUCCESS',
        actor: {
          id: user._id.toString(),
          _id: user._id,
          role: user.role,
          name: user.name,
          preferredLanguage: user.preferredLanguage,
        },
        resourceType: 'User',
        resourceId: user._id.toString(),
        correlationId: req.correlationId,
        details: { role: user.role },
      });
      res.cookie(
        SESSION_COOKIE,
        signSession(env, user._id.toString(), user.sessionVersion),
        sessionCookieOptions(env),
      );
      ok(res, { user: publicUser(user) }, 201);
    }),
  );

  r.post(
    '/login',
    limits.auth,
    ah(async (req, res) => {
      const input = parse(loginSchema, req.body);
      const user = await User.findOne({ email: input.email }).select('+passwordHash');
      const valid = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
      if (!user || !valid || user.status !== 'ACTIVE') {
        auditAsync({
          category: 'SECURITY',
          action: 'LOGIN_FAILED',
          outcome: 'DENIED',
          actor: null,
          correlationId: req.correlationId,
          details: { reason: !user ? 'UNKNOWN_ACCOUNT' : !valid ? 'BAD_PASSWORD' : 'DISABLED' },
        });
        throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
      }
      res.cookie(
        SESSION_COOKIE,
        signSession(env, user._id.toString(), user.sessionVersion),
        sessionCookieOptions(env),
      );
      // Rotate the CSRF token on login.
      res.cookie(CSRF_COOKIE, newCsrfToken(), csrfCookieOptions(env));
      auditAsync({
        category: 'SECURITY',
        action: 'LOGIN_SUCCEEDED',
        outcome: 'SUCCESS',
        actor: {
          id: user._id.toString(),
          _id: user._id,
          role: user.role,
          name: user.name,
          preferredLanguage: user.preferredLanguage,
        },
        correlationId: req.correlationId,
      });
      ok(res, { user: publicUser(user) });
    }),
  );

  r.post('/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE, { ...sessionCookieOptions(env), maxAge: undefined });
    ok(res, { signedOut: true });
  });

  r.get(
    '/me',
    ah(async (req, res) => {
      if (!req.user) return ok(res, { user: null });
      const user = await User.findById(req.user._id).lean();
      ok(res, { user: user ? publicUser(user) : null });
    }),
  );

  r.patch(
    '/me',
    requireAuth,
    ah(async (req, res) => {
      const input = parse(updateMeSchema, req.body);
      const user = await User.findByIdAndUpdate(req.user!._id, { $set: input }, { new: true }).lean();
      ok(res, { user: user ? publicUser(user) : null });
    }),
  );

  return r;
}
