import { PoolClient } from 'pg';
import { query } from '../../config/database';
import { PaginationOptions, resolveSortColumn } from '../../common/pagination';
import { RecordMovementInput, StockMovement, StockMovementFilters, mapStockMovement } from './inventory.types';

export const MOVEMENT_SORT_COLUMNS: Record<string, string> = {
  createdAt: 'm.created_at',
  quantityChanged: 'm.quantity_changed',
  movementType: 'm.movement_type',
  productName: 'p.product_name',
  sku: 'p.sku',
};

const SELECT_MOVEMENT = `
  SELECT m.id,
         m.product_id,
         p.product_name,
         p.sku,
         m.quantity_changed,
         m.movement_type,
         m.reason,
         m.balance_after,
         m.reference_type,
         m.reference_id,
         m.reference_number,
         m.created_by,
         u.name AS created_by_name,
         m.created_at
  FROM stock_movements m
  INNER JOIN products p ON p.id = m.product_id
  LEFT JOIN users u ON u.id = m.created_by
`;

/**
 * Appends one row to the Stock Movement Log.
 * Called on EVERY inventory change: product creation with opening stock,
 * manual product edits, manual adjustments, challan confirmation and challan cancellation.
 */
export const recordStockMovement = async (
  input: RecordMovementInput,
  client?: PoolClient,
): Promise<string> => {
  const sql = `
    INSERT INTO stock_movements
      (product_id, quantity_changed, movement_type, reason, balance_after,
       reference_type, reference_id, reference_number, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id`;
  const values = [
    input.productId,
    input.quantityChanged,
    input.movementType,
    input.reason,
    input.balanceAfter,
    input.referenceType ?? null,
    input.referenceId ?? null,
    input.referenceNumber ?? null,
    input.createdBy,
  ];
  const result = client ? await client.query(sql, values) : await query(sql, values);
  return result.rows[0].id;
};

export const findStockMovements = async (
  filters: StockMovementFilters,
  pagination: PaginationOptions,
): Promise<{ items: StockMovement[]; total: number; sortKey: string }> => {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (filters.search) {
    values.push(`%${filters.search}%`);
    const p = `$${values.length}`;
    conditions.push(`(p.product_name ILIKE ${p} OR p.sku ILIKE ${p} OR m.reason ILIKE ${p} OR COALESCE(m.reference_number, '') ILIKE ${p})`);
  }
  if (filters.productId) {
    values.push(filters.productId);
    conditions.push(`m.product_id = $${values.length}`);
  }
  if (filters.movementType) {
    values.push(filters.movementType);
    conditions.push(`m.movement_type = $${values.length}`);
  }
  if (filters.referenceType) {
    values.push(filters.referenceType);
    conditions.push(`m.reference_type = $${values.length}`);
  }
  if (filters.referenceId) {
    values.push(filters.referenceId);
    conditions.push(`m.reference_id = $${values.length}`);
  }
  if (filters.createdBy) {
    values.push(filters.createdBy);
    conditions.push(`m.created_by = $${values.length}`);
  }
  if (filters.dateFrom) {
    values.push(filters.dateFrom);
    conditions.push(`m.created_at >= $${values.length}::timestamptz`);
  }
  if (filters.dateTo) {
    values.push(filters.dateTo);
    conditions.push(`m.created_at <= $${values.length}::timestamptz`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const sort = resolveSortColumn(pagination.sortBy, MOVEMENT_SORT_COLUMNS, 'createdAt');

  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM stock_movements m
     INNER JOIN products p ON p.id = m.product_id
     ${where}`,
    values,
  );
  const dataResult = await query(
    `${SELECT_MOVEMENT} ${where}
     ORDER BY ${sort.column} ${pagination.sortOrder}, m.id ASC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, pagination.limit, pagination.offset],
  );

  return {
    items: dataResult.rows.map(mapStockMovement),
    total: Number(countResult.rows[0]?.count ?? 0),
    sortKey: sort.key,
  };
};

export const findMovementsByReference = async (referenceId: string): Promise<StockMovement[]> => {
  const result = await query(`${SELECT_MOVEMENT} WHERE m.reference_id = $1 ORDER BY m.created_at ASC`, [
    referenceId,
  ]);
  return result.rows.map(mapStockMovement);
};

/** Aggregated inventory KPIs returned in the `meta.summary` block of GET /inventory. */
export const getInventorySummary = async () => {
  const result = await query<{
    total_products: string;
    active_products: string;
    low_stock_count: string;
    out_of_stock_count: string;
    total_units: string;
    inventory_value: string;
  }>(`
    SELECT COUNT(*)::text AS total_products,
           COUNT(*) FILTER (WHERE is_active)::text AS active_products,
           COUNT(*) FILTER (WHERE current_stock <= min_stock_alert_quantity)::text AS low_stock_count,
           COUNT(*) FILTER (WHERE current_stock = 0)::text AS out_of_stock_count,
           COALESCE(SUM(current_stock), 0)::text AS total_units,
           COALESCE(SUM(current_stock * unit_price), 0)::text AS inventory_value
    FROM products
  `);
  const row = result.rows[0];
  return {
    totalProducts: Number(row.total_products),
    activeProducts: Number(row.active_products),
    lowStockCount: Number(row.low_stock_count),
    outOfStockCount: Number(row.out_of_stock_count),
    totalUnitsInStock: Number(row.total_units),
    inventoryValue: Number(Number(row.inventory_value).toFixed(2)),
  };
};
