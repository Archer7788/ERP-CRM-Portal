import path from 'path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

/**
 * Booleans coming from the environment are plain strings ("true" / "false").
 * z.coerce.boolean() would turn the string "false" into `true`, so we parse explicitly.
 */
const envBoolean = (defaultValue: boolean) =>
  z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value.trim() === '') return defaultValue;
      return ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase());
    });

const envSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  API_PREFIX: z.string().default('/api/v1'),
  CORS_ORIGIN: z.string().default('*'),

  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DB_SSL: envBoolean(false),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),

  // Auth
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters long'),
  JWT_EXPIRES_IN: z.string().default('1d'),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),
  LOGIN_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
  LOGIN_RATE_LIMIT_MAX_ATTEMPTS: z.coerce.number().int().positive().default(10),

  // Pagination
  DEFAULT_PAGE_SIZE: z.coerce.number().int().positive().default(20),
  MAX_PAGE_SIZE: z.coerce.number().int().positive().default(100),

  // Challan numbering
  CHALLAN_NUMBER_PREFIX: z.string().default('CHN'),
  CHALLAN_NUMBER_PADDING: z.coerce.number().int().min(3).max(10).default(6),

  // Company details for the PDF invoice
  COMPANY_NAME: z.string().default('ERP + CRM Operations Portal'),
  COMPANY_ADDRESS: z.string().default(''),
  COMPANY_EMAIL: z.string().default(''),
  COMPANY_PHONE: z.string().default(''),
  COMPANY_GSTIN: z.string().default(''),

  // AWS S3
  AWS_REGION: z.string().default('ap-south-1'),
  AWS_S3_BUCKET: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_S3_PUBLIC_BASE_URL: z.string().optional(),
  AWS_S3_PRIVATE_OBJECTS: envBoolean(false),
  AWS_S3_SIGNED_URL_EXPIRY_SECONDS: z.coerce.number().int().positive().default(3600),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().positive().default(5),

  // Seed
  SEED_DEFAULT_PASSWORD: z.string().default('Password@123'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  // eslint-disable-next-line no-console
  console.error(`\nInvalid environment configuration:\n${issues}\n`);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
