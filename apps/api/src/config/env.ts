import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { z } from 'zod';

/**
 * Environment configuration, validated once at startup. The process refuses to boot
 * with an invalid configuration instead of failing later at request time.
 */

const booleanString = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    MONGODB_URI: z.string().min(1).optional(),

    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters').optional(),
    SESSION_TTL_HOURS: z.coerce.number().min(1).max(72).default(8),

    CORS_ORIGINS: z.string().default('http://localhost:3000'),
    COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    COOKIE_SECURE: booleanString.optional(),
    COOKIE_DOMAIN: z.string().optional(),
    TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),

    AI_PROVIDER: z.enum(['anthropic', 'openai', 'none']).default('anthropic'),
    ANTHROPIC_API_KEY: z.string().optional(),
    OPENAI_API_KEY: z.string().optional(),
    AI_TRIAGE_MODEL: z.string().optional(),
    AI_DRAFT_MODEL: z.string().optional(),
    AI_TRIAGE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(20_000),
    AI_DRAFT_TIMEOUT_MS: z.coerce.number().int().min(1000).max(180_000).default(60_000),
    AI_MAX_RETRIES: z.coerce.number().int().min(0).max(3).default(1),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      if (!env.MONGODB_URI)
        ctx.addIssue({ code: 'custom', path: ['MONGODB_URI'], message: 'Required in production' });
      if (!env.JWT_SECRET)
        ctx.addIssue({ code: 'custom', path: ['JWT_SECRET'], message: 'Required in production' });
    }
    if (env.COOKIE_SAMESITE === 'none' && env.COOKIE_SECURE === false) {
      ctx.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message: 'SameSite=None cookies must be Secure',
      });
    }
  });

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  isProduction: boolean;
  port: number;
  logLevel: string;
  mongoUri: string;
  jwtSecret: string;
  /** True when JWT_SECRET was not provided and an ephemeral one was generated. */
  jwtSecretIsEphemeral: boolean;
  sessionTtlHours: number;
  corsOrigins: string[];
  cookie: { sameSite: 'lax' | 'strict' | 'none'; secure: boolean; domain: string | undefined };
  trustProxy: number;
  ai: {
    provider: 'anthropic' | 'openai' | null;
    apiKey: string | null;
    triageModel: string;
    draftModel: string;
    triageTimeoutMs: number;
    draftTimeoutMs: number;
    maxRetries: number;
  };
}

/**
 * Default models. Triage (classification + priority) is a high-volume, short structured
 * task → the small, inexpensive model. Drafting is author-facing prose that an admin
 * reviews → the most capable model. Both are overridable per strategy and via env.
 */
const DEFAULT_MODELS = {
  anthropic: { triage: 'claude-haiku-5-5', draft: 'claude-opus-5-5' },
  openai: { triage: 'gpt-4o-mini', draft: 'gpt-4o-mini' },
} as const;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const env = parsed.data;
  const isProduction = env.NODE_ENV === 'production';

  const provider = env.AI_PROVIDER === 'none' ? null : env.AI_PROVIDER;
  const apiKey =
    provider === 'anthropic'
      ? env.ANTHROPIC_API_KEY?.trim() || null
      : provider === 'openai'
        ? env.OPENAI_API_KEY?.trim() || null
        : null;

  return {
    nodeEnv: env.NODE_ENV,
    isProduction,
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    mongoUri: env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/bookleaf',
    jwtSecret: env.JWT_SECRET ?? randomBytes(48).toString('base64url'),
    jwtSecretIsEphemeral: !env.JWT_SECRET,
    sessionTtlHours: env.SESSION_TTL_HOURS,
    corsOrigins: env.CORS_ORIGINS.split(',')
      .map((o) => o.trim().replace(/\/$/, ''))
      .filter(Boolean),
    cookie: {
      sameSite: env.COOKIE_SAMESITE,
      secure: env.COOKIE_SECURE ?? isProduction,
      domain: env.COOKIE_DOMAIN || undefined,
    },
    trustProxy: env.TRUST_PROXY,
    ai: {
      provider: apiKey ? provider : null,
      apiKey,
      triageModel: env.AI_TRIAGE_MODEL ?? DEFAULT_MODELS[provider ?? 'anthropic'].triage,
      draftModel: env.AI_DRAFT_MODEL ?? DEFAULT_MODELS[provider ?? 'anthropic'].draft,
      triageTimeoutMs: env.AI_TRIAGE_TIMEOUT_MS,
      draftTimeoutMs: env.AI_DRAFT_TIMEOUT_MS,
      maxRetries: env.AI_MAX_RETRIES,
    },
  };
}

/** Loads `apps/api/.env` into process.env when present (no dotenv dependency needed). */
export function loadDotEnv(path = '.env'): void {
  if (existsSync(path)) process.loadEnvFile(path);
}
