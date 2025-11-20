import "server-only"
import { z } from "zod"

if (process.env.NODE_ENV === "test" && !process.env.TOKEN_ENCRYPTION_KEY) {
  process.env.TOKEN_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef"
}

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    NEXT_PUBLIC_SUPABASE_URL: z.string().url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
    NEXT_PUBLIC_APP_URL: z.string().url().optional(),
    NEXT_PUBLIC_BASE_URL: z.string().url().optional(),
    NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL: z.string().url().optional(),
    OPENAI_API_KEY: z.string().min(1).optional(),
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
    VERCEL_URL: z.string().min(1).optional(),
    PORT: z.string().regex(/^\d+$/).optional(),
    PLAYWRIGHT_BASE_URL: z.string().url().optional(),
    PLAYWRIGHT_WEB_SERVER_COMMAND: z.string().optional(),
    E2E_BASE_URL: z.string().url().optional(),
    E2E_TEST_EMAIL: z.string().email().optional(),
    E2E_TEST_PASSWORD: z.string().min(1).optional(),
    E2E_WORKSPACE_PATH: z.string().min(1).optional(),
    NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
    RESEND_API_KEY: z.string().min(1).optional(),
    INVITE_EMAIL_FROM: z.string().email().optional(),
    MAX_SPACES_PER_USER: z
      .string()
      .regex(/^\d+$/, "MAX_SPACES_PER_USER must be a positive integer")
      .optional()
      .default("10"),
    TOKEN_ENCRYPTION_KEY: z.string().min(32, "TOKEN_ENCRYPTION_KEY must be at least 32 characters"),
  })
  .superRefine((envValues, ctx) => {
    const hasRedisUrl = Boolean(envValues.UPSTASH_REDIS_REST_URL)
    const hasRedisToken = Boolean(envValues.UPSTASH_REDIS_REST_TOKEN)
    if (hasRedisUrl !== hasRedisToken) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: hasRedisUrl ? ["UPSTASH_REDIS_REST_TOKEN"] : ["UPSTASH_REDIS_REST_URL"],
        message: "Both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be provided together",
      })
    }
  })

const parsedEnv = envSchema.safeParse({
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
  NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  VERCEL_URL: process.env.VERCEL_URL,
  PORT: process.env.PORT,
  PLAYWRIGHT_BASE_URL: process.env.PLAYWRIGHT_BASE_URL,
  PLAYWRIGHT_WEB_SERVER_COMMAND: process.env.PLAYWRIGHT_WEB_SERVER_COMMAND,
  E2E_BASE_URL: process.env.E2E_BASE_URL,
  E2E_TEST_EMAIL: process.env.E2E_TEST_EMAIL,
  E2E_TEST_PASSWORD: process.env.E2E_TEST_PASSWORD,
  E2E_WORKSPACE_PATH: process.env.E2E_WORKSPACE_PATH,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  INVITE_EMAIL_FROM: process.env.INVITE_EMAIL_FROM,
  MAX_SPACES_PER_USER: process.env.MAX_SPACES_PER_USER,
  TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY,
})

if (!parsedEnv.success) {
  console.error("❌ Invalid environment configuration:", parsedEnv.error.format())
  throw new Error(
    "Environment validation failed. Please check your .env configuration. See logs above for details.",
  )
}

export const env = parsedEnv.data
export type Env = typeof env

