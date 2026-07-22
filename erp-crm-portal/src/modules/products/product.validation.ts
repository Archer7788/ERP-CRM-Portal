import { z } from 'zod';
import { paginationQuerySchema } from '../../common/pagination';
import { moneySchema, nonNegativeIntSchema } from '../../common/validators';

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (value === '' || value === null ? undefined : value),
    z.string().trim().max(max, `Cannot exceed ${max} characters`).optional(),
  );

/** Body schema for POST /products - every field from the specification. */
export const createProductSchema = z.object({
  productName: z
    .string()
    .trim()
    .min(2, 'Product Name must be at least 2 characters')
    .max(150, 'Product Name cannot exceed 150 characters'),
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .min(2, 'SKU / Product Code must be at least 2 characters')
    .max(60, 'SKU / Product Code cannot exceed 60 characters')
    .regex(/^[A-Z0-9][A-Z0-9._-]*$/, 'SKU may only contain letters, numbers, dots, underscores and hyphens'),
  category: z
    .string()
    .trim()
    .min(2, 'Category must be at least 2 characters')
    .max(80, 'Category cannot exceed 80 characters'),
  unitPrice: moneySchema,
  currentStock: nonNegativeIntSchema.default(0),
  minStockAlertQuantity: nonNegativeIntSchema.default(0),
  warehouseLocation: z
    .string()
    .trim()
    .min(1, 'Warehouse / Storage Location is required')
    .max(120, 'Warehouse / Storage Location cannot exceed 120 characters'),
  description: optionalText(1000),
  isActive: z.boolean().default(true),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

/** Body schema for PUT /products/:id */
export const updateProductSchema = createProductSchema
  .partial()
  .extend({
    /**
     * When currentStock is supplied on an update, the difference against the stored
     * value is written to the Stock Movement Log as a manual correction.
     */
    stockAdjustmentReason: optionalText(255),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided to update the product',
  });
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

const booleanQuery = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => (value === undefined ? undefined : value === 'true'));

/** Query schema for GET /products */
export const listProductsQuerySchema = paginationQuerySchema.extend({
  category: z.string().trim().min(1).max(80).optional(),
  warehouseLocation: z.string().trim().min(1).max(120).optional(),
  isActive: booleanQuery,
  lowStockOnly: booleanQuery,
  outOfStockOnly: booleanQuery,
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
});
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
