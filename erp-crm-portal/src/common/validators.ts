import { z } from 'zod';

/** Reusable primitive validators shared across modules. */

export const uuidSchema = z.string().uuid('Must be a valid UUID');

export const idParamSchema = z.object({
  id: z.string().uuid('The :id path parameter must be a valid UUID'),
});

export const mobileNumberSchema = z
  .string()
  .trim()
  .min(7, 'Mobile Number must be at least 7 characters')
  .max(20, 'Mobile Number cannot exceed 20 characters')
  .regex(/^[+]?[0-9\s-]{7,20}$/, 'Mobile Number may only contain digits, spaces, hyphens and an optional leading +');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Must be a valid email address')
  .max(160, 'Email cannot exceed 160 characters');

/** Indian GSTIN: 2 digit state code, 10 char PAN, entity number, Z, checksum. */
export const gstNumberSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
    'GST Number must be a valid 15 character GSTIN (e.g. 36AABCU9603R1ZX)',
  );

/** Accepts YYYY-MM-DD and validates that it is a real calendar date. */
export const dateOnlySchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use the YYYY-MM-DD format')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Date must be a valid calendar date');

export const isoDateTimeSchema = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Must be a valid ISO date/time string');

export const positiveIntSchema = z.coerce
  .number()
  .int('Must be a whole number')
  .positive('Must be greater than zero');

export const nonNegativeIntSchema = z.coerce
  .number()
  .int('Must be a whole number')
  .min(0, 'Cannot be negative');

export const moneySchema = z.coerce
  .number()
  .min(0, 'Cannot be negative')
  .max(99999999.99, 'Value is too large')
  .refine((value) => Number.isFinite(value), 'Must be a valid number');

/** Turns "" into undefined so optional text fields can be cleared from the UI. */
export const optionalTrimmedString = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Cannot exceed ${max} characters`)
    .optional()
    .or(z.literal('').transform(() => undefined));
