import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().startsWith('postgresql://'),
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  API_PUBLIC_URL: z.string().url(),
  WEB_ORIGIN: z.string().url(),
  SESSION_COOKIE_NAME: z.string().min(1).default('intandms_session'),
  SESSION_IDLE_SECONDS: z.coerce.number().int().min(60).default(3600),
  SESSION_ABSOLUTE_SECONDS: z.coerce.number().int().min(300).default(28800),
  SESSION_SIGNING_SECRET: z.string().min(16),
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  VALKEY_URL: z.string().startsWith('redis://').optional(),
  MANAGED_STORAGE_ROOT: z.string().min(1).default('./data/managed'),
});

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(raw: NodeJS.ProcessEnv): AppEnv {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid environment configuration:\n- ${details.join('\n- ')}`);
  }
  return parsed.data;
}
