import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { env, isProduction } from './env';
import { logger } from '../common/logger';

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl: env.DB_SSL ? { rejectUnauthorized: false } : undefined,
});

pool.on('error', (error) => {
  logger.error('Unexpected PostgreSQL pool error', error);
});

/** Run a single parameterised query on the shared pool. */
export const query = async <T extends QueryResultRow = any>(
  text: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> => {
  const startedAt = Date.now();
  const result = await pool.query<T>(text, params as any[]);
  if (!isProduction) {
    logger.debug(`SQL (${Date.now() - startedAt}ms, ${result.rowCount ?? 0} rows): ${text.replace(/\s+/g, ' ').trim().slice(0, 160)}`);
  }
  return result;
};

/**
 * Executes `handler` inside a single transaction.
 * Commits on success, rolls back on any thrown error, and always releases the client.
 * This is what guarantees challan creation + stock deduction + movement logging are atomic.
 */
export const withTransaction = async <T>(handler: (client: PoolClient) => Promise<T>): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await handler(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      logger.error('Failed to roll back transaction', rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
};

export const testDatabaseConnection = async (): Promise<void> => {
  const result = await query<{ now: Date }>('SELECT NOW() as now');
  logger.info(`Database connection established at ${result.rows[0].now.toISOString()}`);
};

export const closeDatabase = async (): Promise<void> => {
  await pool.end();
  logger.info('Database pool closed');
};

export type { PoolClient };
