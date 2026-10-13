import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { randomUUID } from 'node:crypto';
import { logger } from './lib/logger';
import { authenticate } from './middleware/auth';
import { correlation, csrfProtection, rateLimits, requireDatabase } from './middleware/security';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { authRouter } from './routes/auth';
import { healthRouter, publicRouter } from './routes/public';
import { customerRouter } from './routes/customer';
import { farmerRouter } from './routes/farmer';
import { callsRouter } from './routes/calls';
import { adminRouter } from './routes/admin';
import { uploadDir, uploadsRouter } from './routes/uploads';
import { webhooksRouter } from './routes/webhooks';
import type { AppDeps } from './context';

export function createApp(deps: AppDeps) {
  const { env } = deps;
  const app = express();
  const limits = rateLimits(env);

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id = typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url === '/api/health' },
      customProps: () => ({}),
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || env.CORS_ORIGINS.includes(origin)),
      credentials: true,
      allowedHeaders: [
        'Content-Type',
        'X-CSRF-Token',
        'Idempotency-Key',
        'X-Call-Token',
        'X-Correlation-Id',
        'X-Request-Id',
      ],
      exposedHeaders: ['X-Request-Id', 'X-Correlation-Id', 'Idempotent-Replayed'],
    }),
  );
  app.use(correlation);
  app.use(cookieParser());

  // Health endpoints are available even when MongoDB is down.
  app.use('/api', healthRouter());

  // Webhooks need the raw body for signature verification, so mount them before JSON parsing.
  app.use('/api/webhooks', requireDatabase, webhooksRouter(deps));

  app.use(express.json({ limit: '100kb' }));
  app.use('/uploads', express.static(uploadDir(deps), { fallthrough: false, maxAge: '7d', index: false }));

  app.use('/api', limits.general, requireDatabase, csrfProtection, authenticate(env));
  app.use('/api/auth', authRouter(deps, limits));
  app.use('/api', publicRouter(deps));
  app.use('/api/calls', callsRouter(deps, limits));
  app.use('/api/uploads', uploadsRouter(deps));
  app.use('/api/farmer', farmerRouter(deps));
  app.use('/api/admin', adminRouter(deps, limits));
  app.use('/api', customerRouter(deps, limits));

  app.use('/api', notFoundHandler);
  app.use(errorHandler);
  return app;
}
