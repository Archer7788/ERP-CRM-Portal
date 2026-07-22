import { PoolClient } from 'pg';
import { query } from '../../config/database';
import { env } from '../../config/env';
import { PaginationOptions, resolveSortColumn } from '../../common/pagination';
import { Challan, ChallanFilters, ChallanItem, mapChallan, mapChallanItem } from './challan.types';

export const CHALLAN_SORT_COLUMNS: Record<string, string> = {
  challanNumber: 'c.challan_number',
  status: 'c.status',
  totalQuantity: 'c.total_quantity',
  totalAmount: 'c.total_amount',
  createdAt: 'c.created_at',
  updatedAt: 'c.updated_at',
};

const SELECT_CHALLAN = `
  SELECT c.id,
         c.challan_number,
         c.customer_id,
         c.customer_snapshot,
         c.total_quantity,
         c.total_items,
         c.total_amount,
         c.status,
         c.notes,
         c.created_by,
         u.name AS created_by_name,
         c.created_at,
         c.updated_at,
         c.confirmed_at,
         c.confirmed_by,
         c.cancelled_at,
         c.cancelled_by,
         c.cancellation_reason
  FROM challans c
  LEFT JOIN users u ON u.id = c.created_by
`;

/**
 * Auto-generates the next Challan Number, e.g. CHN-2026-000042.
 * The atomic UPSERT on the counter table guarantees uniqueness and gap-free
 * sequencing even when several sales users create challans simultaneously.
 */
export const generateChallanNumber = async (client: PoolClient): Promise<string> => {
  const year = new Date().getFullYear();
  const prefix = `${env.CHALLAN_NUMBER_PREFIX}-${year}`;

  const result = await client.query<{ last_number: string }>(
    `INSERT INTO challan_counters (prefix, last_number)
     VALUES ($1, 1)
     ON CONFLICT (prefix)
     DO UPDATE SET last_number = challan_counters.last_number + 1, updated_at = NOW()
     RETURNING last_number`,
    [prefix],
  );

  const sequence = String(Number(result.rows[0].last_number)).padStart(env.CHALLAN_NUMBER_PADDING, '0');
  return `${prefix}-${sequence}`;
};

export const insertChallan = async (
  client: PoolClient,
  data: {
    challanNumber: string;
    customerId: string;
    customerSnapshot: unknown;
    totalQuantity: number;
    totalItems: number;
    totalAmount: number;
    status: string;
    notes: string | null;
    createdBy: string;
    confirmedBy: string | null;
  },
): Promise<string> => {
  const result = await client.query<{ id: string }>(
    `INSERT INTO challans
       (challan_number, customer_id, customer_snapshot, total_quantity, total_items,
        total_amount, status, notes, created_by, confirmed_by, confirmed_at)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9, $10, CASE WHEN $7 = 'CONFIRMED'::challan_status THEN NOW() ELSE NULL END)
     RETURNING id`,
    [
      data.challanNumber,
      data.customerId,
      JSON.stringify(data.customerSnapshot),
      data.totalQuantity,
      data.totalItems,
      data.totalAmount,
      data.status,
      data.notes,
      data.createdBy,
      data.confirmedBy,
    ],
  );
  return result.rows[0].id;
};

export const insertChallanItems = async (
  client: PoolClient,
  challanId: string,
  items: Array<{
    productId: string;
    productName: string;
    sku: string;
    category: string;
    unitPrice: number;
    warehouseLocation: string;
    quantity: number;
    lineTotal: number;
    productSnapshot: unknown;
  }>,
): Promise<void> => {
  for (const item of items) {
    await client.query(
      `INSERT INTO challan_items
         (challan_id, product_id, product_name, sku, category, unit_price,
          warehouse_location, quantity, line_total, product_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
      [
        challanId,
        item.productId,
        item.productName,
        item.sku,
        item.category,
        item.unitPrice,
        item.warehouseLocation,
        item.quantity,
        item.lineTotal,
        JSON.stringify(item.productSnapshot),
      ],
    );
  }
};

export const findChallanItems = async (challanId: string, client?: PoolClient): Promise<ChallanItem[]> => {
  const sql = `SELECT * FROM challan_items WHERE challan_id = $1 ORDER BY created_at ASC, id ASC`;
  const result = client ? await client.query(sql, [challanId]) : await query(sql, [challanId]);
  return result.rows.map(mapChallanItem);
};

export const findChallanById = async (id: string, client?: PoolClient): Promise<Challan | null> => {
  const sql = `${SELECT_CHALLAN} WHERE c.id = $1`;
  const result = client ? await client.query(sql, [id]) : await query(sql, [id]);
  if (!result.rows[0]) return null;
  const items = await findChallanItems(id, client);
  return mapChallan(result.rows[0], items);
};

/** Locks the challan row so concurrent status changes cannot double-deduct stock. */
export const findChallanByIdForUpdate = async (client: PoolClient, id: string) => {
  const result = await client.query(
    `SELECT id, challan_number, customer_id, status, total_quantity, total_amount
     FROM challans WHERE id = $1 FOR UPDATE`,
    [id],
  );
  return result.rows[0] ?? null;
};

export const findChallans = async (
  filters: ChallanFilters,
  pagination: PaginationOptions,
): Promise<{ items: Challan[]; total: number; sortKey: string }> => {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (filters.search) {
    values.push(`%${filters.search}%`);
    const p = `$${values.length}`;
    conditions.push(`(
      c.challan_number ILIKE ${p} OR
      c.customer_snapshot->>'customerName' ILIKE ${p} OR
      c.customer_snapshot->>'businessName' ILIKE ${p} OR
      c.customer_snapshot->>'mobileNumber' ILIKE ${p}
    )`);
  }
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`c.status = $${values.length}`);
  }
  if (filters.customerId) {
    values.push(filters.customerId);
    conditions.push(`c.customer_id = $${values.length}`);
  }
  if (filters.createdBy) {
    values.push(filters.createdBy);
    conditions.push(`c.created_by = $${values.length}`);
  }
  if (filters.dateFrom) {
    values.push(filters.dateFrom);
    conditions.push(`c.created_at >= $${values.length}::timestamptz`);
  }
  if (filters.dateTo) {
    values.push(filters.dateTo);
    conditions.push(`c.created_at <= $${values.length}::timestamptz`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const sort = resolveSortColumn(pagination.sortBy, CHALLAN_SORT_COLUMNS, 'createdAt');

  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM challans c ${where}`,
    values,
  );
  const dataResult = await query(
    `${SELECT_CHALLAN} ${where}
     ORDER BY ${sort.column} ${pagination.sortOrder}, c.id ASC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, pagination.limit, pagination.offset],
  );

  // List responses carry the line items too, so the client never has to fan out N+1 requests.
  const items: Challan[] = [];
  for (const row of dataResult.rows) {
    items.push(mapChallan(row, await findChallanItems(row.id)));
  }

  return { items, total: Number(countResult.rows[0]?.count ?? 0), sortKey: sort.key };
};

export const markChallanConfirmed = async (client: PoolClient, id: string, userId: string): Promise<void> => {
  await client.query(
    `UPDATE challans
     SET status = 'CONFIRMED', confirmed_at = NOW(), confirmed_by = $2, updated_at = NOW()
     WHERE id = $1`,
    [id, userId],
  );
};

export const markChallanCancelled = async (
  client: PoolClient,
  id: string,
  userId: string,
  reason: string | null,
): Promise<void> => {
  await client.query(
    `UPDATE challans
     SET status = 'CANCELLED', cancelled_at = NOW(), cancelled_by = $2,
         cancellation_reason = $3, updated_at = NOW()
     WHERE id = $1`,
    [id, userId, reason],
  );
};

export const getChallanSummary = async () => {
  const result = await query<{ status: string; count: string; total_amount: string }>(
    `SELECT status, COUNT(*)::text AS count, COALESCE(SUM(total_amount), 0)::text AS total_amount
     FROM challans GROUP BY status`,
  );
  return result.rows.reduce<Record<string, { count: number; totalAmount: number }>>((acc, row) => {
    acc[row.status] = { count: Number(row.count), totalAmount: Number(Number(row.total_amount).toFixed(2)) };
    return acc;
  }, {});
};
