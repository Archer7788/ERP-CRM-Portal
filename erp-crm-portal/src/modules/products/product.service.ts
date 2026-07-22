import { ApiError } from '../../common/api-error';
import { AuthUser } from '../../common/types';
import { MovementReferenceType, MovementType } from '../../common/enums';
import { buildPaginationMeta, buildPaginationOptions } from '../../common/pagination';
import { withTransaction } from '../../config/database';
import { recordStockMovement } from '../inventory/inventory.repository';
import { uploadProductImage } from '../../services/s3.service';
import * as repository from './product.repository';
import { Product } from './product.types';
import { CreateProductInput, ListProductsQuery, UpdateProductInput } from './product.validation';

/** GET /products */
export const listProducts = async (queryParams: ListProductsQuery) => {
  const pagination = buildPaginationOptions(queryParams);
  const filters = {
    search: queryParams.search,
    category: queryParams.category,
    warehouseLocation: queryParams.warehouseLocation,
    isActive: queryParams.isActive,
    lowStockOnly: queryParams.lowStockOnly,
    outOfStockOnly: queryParams.outOfStockOnly,
    minPrice: queryParams.minPrice,
    maxPrice: queryParams.maxPrice,
  };

  const { items, total, sortKey } = await repository.findProducts(filters, pagination);
  const meta = buildPaginationMeta(pagination, total, sortKey, filters);
  return { items, meta };
};

/** GET /products/:id */
export const getProductById = async (id: string): Promise<Product> => {
  const product = await repository.findProductById(id);
  if (!product) {
    throw ApiError.notFound(`Product with id "${id}" was not found.`, 'PRODUCT_NOT_FOUND');
  }
  return product;
};

/**
 * POST /products
 * If the product is created with opening stock, an IN movement is written to the
 * Stock Movement Log so that the ledger always reconciles with current_stock.
 */
export const createProduct = async (input: CreateProductInput, user: AuthUser): Promise<Product> => {
  const duplicate = await repository.findProductBySku(input.sku);
  if (duplicate) {
    throw ApiError.conflict(
      `A product with the SKU "${input.sku}" already exists. SKU / Product Code must be unique.`,
      'DUPLICATE_SKU',
      { sku: input.sku },
    );
  }

  const product = await repository.insertProduct(input, user.id);

  if (product.currentStock > 0) {
    await recordStockMovement({
      productId: product.id,
      quantityChanged: product.currentStock,
      movementType: MovementType.IN,
      reason: 'Opening stock recorded at product creation',
      balanceAfter: product.currentStock,
      referenceType: MovementReferenceType.PRODUCT,
      referenceId: product.id,
      referenceNumber: product.sku,
      createdBy: user.id,
    });
  }

  return product;
};

/**
 * PUT /products/:id
 * Changing `currentStock` here is treated as a manual correction: the delta is
 * computed and logged as an IN or OUT movement, and negative stock is rejected.
 */
export const updateProduct = async (
  id: string,
  input: UpdateProductInput,
  user: AuthUser,
): Promise<Product> => {
  const existing = await repository.findProductById(id);
  if (!existing) {
    throw ApiError.notFound(`Product with id "${id}" was not found.`, 'PRODUCT_NOT_FOUND');
  }

  if (input.sku && input.sku !== existing.sku) {
    const duplicate = await repository.findProductBySku(input.sku, id);
    if (duplicate) {
      throw ApiError.conflict(
        `Another product already uses the SKU "${input.sku}".`,
        'DUPLICATE_SKU',
        { sku: input.sku },
      );
    }
  }

  if (input.currentStock !== undefined && input.currentStock < 0) {
    throw ApiError.unprocessable(
      'Current Stock can never be negative.',
      'NEGATIVE_STOCK_NOT_ALLOWED',
      { requestedStock: input.currentStock },
    );
  }

  return withTransaction(async (client) => {
    const { stockAdjustmentReason, ...updatableFields } = input;
    const updated = await repository.updateProductById(id, updatableFields, client);

    if (input.currentStock !== undefined && input.currentStock !== existing.currentStock) {
      const delta = input.currentStock - existing.currentStock;
      await recordStockMovement(
        {
          productId: id,
          quantityChanged: Math.abs(delta),
          movementType: delta > 0 ? MovementType.IN : MovementType.OUT,
          reason:
            stockAdjustmentReason ??
            `Manual stock correction via product update (${existing.currentStock} -> ${input.currentStock})`,
          balanceAfter: input.currentStock,
          referenceType: MovementReferenceType.PRODUCT,
          referenceId: id,
          referenceNumber: updated?.sku ?? existing.sku,
          createdBy: user.id,
        },
        client,
      );
    }

    return updated as Product;
  });
};

/** POST /products/:id/image - uploads the image to AWS S3 and stores the URL. */
export const attachProductImage = async (
  id: string,
  file: Express.Multer.File | undefined,
): Promise<Product> => {
  if (!file) {
    throw ApiError.unprocessable(
      'No image file was received. Send the file as multipart/form-data using the "image" field.',
      'IMAGE_FILE_REQUIRED',
    );
  }

  const product = await getProductById(id);
  const uploaded = await uploadProductImage(file, product.id);
  const updated = await repository.updateProductImage(product.id, uploaded.url, uploaded.key);
  return updated as Product;
};

/** GET /products/meta/categories */
export const getProductFacets = async () => ({
  categories: await repository.listDistinctCategories(),
  warehouseLocations: await repository.listDistinctWarehouses(),
});
