import {Pool} from 'pg';

let pool;

function configured() {
  return typeof process.env.DATABASE_URL === 'string' && process.env.DATABASE_URL.length > 0;
}

function getPool() {
  if (!configured()) return null;
  pool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'false' ? false : {rejectUnauthorized: false},
    max: Number(process.env.DATABASE_POOL_SIZE || 5),
  });
  return pool;
}

export function databaseConfiguration() {
  return {
    configured: configured(),
    provider: configured() ? 'postgresql/tiger-cloud' : 'local-files',
  };
}

export async function databaseHealth() {
  const client = getPool();
  if (!client) return {configured: false, ok: false, provider: 'local-files'};
  const result = await client.query('SELECT current_database() AS database, now() AS server_time');
  return {configured: true, ok: true, provider: 'postgresql/tiger-cloud', ...result.rows[0]};
}

export async function closeDatabase() {
  if (!pool) return;
  await pool.end();
  pool = undefined;
}
