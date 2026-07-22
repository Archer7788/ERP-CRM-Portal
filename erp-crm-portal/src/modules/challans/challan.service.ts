import { PoolClient } from 'pg';
import { ApiError } from '../../common/api-error';
import { AuthUser } from '../../common/types';
import {
  ChallanStatus,
  MovementReferenceType,
  MovementType,
} from '../../common/enums';
import { buildPaginationMeta, buildPaginationOptions } from '../../common/pagination';
import { withTransaction } from '../../config/database';
import { findCustomerByIdForUpdate } from '../customers/customer.repository';
import { lockProductsForUpdate } from '../products/product.repository';
import { ProductSnapshot } from '../products/product.types';
import { recordStockMovement } from '../inventory/inventory.repository';
import * as repository from './challan.repository';
import { Challan, CustomerSnapshot } from './challan.types';
import {
  CreateChallanInput,
  ListChallansQuery,
  UpdateChallanStatusInput,
} from './challan.validation';

interface PreparedItem {
  productId: string;
  productName: string;
  sku: string;
  category: string;
  unitPrice: number;
  warehouseLocation: string;
  quantity: number;
  lineTotal: number;
  productSnapshot: ProductSnapshot;
  availableStock: number;
}

const round2 = (value: number) => Number(value.toFixed(2));

/** Valid Draft / Confirmed / Cancelled transitions. */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  DRAFT: [ChallanStatus.CONFIRMED, ChallanStatus.CANCELLED],
  CONFIRMED: [ChallanStatus.CANCELLED],
  CANCELLED: [],
};

const buildCustomerSnapshot = (customerRow: any): CustomerSnapshot => ({
  customerId: customerRow.id,
  customerName: customerRow.customer_name,
  mobileNumber: customerRow.mobile_number,
  email: customerRow.email,
  businessName: customerRow.business_name,
  gstNumber: customerRow.gst_number ?? null,
  customerType: customerRow.customer_type,
  address: customerRow.address,
  status: customerRow.status,
  snapshotTakenAt: new Date().toISOString(),
});

const buildProductSnapshot = (productRow: any): ProductSnapshot => ({
  productId: productRow.id,
  productName: productRow.product_name,
  sku: productRow.sku,
  category: productRow.category,
  unitPrice: Number(productRow.unit_price),
  warehouseLocation: productRow.warehouse_location,
  imageUrl: productRow.image_url ?? null,
  description: productRow.description ?? null,
  stockAtChallanTime: Number(productRow.current_stock),
  snapshotTakenAt: new Date().toISOString(),
});

/**
 * Reduces inventory for every line of a confirmed challan and writes an OUT row
 * to the Stock Movement Log for each product.
 *
 * Two layers protect against negative stock:
 *   1. A pre-check across all locked rows, so the caller receives one aggregated
 *      error listing every insufficient product instead of failing one at a time.
 *   2. A guarded UPDATE (`WHERE current_stock >= $qty`) which is the authoritative
 *      check, backed by the `products_current_stock_non_negative` CHECK constraint.
 */
const deductStockForChallan = async (
  client: PoolClient,
  params: {
    challanId: string;
    challanNumber: string;
    items: Array<{ productId: string; quantity: number }>;
    user: AuthUser;
  },
): Promise<void> => {
  const productIds = params.items.map((item) => item.productId);
  const lockedProducts = await lockProductsForUpdate(client, productIds);
  const productMap = new Map(lockedProducts.map((row: any) => [row.id, row]));

  const insufficientItems = params.items
    .map((item) => {
      const product: any = productMap.get(item.productId);
      const availableStock = product ? Number(product.current_stock) : 0;
      return {
        productId: item.productId,
        sku: product?.sku ?? null,
        productName: product?.product_name ?? null,
        requestedQuantity: item.quantity,
        availableStock,
        shortfall: item.quantity - availableStock,
      };
    })
    .filter((item) => item.shortfall > 0);

  if (insufficientItems.length > 0) {
    throw ApiError.conflict(
      `Insufficient stock to confirm challan ${params.challanNumber}. ${insufficientItems.length} product(s) do not have enough quantity available. Stock can never become negative.`,
      'INSUFFICIENT_STOCK',
      { challanNumber: params.challanNumber, insufficientItems },
    );
  }

  for (const item of params.items) {
    const product: any = productMap.get(item.productId);

    const updateResult = await client.query<{ current_stock: number }>(
      `UPDATE products
       SET current_stock = current_stock - $1, updated_at = NOW()
       WHERE id = $2 AND current_stock >= $1
       RETURNING current_stock`,
      [item.quantity, item.productId],
    );

    if (updateResult.rowCount === 0) {
      throw ApiError.conflict(
        `Insufficient stock for "${product?.product_name ?? item.productId}" (${product?.sku ?? 'unknown SKU'}). The stock quantity must never become negative.`,
        'INSUFFICIENT_STOCK',
        {
          productId: item.productId,
          sku: product?.sku ?? null,
          requestedQuantity: item.quantity,
          availableStock: product ? Number(product.current_stock) : 0,
        },
      );
    }

    await recordStockMovement(
      {
        productId: item.productId,
        quantityChanged: item.quantity,
        movementType: MovementType.OUT,
        reason: `Sales challan ${params.challanNumber} confirmed`,
        balanceAfter: Number(updateResult.rows[0].current_stock),
        referenceType: MovementReferenceType.CHALLAN,
        referenceId: params.challanId,
        referenceNumber: params.challanNumber,
        createdBy: params.user.id,
      },
      client,
    );
  }
};

/** Restores inventory when a CONFIRMED challan is cancelled, logging IN movements. */
const restoreStockForChallan = async (
  client: PoolClient,
  params: {
    challanId: string;
    challanNumber: string;
    items: Array<{ productId: string; quantity: number }>;
    user: AuthUser;
    reason: string;
  },
): Promise<void> => {
  const productIds = params.items.map((item) => item.productId);
  await lockProductsForUpdate(client, productIds);

  for (const item of params.items) {
    const updateResult = await client.query<{ current_stock: number }>(
      `UPDATE products
       SET current_stock = current_stock + $1, updated_at = NOW()
       WHERE id = $2
       RETURNING current_stock`,
      [item.quantity, item.productId],
    );

    // A product deleted after the challan was confirmed cannot receive stock back,
    // but the challan itself still holds the full snapshot of what was dispatched.
    if (updateResult.rowCount === 0) continue;

    await recordStockMovement(
      {
        productId: item.productId,
        quantityChanged: item.quantity,
        movementType: MovementType.IN,
        reason: params.reason,
        balanceAfter: Number(updateResult.rows[0].current_stock),
        referenceType: MovementReferenceType.CHALLAN,
        referenceId: params.challanId,
        referenceNumber: params.challanNumber,
        createdBy: params.user.id,
      },
      client,
    );
  }
};

/**
 * POST /challans
 * Creates a challan as Draft or Confirmed. Confirmed challans immediately reduce
 * inventory inside the same transaction, so a stock failure rolls the whole
 * challan back rather than leaving a half-applied document behind.
 */
export const createChallan = async (input: CreateChallanInput, user: AuthUser): Promise<Challan> => {
  // Reject duplicate products so the requested quantity per line is unambiguous.
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  input.items.forEach((item) => {
    if (seen.has(item.productId)) duplicates.add(item.productId);
    seen.add(item.productId);
  });
  if (duplicates.size > 0) {
    throw ApiError.unprocessable(
      'The same product appears more than once in the challan. Combine the quantities into a single line item.',
      'DUPLICATE_PRODUCT_LINE',
      { duplicateProductIds: Array.from(duplicates) },
    );
  }

  return withTransaction(async (client) => {
    const customerRow = await findCustomerByIdForUpdate(client, input.customerId);
    if (!customerRow) {
      throw ApiError.notFound(
        `Customer with id "${input.customerId}" was not found. Select a valid customer for this challan.`,
        'CUSTOMER_NOT_FOUND',
      );
    }

    const productIds = input.items.map((item) => item.productId);
    const lockedProducts = await lockProductsForUpdate(client, productIds);
    const productMap = new Map(lockedProducts.map((row: any) => [row.id, row]));

    const missingProductIds = productIds.filter((id) => !productMap.has(id));
    if (missingProductIds.length > 0) {
      throw ApiError.notFound(
        `${missingProductIds.length} product(s) referenced by this challan do not exist.`,
        'PRODUCT_NOT_FOUND',
        { missingProductIds },
      );
    }

    const inactiveProducts = lockedProducts
      .filter((row: any) => row.is_active === false)
      .map((row: any) => ({ productId: row.id, sku: row.sku, productName: row.product_name }));
    if (inactiveProducts.length > 0) {
      throw ApiError.unprocessable(
        'One or more products on this challan are inactive and cannot be sold.',
        'INACTIVE_PRODUCT',
        { inactiveProducts },
      );
    }

    // Build the immutable product snapshot for every line.
    const preparedItems: PreparedItem[] = input.items.map((item) => {
      const product: any = productMap.get(item.productId);
      const unitPrice = Number(product.unit_price);
      return {
        productId: product.id,
        productName: product.product_name,
        sku: product.sku,
        category: product.category,
        unitPrice,
        warehouseLocation: product.warehouse_location,
        quantity: item.quantity,
        lineTotal: round2(unitPrice * item.quantity),
        productSnapshot: buildProductSnapshot(product),
        availableStock: Number(product.current_stock),
      };
    });

    const totalQuantity = preparedItems.reduce((sum, item) => sum + item.quantity, 0);
    const totalAmount = round2(preparedItems.reduce((sum, item) => sum + item.lineTotal, 0));

    const challanNumber = await repository.generateChallanNumber(client);

    const challanId = await repository.insertChallan(client, {
      challanNumber,
      customerId: customerRow.id,
      customerSnapshot: buildCustomerSnapshot(customerRow),
      totalQuantity,
      totalItems: preparedItems.length,
      totalAmount,
      status: input.status,
      notes: input.notes ?? null,
      createdBy: user.id,
      confirmedBy: input.status === ChallanStatus.CONFIRMED ? user.id : null,
    });

    await repository.insertChallanItems(client, challanId, preparedItems);

    if (input.status === ChallanStatus.CONFIRMED) {
      await deductStockForChallan(client, {
        challanId,
        challanNumber,
        items: preparedItems.map((item) => ({ productId: item.productId, quantity: item.quantity })),
        user,
      });
    }

    return (await repository.findChallanById(challanId, client)) as Challan;
  });
};

/** GET /challans */
export const listChallans = async (queryParams: ListChallansQuery) => {
  const pagination = buildPaginationOptions(queryParams);
  const filters = {
    search: queryParams.search,
    status: queryParams.status,
    customerId: queryParams.customerId,
    createdBy: queryParams.createdBy,
    dateFrom: queryParams.dateFrom,
    dateTo: queryParams.dateTo,
  };

  const { items, total, sortKey } = await repository.findChallans(filters, pagination);
  const meta = buildPaginationMeta(pagination, total, sortKey, filters);
  const summary = await repository.getChallanSummary();

  return { items, meta: { ...meta, summary: { byStatus: summary } } };
};

/** GET /challans/:id */
export const getChallanById = async (id: string): Promise<Challan> => {
  const challan = await repository.findChallanById(id);
  if (!challan) {
    throw ApiError.notFound(`Challan with id "${id}" was not found.`, 'CHALLAN_NOT_FOUND');
  }
  return challan;
};

/**
 * PATCH /challans/:id/status
 * DRAFT     -> CONFIRMED : deducts stock and logs OUT movements
 * DRAFT     -> CANCELLED : no stock impact (nothing was ever deducted)
 * CONFIRMED -> CANCELLED : restores stock and logs IN movements
 */
export const updateChallanStatus = async (
  id: string,
  input: UpdateChallanStatusInput,
  user: AuthUser,
): Promise<Challan> => {
  return withTransaction(async (client) => {
    const challanRow = await repository.findChallanByIdForUpdate(client, id);
    if (!challanRow) {
      throw ApiError.notFound(`Challan with id "${id}" was not found.`, 'CHALLAN_NOT_FOUND');
    }

    const currentStatus: string = challanRow.status;
    const nextStatus: string = input.status;

    if (currentStatus === nextStatus) {
      throw ApiError.conflict(
        `This challan is already in the ${currentStatus} state.`,
        'STATUS_UNCHANGED',
        { currentStatus, requestedStatus: nextStatus },
      );
    }

    if (!ALLOWED_TRANSITIONS[currentStatus]?.includes(nextStatus)) {
      throw ApiError.conflict(
        `Invalid status transition: a ${currentStatus} challan cannot be changed to ${nextStatus}.`,
        'INVALID_STATUS_TRANSITION',
        {
          currentStatus,
          requestedStatus: nextStatus,
          allowedTransitions: ALLOWED_TRANSITIONS[currentStatus] ?? [],
        },
      );
    }

    const items = await repository.findChallanItems(id, client);
    const movementItems = items.map((item) => ({ productId: item.productId, quantity: item.quantity }));

    if (nextStatus === ChallanStatus.CONFIRMED) {
      await deductStockForChallan(client, {
        challanId: id,
        challanNumber: challanRow.challan_number,
        items: movementItems,
        user,
      });
      await repository.markChallanConfirmed(client, id, user.id);
    }

    if (nextStatus === ChallanStatus.CANCELLED) {
      if (currentStatus === ChallanStatus.CONFIRMED) {
        await restoreStockForChallan(client, {
          challanId: id,
          challanNumber: challanRow.challan_number,
          items: movementItems,
          user,
          reason: `Stock returned: confirmed challan ${challanRow.challan_number} cancelled${input.reason ? ` (${input.reason})` : ''}`,
        });
      }
      await repository.markChallanCancelled(client, id, user.id, input.reason ?? null);
    }

    return (await repository.findChallanById(id, client)) as Challan;
  });
};
