import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(8080),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1),
  WEBHOOK_SECRET: z.string().min(1),
  CORS_ORIGINS: z.string().default('http://localhost:3001,http://localhost:3000'),
  INTERNAL_WEBHOOK_URL: z.string().url().optional(),
});

export const env = envSchema.parse(process.env);

export const PLAN_CONFIG = {
  basic: { monthlyTokenLimit: 10_000 },
  complete: { monthlyTokenLimit: 100_000 },
};

export type PlanType = keyof typeof PLAN_CONFIG;
