import pino from 'pino';

/** Structured logger. Secrets and personal data are redacted at the transport level. */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'req.headers["x-csrf-token"]',
      'req.headers["x-call-token"]',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
      '*.phone',
      '*.email',
    ],
    censor: '[REDACTED]',
  },
  base: { service: 'rythubazaar-api' },
});
