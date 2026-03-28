import pg from "pg";

const { Pool } = pg;

// Replit: usa DATABASE_URL automaticamente
// Local: configure no .env
const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:password@helium/heliumdb?sslmode=disable";

export const pool = new Pool({
  connectionString: DATABASE_URL,
  // Replit PostgreSQL interno não usa SSL
  ssl: DATABASE_URL.includes("sslmode=disable") ? false : undefined,
});

export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params);
}
