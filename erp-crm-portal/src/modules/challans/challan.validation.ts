import { z } from 'zod';
import { CHALLAN_STATUSES } from '../../common/enums';
import { paginationQuerySchema } from '../../common/pagination';
import { isoDateTimeSchema, positiveIntSchema } from '../../common/validators';

/** One line of the challan: a product plus the quantity being dispatched. */
export const challanItemSchema = z.object({
  productId: z.string().uuid('productId must be a valid UUID'),
  quantity: positiveIntSchema.refine((value) => value <= 1_000_000, 'Quantity is unrealistically large'),
});
export type ChallanItemInput = z.infer<typeof challanItemSchema>;

/** Body schema for POST /challans */
export const createChallanSchema = z.object({
  customerId: z.string().uuid('customerId must be a valid UUID'),
  items: z
    .array(challanItemSchema)
    .min(1, 'A challan must contain at least one product')
    .max(200, 'A challan cannot contain more than 200 line items'),
  /** Save as Draft or Confirmed. Defaults to DRAFT. */
  status: z
    .enum(['DRAFT', 'CONFIRMED'], {
      errorMap: () => ({ message: 'status must be either DRAFT or CONFIRMED when creating a challan' }),
    })
    .default('DRAFT'),
  notes: z
    .preprocess(
      (value) => (value === '' || value === null ? undefined : value),
      z.string().trim().max(2000, 'Notes cannot exceed 2000 characters').optional(),
    ),
});
export type CreateChallanInput = z.infer<typeof createChallanSchema>;

/** Body schema for PATCH /challans/:id/status */
export const updateChallanStatusSchema = z
  .object({
    status: z.enum(CHALLAN_STATUSES, {
      errorMap: () => ({ message: `status must be one of: ${CHALLAN_STATUSES.join(', ')}` }),
    }),
    reason: z
      .preprocess(
        (value) => (value === '' || value === null ? undefined : value),
        z.string().trim().max(500, 'Reason cannot exceed 500 characters').optional(),
      ),
  })
  .refine((data) => data.status !== 'DRAFT', {
    message: 'A challan cannot be moved back to DRAFT once it has been created',
    path: ['status'],
  });
export type UpdateChallanStatusInput = z.infer<typeof updateChallanStatusSchema>;

/** Query schema for GET /challans */
export const listChallansQuerySchema = paginationQuerySchema.extend({
  status: z.enum(CHALLAN_STATUSES).optional(),
  customerId: z.string().uuid('customerId must be a valid UUID').optional(),
  createdBy: z.string().uuid('createdBy must be a valid UUID').optional(),
  dateFrom: isoDateTimeSchema.optional(),
  dateTo: isoDateTimeSchema.optional(),
});
export type ListChallansQuery = z.infer<typeof listChallansQuerySchema>;

/** Query schema for GET /challans/:id/invoice */
export const invoiceQuerySchema = z.object({
  download: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});
export type InvoiceQuery = z.infer<typeof invoiceQuerySchema>;
