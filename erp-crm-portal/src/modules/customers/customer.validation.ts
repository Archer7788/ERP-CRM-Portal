import { z } from 'zod';
import { CUSTOMER_STATUSES, CUSTOMER_TYPES } from '../../common/enums';
import {
  dateOnlySchema,
  emailSchema,
  gstNumberSchema,
  mobileNumberSchema,
} from '../../common/validators';
import { paginationQuerySchema } from '../../common/pagination';

const emptyToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === '' || value === null ? undefined : value), schema.optional());

/** Body schema for POST /customers - every field from the specification. */
export const createCustomerSchema = z.object({
  customerName: z
    .string()
    .trim()
    .min(2, 'Customer Name must be at least 2 characters')
    .max(150, 'Customer Name cannot exceed 150 characters'),
  mobileNumber: mobileNumberSchema,
  email: emailSchema,
  businessName: z
    .string()
    .trim()
    .min(2, 'Business Name must be at least 2 characters')
    .max(150, 'Business Name cannot exceed 150 characters'),
  // GST Number is explicitly optional.
  gstNumber: emptyToUndefined(gstNumberSchema),
  customerType: z.enum(CUSTOMER_TYPES, {
    errorMap: () => ({ message: `Customer Type must be one of: ${CUSTOMER_TYPES.join(', ')}` }),
  }),
  address: z
    .string()
    .trim()
    .min(5, 'Address must be at least 5 characters')
    .max(500, 'Address cannot exceed 500 characters'),
  status: z
    .enum(CUSTOMER_STATUSES, {
      errorMap: () => ({ message: `Status must be one of: ${CUSTOMER_STATUSES.join(', ')}` }),
    })
    .default('LEAD'),
  followUpDate: emptyToUndefined(dateOnlySchema),
  notes: emptyToUndefined(z.string().trim().max(2000, 'Notes cannot exceed 2000 characters')),
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

/** Body schema for PUT /customers/:id - partial update, at least one field required. */
export const updateCustomerSchema = createCustomerSchema
  .partial()
  .extend({
    gstNumber: emptyToUndefined(gstNumberSchema).nullable().optional(),
    followUpDate: emptyToUndefined(dateOnlySchema).nullable().optional(),
    notes: emptyToUndefined(z.string().trim().max(2000)).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided to update the customer',
  });
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

/** Query schema for GET /customers - search, filtering, pagination and sorting. */
export const listCustomersQuerySchema = paginationQuerySchema.extend({
  status: z.enum(CUSTOMER_STATUSES).optional(),
  customerType: z.enum(CUSTOMER_TYPES).optional(),
  followUpFrom: dateOnlySchema.optional(),
  followUpTo: dateOnlySchema.optional(),
  hasGst: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
  createdBy: z.string().uuid('createdBy must be a valid UUID').optional(),
});
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;

/** Body schema for POST /customers/:id/follow-ups */
export const createFollowUpSchema = z.object({
  note: z
    .string()
    .trim()
    .min(2, 'Follow-up note must be at least 2 characters')
    .max(2000, 'Follow-up note cannot exceed 2000 characters'),
  followUpDate: emptyToUndefined(dateOnlySchema),
  /** When true the customer record's own Follow-up Date is moved to this note's date. */
  updateCustomerFollowUpDate: z.boolean().default(true),
  /** Optionally move the customer through the Lead -> Active -> Inactive pipeline. */
  status: z.enum(CUSTOMER_STATUSES).optional(),
});
export type CreateFollowUpInput = z.infer<typeof createFollowUpSchema>;
