import { z } from 'zod';
import { paginationQuerySchema } from '../../common/pagination';
import { MOVEMENT_TYPES } from '../../common/enums';
import { isoDateTimeSchema, positiveIntSchema } from '../../common/validators';

const booleanQuery = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => (value === undefined ? undefined : value === 'true'));

/** Query schema for GET /inventory */
export const inventoryQuerySchema = paginationQuerySchema.extend({
  category: z.string().trim().min(1).max(80).optional(),
  warehouseLocation: z.string().trim().min(1).max(120).optional(),
  isActive: booleanQuery,
  lowStockOnly: booleanQuery,
  outOfStockOnly: booleanQuery,
});
export type InventoryQuery = z.infer<typeof inventoryQuerySchema>;

/** Query schema for GET /inventory/movements */
export const movementsQuerySchema = paginationQuerySchema.extend({
  productId: z.string().uuid('productId must be a valid UUID').optional(),
  movementType: z.enum(MOVEMENT_TYPES).optional(),
  referenceType: z.enum(['CHALLAN', 'PRODUCT', 'MANUAL_ADJUSTMENT']).optional(),
  referenceId: z.string().uuid('referenceId must be a valid UUID').optional(),
  createdBy: z.string().uuid('createdBy must be a valid UUID').optional(),
  dateFrom: isoDateTimeSchema.optional(),
  dateTo: isoDateTimeSchema.optional(),
});
export type MovementsQuery = z.infer<typeof movementsQuerySchema>;

/** Body schema for POST /inventory/adjust - manual stock correction. */
export const stockAdjustmentSchema = z.object({
  productId: z.string().uuid('productId must be a valid UUID'),
  quantity: positiveIntSchema,
  movementType: z.enum(MOVEMENT_TYPES, {
    errorMap: () => ({ message: `Movement Type must be one of: ${MOVEMENT_TYPES.join(', ')}` }),
  }),
  reason: z
    .string()
    .trim()
    .min(3, 'Reason must be at least 3 characters')
    .max(255, 'Reason cannot exceed 255 characters'),
});
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;
