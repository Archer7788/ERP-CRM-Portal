import { PoolClient } from 'pg';
import { query } from '../../config/database';
import { PaginationOptions, resolveSortColumn } from '../../common/pagination';
import { Product, ProductFilters, mapProduct } from './product.types';
import { CreateProductInput, UpdateProductInput } from './product.validation';

export const PRODUCT_SORT_COLUMNS: Record<string, string> = {
  productName: 'p.product_name',
  sku: 'p.sku',
  category: 'p.category',
  unitPrice: 'p.unit_price',
  currentStock: 'p.current_stock',
  minStockAlertQuantity: 'p.min_stock_alert_quantity',
  warehouseLocation: 'p.warehouse_location',
  createdAt: 'p.created_at',
  updatedAt: 'p.updated_at',
};

const SELECT_PRODUCT = `
  SELECT p.id,
         p.product_name,
         p.sku,
         p.category,
         p.unit_price,
         p.current_stock,
         p.min_stock_alert_quantity,
         p.warehouse_location,
         p.description,
         p.image_url,
         p.image_key,
         p.is_active,
         p.created_by,
         u.name AS created_by_name,
         p.created_at,
         p.updated_at
  FROM products p
  LEFT JOIN users u ON u.id = p.created_by
`;

export const buildProductFilterClause = (filters: ProductFilters, startIndex = 1) => {
  const conditions: string[] = [];
  const values: unknown[] = [];
  /** Returns the placeholder for the value that was just pushed onto `values`. */
  const nextParam = () => `$${startIndex - 1 + values.length}`;

  if (filters.search) {
    values.push(`%${filters.search}%`);
    const p = nextParam();
    conditions.push(`(
      p.product_name ILIKE ${p} OR
      p.sku ILIKE ${p} OR
      p.category ILIKE ${p} OR
      p.warehouse_location ILIKE ${p} OR
      COALESCE(p.description, '') ILIKE ${p}
    )`);
  }
  if (filters.category) {
    values.push(filters.category);
    conditions.push(`p.category ILIKE ${nextParam()}`);
  }
  if (filters.warehouseLocation) {
    values.push(filters.warehouseLocation);
    conditions.push(`p.warehouse_location ILIKE ${nextParam()}`);
  }
  if (filters.isActive !== undefined) {
    values.push(filters.isActive);
    conditions.push(`p.is_active = ${nextParam()}`);
  }
  if (filters.lowStockOnly) {
    conditions.push('p.current_stock <= p.min_stock_alert_quantity');
  }
  if (filters.outOfStockOnly) {
    conditions.push('p.current_stock = 0');
  }
  if (filters.minPrice !== undefined) {
    values.push(filters.minPrice);
    conditions.push(`p.unit_price >= ${nextParam()}`);
  }
  if (filters.maxPrice !== undefined) {
    values.push(filters.maxPrice);
    conditions.push(`p.unit_price <= ${nextParam()}`);
  }

  return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', values };
};

export const findProducts = async (
  filters: ProductFilters,
  pagination: PaginationOptions,
): Promise<{ items: Product[]; total: number; sortKey: string }> => {
  const { where, values } = buildProductFilterClause(filters, 1);
  const sort = resolveSortColumn(pagination.sortBy, PRODUCT_SORT_COLUMNS, 'createdAt');

  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM products p ${where}`,
    values,
  );
  const dataResult = await query(
    `${SELECT_PRODUCT} ${where}
     ORDER BY ${sort.column} ${pagination.sortOrder} NULLS LAST, p.id ASC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, pagination.limit, pagination.offset],
  );

  return {
    items: dataResult.rows.map(mapProduct),
    total: Number(countResult.rows[0]?.count ?? 0),
    sortKey: sort.key,
  };
};

export const findProductById = async (id: string): Promise<Product | null> => {
  const result = await query(`${SELECT_PRODUCT} WHERE p.id = $1`, [id]);
  return result.rows[0] ? mapProduct(result.rows[0]) : null;
};

export const findProductBySku = async (sku: string, excludeId?: string) => {
  const result = await query(
    `SELECT id, sku FROM products WHERE sku = $1 ${excludeId ? 'AND id <> $2' : ''}`,
    excludeId ? [sku, excludeId] : [sku],
  );
  return result.rows[0] ?? null;
};

/**
 * Locks the given product rows for the duration of the transaction.
 * Rows are locked in a deterministic (id) order to avoid deadlocks between
 * concurrent challan confirmations touching overlapping product sets.
 */
export const lockProductsForUpdate = async (client: PoolClient, productIds: string[]) => {
  const result = await client.query(
    `SELECT id, product_name, sku, category, unit_price, current_stock,
            min_stock_alert_quantity, warehouse_location, description, image_url, is_active
     FROM products
     WHERE id = ANY($1::uuid[])
     ORDER BY id
     FOR UPDATE`,
    [productIds],
  );
  return result.rows;
};

export const insertProduct = async (input: CreateProductInput, createdBy: string): Promise<Product> => {
  const result = await query(
    `INSERT INTO products
       (product_name, sku, category, unit_price, current_stock,
        min_stock_alert_quantity, warehouse_location, description, is_active, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      input.productName,
      input.sku,
      input.category,
      input.unitPrice,
      input.currentStock,
      input.minStockAlertQuantity,
      input.warehouseLocation,
      input.description ?? null,
      input.isActive,
      createdBy,
    ],
  );
  return (await findProductById(result.rows[0].id)) as Product;
};

const UPDATABLE_COLUMNS: Record<string, string> = {
  productName: 'product_name',
  sku: 'sku',
  category: 'category',
  unitPrice: 'unit_price',
  currentStock: 'current_stock',
  minStockAlertQuantity: 'min_stock_alert_quantity',
  warehouseLocation: 'warehouse_location',
  description: 'description',
  isActive: 'is_active',
};

export const updateProductById = async (
  id: string,
  input: UpdateProductInput,
  client?: PoolClient,
): Promise<Product | null> => {
  const assignments: string[] = [];
  const values: unknown[] = [];

  Object.keys(UPDATABLE_COLUMNS).forEach((key) => {
    const value = (input as Record<string, unknown>)[key];
    if (value !== undefined) {
      values.push(value);
      assignments.push(`${UPDATABLE_COLUMNS[key]} = $${values.length}`);
    }
  });

  if (assignments.length === 0) return findProductById(id);

  values.push(id);
  const sql = `UPDATE products SET ${assignments.join(', ')}, updated_at = NOW() WHERE id = $${values.length}`;
  if (client) {
    await client.query(sql, values);
  } else {
    await query(sql, values);
  }
  return findProductById(id);
};

export const updateProductImage = async (id: string, imageUrl: string, imageKey: string): Promise<Product | null> => {
  await query('UPDATE products SET image_url = $1, image_key = $2, updated_at = NOW() WHERE id = $3', [
    imageUrl,
    imageKey,
    id,
  ]);
  return findProductById(id);
};

export const listDistinctCategories = async (): Promise<string[]> => {
  const result = await query<{ category: string }>(
    'SELECT DISTINCT category FROM products ORDER BY category ASC',
  );
  return result.rows.map((row) => row.category);
};

export const listDistinctWarehouses = async (): Promise<string[]> => {
  const result = await query<{ warehouse_location: string }>(
    'SELECT DISTINCT warehouse_location FROM products ORDER BY warehouse_location ASC',
  );
  return result.rows.map((row) => row.warehouse_location);
};
