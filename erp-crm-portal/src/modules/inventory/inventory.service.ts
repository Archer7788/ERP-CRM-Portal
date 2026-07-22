import { ApiError } from '../../common/api-error';
import { AuthUser } from '../../common/types';
import { MovementReferenceType, MovementType } from '../../common/enums';
import { buildPaginationMeta, buildPaginationOptions } from '../../common/pagination';
import { withTransaction } from '../../config/database';
import * as productRepository from '../products/product.repository';
import { mapProduct } from '../products/product.types';
import * as repository from './inventory.repository';
import { InventoryQuery, MovementsQuery, StockAdjustmentInput } from './inventory.validation';

/** GET /inventory - current stock position for every product. */
export const getInventory = async (queryParams: InventoryQuery) => {
  const pagination = buildPaginationOptions(queryParams);
  const filters = {
    search: queryParams.search,
    category: queryParams.category,
    warehouseLocation: queryParams.warehouseLocation,
    isActive: queryParams.isActive,
    lowStockOnly: queryParams.lowStockOnly,
    outOfStockOnly: queryParams.outOfStockOnly,
  };

  const { items, total, sortKey } = await productRepository.findProducts(filters, pagination);
  const summary = await repository.getInventorySummary();
  const meta = buildPaginationMeta(pagination, total, sortKey, filters);

  return {
    items: items.map((product) => ({
      productId: product.id,
      productName: product.productName,
      sku: product.sku,
      category: product.category,
      unitPrice: product.unitPrice,
      currentStock: product.currentStock,
      minStockAlertQuantity: product.minStockAlertQuantity,
      warehouseLocation: product.warehouseLocation,
      isLowStock: product.isLowStock,
      isOutOfStock: product.currentStock === 0,
      stockValue: product.stockValue,
      imageUrl: product.imageUrl,
      isActive: product.isActive,
      updatedAt: product.updatedAt,
    })),
    meta: { ...meta, summary },
  };
};

/**
 * GET /inventory/low-stock-alerts
 * Low Stock Alert: every product whose Current Stock has reached or fallen below
 * its Minimum Stock Alert Quantity.
 */
export const getLowStockAlerts = async (queryParams: InventoryQuery) => {
  const result = await getInventory({ ...queryParams, lowStockOnly: true });
  return {
    items: result.items.map((item) => ({
      ...item,
      shortfall: Math.max(item.minStockAlertQuantity - item.currentStock, 0),
      severity: item.currentStock === 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK',
    })),
    meta: result.meta,
  };
};

/** GET /inventory/movements - the Stock Movement Log. */
export const getStockMovements = async (queryParams: MovementsQuery) => {
  const pagination = buildPaginationOptions(queryParams);
  const filters = {
    search: queryParams.search,
    productId: queryParams.productId,
    movementType: queryParams.movementType,
    referenceType: queryParams.referenceType,
    referenceId: queryParams.referenceId,
    createdBy: queryParams.createdBy,
    dateFrom: queryParams.dateFrom,
    dateTo: queryParams.dateTo,
  };

  const { items, total, sortKey } = await repository.findStockMovements(filters, pagination);
  const meta = buildPaginationMeta(pagination, total, sortKey, filters);
  return { items, meta };
};

/**
 * POST /inventory/adjust - manual IN / OUT stock correction.
 * The guarded UPDATE makes it impossible for stock to become negative even under
 * concurrent requests: the row is only updated while `current_stock >= quantity`.
 */
export const adjustStock = async (input: StockAdjustmentInput, user: AuthUser) => {
  return withTransaction(async (client) => {
    const [product] = await productRepository.lockProductsForUpdate(client, [input.productId]);
    if (!product) {
      throw ApiError.notFound(`Product with id "${input.productId}" was not found.`, 'PRODUCT_NOT_FOUND');
    }

    const currentStock = Number(product.current_stock);

    if (input.movementType === MovementType.OUT && currentStock < input.quantity) {
      throw ApiError.conflict(
        `Insufficient stock for "${product.product_name}" (${product.sku}). Requested ${input.quantity}, available ${currentStock}.`,
        'INSUFFICIENT_STOCK',
        {
          productId: product.id,
          sku: product.sku,
          productName: product.product_name,
          requestedQuantity: input.quantity,
          availableStock: currentStock,
        },
      );
    }

    const operator = input.movementType === MovementType.IN ? '+' : '-';
    const guard = input.movementType === MovementType.OUT ? 'AND current_stock >= $1' : '';

    const updateResult = await client.query(
      `UPDATE products
       SET current_stock = current_stock ${operator} $1, updated_at = NOW()
       WHERE id = $2 ${guard}
       RETURNING current_stock`,
      [input.quantity, input.productId],
    );

    if (updateResult.rowCount === 0) {
      throw ApiError.conflict(
        `Stock adjustment rejected for "${product.product_name}" (${product.sku}): the operation would make stock negative.`,
        'INSUFFICIENT_STOCK',
        { productId: product.id, sku: product.sku, requestedQuantity: input.quantity, availableStock: currentStock },
      );
    }

    const balanceAfter = Number(updateResult.rows[0].current_stock);

    await repository.recordStockMovement(
      {
        productId: input.productId,
        quantityChanged: input.quantity,
        movementType: input.movementType,
        reason: input.reason,
        balanceAfter,
        referenceType: MovementReferenceType.MANUAL_ADJUSTMENT,
        referenceId: input.productId,
        referenceNumber: product.sku,
        createdBy: user.id,
      },
      client,
    );

    const refreshed = await client.query(
      `SELECT p.*, NULL::text AS created_by_name FROM products p WHERE p.id = $1`,
      [input.productId],
    );

    return {
      product: mapProduct(refreshed.rows[0]),
      movement: {
        quantityChanged: input.quantity,
        movementType: input.movementType,
        reason: input.reason,
        previousStock: currentStock,
        balanceAfter,
      },
    };
  });
};

/** GET /inventory/products/:id/movements - ledger for a single product. */
export const getProductMovements = async (productId: string, queryParams: MovementsQuery) => {
  const product = await productRepository.findProductById(productId);
  if (!product) {
    throw ApiError.notFound(`Product with id "${productId}" was not found.`, 'PRODUCT_NOT_FOUND');
  }
  return getStockMovements({ ...queryParams, productId });
};
