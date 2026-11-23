import mysql from 'mysql2/promise';

let pool: mysql.Pool | null = null;
let schemaPromise: Promise<void> | null = null;

/**
 * O armazenamento em banco é usado quando existe DATABASE_URL.
 * Testes automatizados e execução local sem banco usam ELEFANTE_STORAGE=file.
 */
export function isDatabaseEnabled(): boolean {
  if (process.env.ELEFANTE_STORAGE === 'file') return false;
  return Boolean(process.env.DATABASE_URL?.trim());
}

function buildPoolOptions(dsn: string): mysql.PoolOptions {
  const url = new URL(dsn);
  const sslMode = (
    url.searchParams.get('ssl-mode') ??
    url.searchParams.get('sslmode') ??
    url.searchParams.get('ssl') ??
    ''
  ).toUpperCase();

  const options: mysql.PoolOptions = {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ''),
    waitForConnections: true,
    connectionLimit: 10,
    maxIdle: 10,
    idleTimeout: 60_000,
    queueLimit: 0,
    charset: 'utf8mb4_unicode_ci',
    timezone: 'Z',
    enableKeepAlive: true,
    connectTimeout: 15_000,
  };

  if (sslMode && sslMode !== 'DISABLED' && sslMode !== 'FALSE') {
    options.ssl = {
      rejectUnauthorized: sslMode === 'VERIFY_CA' || sslMode === 'VERIFY_IDENTITY',
    };
  }

  return options;
}

export function getPool(): mysql.Pool {
  if (pool) return pool;
  const dsn = process.env.DATABASE_URL?.trim();
  if (!dsn) {
    throw new Error('DATABASE_URL não configurada para o armazenamento persistente.');
  }
  pool = mysql.createPool(buildPoolOptions(dsn));
  return pool;
}

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS er_installation_state (
     installation_id VARCHAR(32) NOT NULL,
     payload LONGTEXT NOT NULL,
     updated_at DATETIME(3) NOT NULL,
     PRIMARY KEY (installation_id)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS er_files (
     installation_id VARCHAR(32) NOT NULL,
     file_id VARCHAR(160) NOT NULL,
     mime_type VARCHAR(100) NOT NULL,
     size_bytes INT UNSIGNED NOT NULL,
     payload LONGBLOB NOT NULL,
     created_at DATETIME(3) NOT NULL,
     PRIMARY KEY (installation_id, file_id)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS er_backups (
     backup_id VARCHAR(160) NOT NULL,
     installation_id VARCHAR(32) NOT NULL,
     size_bytes BIGINT UNSIGNED NOT NULL,
     created_at DATETIME(3) NOT NULL,
     PRIMARY KEY (backup_id),
     KEY idx_er_backups_installation (installation_id)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS er_backup_chunks (
     backup_id VARCHAR(160) NOT NULL,
     chunk_index INT UNSIGNED NOT NULL,
     payload MEDIUMBLOB NOT NULL,
     PRIMARY KEY (backup_id, chunk_index)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

/** Cria o esquema uma única vez por processo, com nova tentativa em caso de falha. */
export async function ensureSchema(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const p = getPool();
      for (const statement of SCHEMA_STATEMENTS) {
        await p.query(statement);
      }
    })().catch((err) => {
      schemaPromise = null;
      throw err;
    });
  }
  return schemaPromise;
}

export async function checkDatabase(): Promise<boolean> {
  const p = getPool();
  await p.query('SELECT 1');
  return true;
}
