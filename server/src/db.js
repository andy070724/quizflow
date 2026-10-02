import pg from 'pg';
export function createPool() {
  return new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined });
}
export async function migrate(pool) {
  // Additive, idempotent schema for v1. Versioned migrations are needed for future destructive changes.
  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS quizzes (
    id UUID PRIMARY KEY, owner_id UUID NOT NULL REFERENCES users(id), title TEXT NOT NULL,
    questions JSONB NOT NULL, duration INTEGER NOT NULL CHECK(duration BETWEEN 10 AND 120),
    source TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS sessions (
    code TEXT PRIMARY KEY, owner_id UUID NOT NULL REFERENCES users(id), quiz_id UUID NOT NULL REFERENCES quizzes(id),
    data JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE INDEX IF NOT EXISTS quizzes_owner_idx ON quizzes(owner_id);
    CREATE INDEX IF NOT EXISTS sessions_owner_idx ON sessions(owner_id);`);
}
export async function getSession(pool, code) {
  const {rows} = await pool.query('SELECT data FROM sessions WHERE code=$1', [code]);
  return rows[0]?.data;
}
export async function mutateSession(pool, code, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const {rows} = await client.query('SELECT data FROM sessions WHERE code=$1 FOR UPDATE', [code]);
    if (!rows[0]) { const err = new Error('Session not found.'); err.status=404; throw err; }
    const data = rows[0].data;
    const result = fn(data);
    await client.query('UPDATE sessions SET data=$2 WHERE code=$1', [code, JSON.stringify(data)]);
    await client.query('COMMIT');
    return {data, result};
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}
