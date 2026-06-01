import pg from "pg";

const { Pool } = pg;

export type DbPool = pg.Pool;
export type DbClient = pg.PoolClient;

const DEFAULT_DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://localhost:5432/agent_monitor";

let pool: DbPool | null = null;

export function getPool(): DbPool {
  if (!pool) {
    pool = new Pool({ connectionString: DEFAULT_DATABASE_URL });
    pool.on("error", (err) => {
      console.error("[db] unexpected pool error:", err.message);
    });
  }
  return pool;
}

export async function query<T extends pg.QueryResultRow = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

export async function queryOne<T extends pg.QueryResultRow = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** Execute a write query (INSERT/UPDATE/DELETE) and return the full result with rowCount. */
export async function execute(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult> {
  return getPool().query(text, params);
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
