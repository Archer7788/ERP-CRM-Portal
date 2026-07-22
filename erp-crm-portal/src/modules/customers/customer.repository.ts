import { PoolClient } from 'pg';
import { query } from '../../config/database';
import { PaginationOptions, resolveSortColumn } from '../../common/pagination';
import {
  Customer,
  CustomerFilters,
  CustomerFollowUp,
  mapCustomer,
  mapFollowUp,
} from './customer.types';
import { CreateCustomerInput, CreateFollowUpInput, UpdateCustomerInput } from './customer.validation';

/** Whitelisted sortable columns (prevents SQL injection through ?sortBy=). */
export const CUSTOMER_SORT_COLUMNS: Record<string, string> = {
  customerName: 'c.customer_name',
  businessName: 'c.business_name',
  email: 'c.email',
  status: 'c.status',
  customerType: 'c.customer_type',
  followUpDate: 'c.follow_up_date',
  createdAt: 'c.created_at',
  updatedAt: 'c.updated_at',
};

const SELECT_CUSTOMER = `
  SELECT c.id,
         c.customer_name,
         c.mobile_number,
         c.email,
         c.business_name,
         c.gst_number,
         c.customer_type,
         c.address,
         c.status,
         TO_CHAR(c.follow_up_date, 'YYYY-MM-DD') AS follow_up_date,
         c.notes,
         c.created_by,
         u.name AS created_by_name,
         c.created_at,
         c.updated_at
  FROM customers c
  LEFT JOIN users u ON u.id = c.created_by
`;

const buildFilterClause = (filters: CustomerFilters) => {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (filters.search) {
    values.push(`%${filters.search}%`);
    const p = `$${values.length}`;
    conditions.push(`(
      c.customer_name ILIKE ${p} OR
      c.business_name ILIKE ${p} OR
      c.email ILIKE ${p} OR
      c.mobile_number ILIKE ${p} OR
      COALESCE(c.gst_number, '') ILIKE ${p} OR
      c.address ILIKE ${p}
    )`);
  }
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`c.status = $${values.length}`);
  }
  if (filters.customerType) {
    values.push(filters.customerType);
    conditions.push(`c.customer_type = $${values.length}`);
  }
  if (filters.followUpFrom) {
    values.push(filters.followUpFrom);
    conditions.push(`c.follow_up_date >= $${values.length}::date`);
  }
  if (filters.followUpTo) {
    values.push(filters.followUpTo);
    conditions.push(`c.follow_up_date <= $${values.length}::date`);
  }
  if (filters.hasGst !== undefined) {
    conditions.push(filters.hasGst ? 'c.gst_number IS NOT NULL' : 'c.gst_number IS NULL');
  }
  if (filters.createdBy) {
    values.push(filters.createdBy);
    conditions.push(`c.created_by = $${values.length}`);
  }

  return {
    where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    values,
  };
};

export const findCustomers = async (
  filters: CustomerFilters,
  pagination: PaginationOptions,
): Promise<{ items: Customer[]; total: number; sortKey: string }> => {
  const { where, values } = buildFilterClause(filters);
  const sort = resolveSortColumn(pagination.sortBy, CUSTOMER_SORT_COLUMNS, 'createdAt');

  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM customers c ${where.replace(/c\./g, 'c.')}`,
    values,
  );

  const dataResult = await query(
    `${SELECT_CUSTOMER} ${where}
     ORDER BY ${sort.column} ${pagination.sortOrder} NULLS LAST, c.id ASC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, pagination.limit, pagination.offset],
  );

  return {
    items: dataResult.rows.map(mapCustomer),
    total: Number(countResult.rows[0]?.count ?? 0),
    sortKey: sort.key,
  };
};

export const findCustomerById = async (id: string, client?: PoolClient): Promise<Customer | null> => {
  const runner = client ? client.query.bind(client) : query;
  const result = await runner(`${SELECT_CUSTOMER} WHERE c.id = $1`, [id]);
  const row = result.rows[0];
  return row ? mapCustomer(row) : null;
};

/** Locks the customer row for the duration of the surrounding transaction. */
export const findCustomerByIdForUpdate = async (client: PoolClient, id: string) => {
  const result = await client.query(
    `SELECT id, customer_name, mobile_number, email, business_name, gst_number,
            customer_type, address, status
     FROM customers WHERE id = $1 FOR UPDATE`,
    [id],
  );
  return result.rows[0] ?? null;
};

export const findCustomerByMobile = async (mobileNumber: string, excludeId?: string) => {
  const result = await query(
    `SELECT id FROM customers WHERE mobile_number = $1 ${excludeId ? 'AND id <> $2' : ''}`,
    excludeId ? [mobileNumber, excludeId] : [mobileNumber],
  );
  return result.rows[0] ?? null;
};

export const insertCustomer = async (input: CreateCustomerInput, createdBy: string): Promise<Customer> => {
  const result = await query(
    `INSERT INTO customers
       (customer_name, mobile_number, email, business_name, gst_number,
        customer_type, address, status, follow_up_date, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [
      input.customerName,
      input.mobileNumber,
      input.email,
      input.businessName,
      input.gstNumber ?? null,
      input.customerType,
      input.address,
      input.status,
      input.followUpDate ?? null,
      input.notes ?? null,
      createdBy,
    ],
  );
  const created = await findCustomerById(result.rows[0].id);
  return created as Customer;
};

/** Column mapping used to build a dynamic, parameterised UPDATE statement. */
const UPDATABLE_COLUMNS: Record<keyof UpdateCustomerInput, string> = {
  customerName: 'customer_name',
  mobileNumber: 'mobile_number',
  email: 'email',
  businessName: 'business_name',
  gstNumber: 'gst_number',
  customerType: 'customer_type',
  address: 'address',
  status: 'status',
  followUpDate: 'follow_up_date',
  notes: 'notes',
};

export const updateCustomerById = async (id: string, input: UpdateCustomerInput): Promise<Customer | null> => {
  const assignments: string[] = [];
  const values: unknown[] = [];

  (Object.keys(UPDATABLE_COLUMNS) as (keyof UpdateCustomerInput)[]).forEach((key) => {
    if (input[key] !== undefined) {
      values.push(input[key]);
      assignments.push(`${UPDATABLE_COLUMNS[key]} = $${values.length}`);
    }
  });

  if (assignments.length === 0) return findCustomerById(id);

  values.push(id);
  await query(
    `UPDATE customers SET ${assignments.join(', ')}, updated_at = NOW() WHERE id = $${values.length}`,
    values,
  );
  return findCustomerById(id);
};

export const insertFollowUp = async (
  customerId: string,
  input: CreateFollowUpInput,
  createdBy: string,
): Promise<CustomerFollowUp> => {
  const result = await query(
    `INSERT INTO customer_follow_ups (customer_id, note, follow_up_date, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [customerId, input.note, input.followUpDate ?? null, createdBy],
  );
  const followUps = await findFollowUpsByCustomer(customerId);
  return followUps.find((item) => item.id === result.rows[0].id) as CustomerFollowUp;
};

export const findFollowUpsByCustomer = async (customerId: string): Promise<CustomerFollowUp[]> => {
  const result = await query(
    `SELECT f.id,
            f.customer_id,
            f.note,
            TO_CHAR(f.follow_up_date, 'YYYY-MM-DD') AS follow_up_date,
            f.created_by,
            u.name AS created_by_name,
            f.created_at
     FROM customer_follow_ups f
     LEFT JOIN users u ON u.id = f.created_by
     WHERE f.customer_id = $1
     ORDER BY f.created_at DESC`,
    [customerId],
  );
  return result.rows.map(mapFollowUp);
};

export const applyFollowUpToCustomer = async (
  customerId: string,
  followUpDate: string | null,
  status?: string,
): Promise<void> => {
  const assignments: string[] = [];
  const values: unknown[] = [];

  if (followUpDate !== undefined) {
    values.push(followUpDate);
    assignments.push(`follow_up_date = $${values.length}`);
  }
  if (status) {
    values.push(status);
    assignments.push(`status = $${values.length}`);
  }
  if (!assignments.length) return;

  values.push(customerId);
  await query(
    `UPDATE customers SET ${assignments.join(', ')}, updated_at = NOW() WHERE id = $${values.length}`,
    values,
  );
};

export const countCustomersByStatus = async () => {
  const result = await query<{ status: string; count: string }>(
    'SELECT status, COUNT(*)::text AS count FROM customers GROUP BY status',
  );
  return result.rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = Number(row.count);
    return acc;
  }, {});
};
