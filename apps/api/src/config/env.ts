import { z } from 'zod';

const boolish = (fallback: boolean) =>
  z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((v) => (v === undefined ? fallback : v === 'true' || v === '1'));

/** Known IVR route identifiers. Dial codes map onto these. */
export const IVR_ROUTES = ['RYTHUBAZAAR_DEMO_IVR'] as const;
export type IvrRoute = (typeof IVR_ROUTES)[number];

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    MONGODB_URI: z
      .string({ required_error: 'MONGODB_URI is required (see apps/api/.env.example)' })
      .regex(/^mongodb(\+srv)?:\/\//, 'MONGODB_URI must start with mongodb:// or mongodb+srv://'),
    JWT_SECRET: z
      .string({ required_error: 'JWT_SECRET is required (see apps/api/.env.example)' })
      .min(32, 'JWT_SECRET must be at least 32 characters'),
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:5173')
      .transform((s) =>
        s
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
      ),
    SESSION_TTL_HOURS: z.coerce
      .number()
      .int()
      .min(1)
      .max(24 * 30)
      .default(168),
    COOKIE_SECURE: z.enum(['true', 'false', '1', '0']).optional(),
    DEMO_DIAL_CODE: z
      .string()
      .regex(/^\d{3,10}$/, 'DEMO_DIAL_CODE must be 3–10 digits')
      .default('12908'),
    EXTRA_DEMO_ROUTES: z.string().optional().default(''),
    TELEPHONY_MODE: z.enum(['demo']).default('demo'),
    AI_INTERPRETER: z.enum(['rules']).default('rules'),
    PAYMENT_MODE: z.enum(['demo']).default('demo'),
    PAYOUT_PROVIDER: z.enum(['mock']).default('mock'),
    DELIVERY_FEE_PAISE: z.coerce.number().int().min(0).default(3000),
    FREE_DELIVERY_THRESHOLD_PAISE: z.coerce.number().int().min(0).default(50000),
    SERVICE_FEE_BPS: z.coerce.number().int().min(0).max(2000).default(200),
    SERVICE_FEE_CAP_PAISE: z.coerce.number().int().min(0).default(2000),
    RETURN_WINDOW_HOURS: z.coerce
      .number()
      .int()
      .min(1)
      .max(24 * 30)
      .default(48),
    RATE_LIMIT_ENABLED: boolish(true),
    CALL_IDLE_TIMEOUT_MINUTES: z.coerce.number().int().min(1).max(120).default(10),
    UPLOAD_DIR: z.string().default('uploads'),
    MAX_UPLOAD_MB: z.coerce.number().min(0.1).max(10).default(2),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      if (/replace-with|change-me|example|secret-of/i.test(env.JWT_SECRET)) {
        ctx.addIssue({
          code: 'custom',
          path: ['JWT_SECRET'],
          message: 'Placeholder JWT_SECRET used in production',
        });
      }
      if (env.CORS_ORIGINS.some((o) => o === '*')) {
        ctx.addIssue({
          code: 'custom',
          path: ['CORS_ORIGINS'],
          message: 'Wildcard CORS origin is not allowed',
        });
      }
    }
  })
  .transform((env) => {
    const demoRoutes: Record<string, IvrRoute> = { [env.DEMO_DIAL_CODE]: 'RYTHUBAZAAR_DEMO_IVR' };
    for (const pair of env.EXTRA_DEMO_ROUTES.split(',')
      .map((p) => p.trim())
      .filter(Boolean)) {
      const [code, route] = pair.split(':');
      if (code && /^\d{3,10}$/.test(code) && (IVR_ROUTES as readonly string[]).includes(route ?? '')) {
        demoRoutes[code] = route as IvrRoute;
      } else {
        throw new Error(
          `Invalid EXTRA_DEMO_ROUTES entry "${pair}". Use code:ROUTE with ROUTE in ${IVR_ROUTES.join(', ')}`,
        );
      }
    }
    const cookieSecure =
      env.COOKIE_SECURE === undefined
        ? env.NODE_ENV === 'production'
        : ['true', '1'].includes(env.COOKIE_SECURE);
    return { ...env, demoRoutes, cookieSecure };
  });

export type Env = z.infer<typeof envSchema>;

/** Parse and validate environment variables, failing fast with actionable messages. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join('.') || 'env'}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  return result.data;
}
