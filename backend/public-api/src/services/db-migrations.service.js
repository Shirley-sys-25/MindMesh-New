import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../config/logger.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(currentDir, '../db/migrations');

const MIGRATIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

const toChecksum = (value) => createHash('sha256').update(value, 'utf8').digest('hex');

const loadMigrations = async () => {
  const entries = await readdir(migrationsDir, { withFileTypes: true });
  const migrationFiles = entries
    .filter((entry) => entry.isFile() && /\.sql$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const migrations = [];

  for (const fileName of migrationFiles) {
    const absolutePath = path.join(migrationsDir, fileName);
    const sql = await readFile(absolutePath, 'utf8');
    migrations.push({
      version: fileName,
      sql,
      checksum: toChecksum(sql),
    });
  }

  return migrations;
};

const loadAppliedMigrations = async (pool) => {
  await pool.query(MIGRATIONS_TABLE_SQL);
  const result = await pool.query('SELECT version, checksum FROM schema_migrations');
  return new Map(result.rows.map((row) => [row.version, row.checksum]));
};

export const runDatabaseMigrations = async (pool) => {
  const [migrations, appliedMigrations] = await Promise.all([loadMigrations(), loadAppliedMigrations(pool)]);

  for (const migration of migrations) {
    const appliedChecksum = appliedMigrations.get(migration.version);

    if (appliedChecksum) {
      if (appliedChecksum !== migration.checksum) {
        throw new Error(`Migration checksum mismatch: ${migration.version}`);
      }
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(migration.sql);
      await client.query('INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)', [
        migration.version,
        migration.checksum,
      ]);
      await client.query('COMMIT');
      logger.info({ migration: migration.version }, 'database_migration_applied');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
};
