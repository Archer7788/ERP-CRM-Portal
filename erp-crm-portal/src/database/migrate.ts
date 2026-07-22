import fs from 'fs';
import path from 'path';
import { closeDatabase, pool } from '../config/database';
import { logger } from '../common/logger';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

const ensureMigrationsTable = async (): Promise<void> => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         SERIAL PRIMARY KEY,
      filename   VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);
};

const getAppliedMigrations = async (): Promise<Set<string>> => {
  const result = await pool.query<{ filename: string }>('SELECT filename FROM schema_migrations');
  return new Set(result.rows.map((row) => row.filename));
};

/**
 * Applies every not-yet-applied .sql file in `migrations/`, in filename order.
 * Each file runs inside its own transaction, so a failing migration leaves the
 * database untouched rather than half migrated.
 */
const runMigrations = async (): Promise<void> => {
  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();

  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`Migrations directory not found at ${MIGRATIONS_DIR}`);
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    logger.warn('No migration files found.');
    return;
  }

  let appliedCount = 0;

  for (const file of files) {
    if (applied.has(file)) {
      logger.info(`Skipping already applied migration: ${file}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      appliedCount += 1;
      logger.info(`Applied migration: ${file}`);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Migration failed and was rolled back: ${file}`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  logger.info(`Migrations complete. ${appliedCount} new migration(s) applied.`);
};

runMigrations()
  .then(async () => {
    await closeDatabase();
    process.exit(0);
  })
  .catch(async (error) => {
    logger.error('Migration run failed', error);
    await closeDatabase().catch(() => undefined);
    process.exit(1);
  });
