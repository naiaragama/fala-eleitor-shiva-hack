import { pool } from "./connection.js";

async function test() {
  try {
    const r = await pool.query("SELECT NOW() as now, current_database() as db");
    console.log("✅ Conectado:", r.rows[0]);
  } catch (err) {
    console.error("❌ Erro de conexão:", err);
  } finally {
    await pool.end();
  }
}

test();
