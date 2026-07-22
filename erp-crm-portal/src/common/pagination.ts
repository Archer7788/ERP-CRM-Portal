import { z } from 'zod';
import { env } from '../config/env';

export interface PaginationOptions {
  page: number;
  limit: number;
  offset: number;
  sortBy?: string;
  sortOrder: 'ASC' | 'DESC';
  search?: string;
}

export interface PaginationMeta {
  /** Index signature keeps the meta block extensible (e.g. an extra `summary` key). */
  [key: string]: unknown;
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasPreviousPage: boolean;
    hasNextPage: boolean;
  };
  sort: { sortBy: string; sortOrder: 'ASC' | 'DESC' };
  filters: Record<string, unknown>;
}

/** Base query-string schema shared by every list endpoint. */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'page must be >= 1').default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1, 'limit must be >= 1')
    .max(env.MAX_PAGE_SIZE, `limit cannot exceed ${env.MAX_PAGE_SIZE}`)
    .default(env.DEFAULT_PAGE_SIZE),
  sortBy: z.string().trim().min(1).optional(),
  sortOrder: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .optional()
    .transform((value) => (value ? (value.toUpperCase() as 'ASC' | 'DESC') : 'DESC')),
  search: z.string().trim().min(1).max(120).optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const buildPaginationOptions = (query: PaginationQuery): PaginationOptions => ({
  page: query.page,
  limit: query.limit,
  offset: (query.page - 1) * query.limit,
  sortBy: query.sortBy,
  sortOrder: query.sortOrder,
  search: query.search,
});

/**
 * Resolves a client supplied `sortBy` against a whitelist of allowed columns.
 * Anything not on the whitelist falls back to the default column, which keeps the
 * ORDER BY clause free of user controlled SQL.
 */
export const resolveSortColumn = (
  sortBy: string | undefined,
  allowed: Record<string, string>,
  defaultKey: string,
): { key: string; column: string } => {
  if (sortBy && Object.prototype.hasOwnProperty.call(allowed, sortBy)) {
    return { key: sortBy, column: allowed[sortBy] };
  }
  return { key: defaultKey, column: allowed[defaultKey] };
};

export const buildPaginationMeta = (
  options: PaginationOptions,
  totalItems: number,
  sortKey: string,
  filters: Record<string, unknown> = {},
): PaginationMeta => {
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / options.limit);
  return {
    pagination: {
      page: options.page,
      limit: options.limit,
      totalItems,
      totalPages,
      hasPreviousPage: options.page > 1,
      hasNextPage: options.page < totalPages,
    },
    sort: { sortBy: sortKey, sortOrder: options.sortOrder },
    filters: Object.fromEntries(
      Object.entries(filters).filter(([, value]) => value !== undefined && value !== null && value !== ''),
    ),
  };
};
