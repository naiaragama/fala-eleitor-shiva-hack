/**
 * Retry: busca apenas os dados que falharam no setup inicial.
 * Faz requests menores com delay maior para evitar 504.
 *
 * Uso no Replit: npx tsx src/db/retry-sync.ts
 */
import pg from "pg";
import * as camara from "../services/camaraApi.js";
import { CANDIDATOS } from "../config/candidatos.js";

const { Pool } = pg;
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://postgres:password@helium/heliumdb?sslmode=disable",
  ssl: false,
});

async function q(text: string, params?: any[]) {
  return pool.query(text, params);
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function retryEventos(deputadoId: number) {
  let total = 0;
  for (let pagina = 1; pagina <= 3; pagina++) {
    try {
      const eventos = await camara.getEventos(deputadoId, pagina, 20);
      if (!eventos.length) break;
      for (const e of eventos) {
        const orgao = e.orgaos?.[0];
        await q(
          `INSERT INTO eventos (id, deputado_id, data_inicio, data_fim, situacao, tipo, descricao, orgao_sigla, orgao_nome, url_registro)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING`,
          [e.id, deputadoId, e.dataHoraInicio, e.dataHoraFim, e.situacao,
           e.descricaoTipo, e.descricao, orgao?.sigla, orgao?.nome, e.urlRegistro]
        );
        total++;
      }
      if (eventos.length < 20) break;
      await delay(2000);
    } catch (err: any) {
      console.log(`     ⚠️ Eventos pag ${pagina}: ${err.message}`);
      await delay(5000);
    }
  }
  return total;
}

async function retryFrentes(deputadoId: number) {
  try {
    const frentes = await camara.getFrentes(deputadoId);
    let total = 0;
    for (const f of frentes) {
      await q(`INSERT INTO frentes (id, titulo, id_legislatura) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING`, [f.id, f.titulo, f.idLegislatura]);
      await q(`INSERT INTO deputado_frentes (deputado_id, frente_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [deputadoId, f.id]);
      total++;
    }
    return total;
  } catch (err: any) {
    console.log(`     ⚠️ Frentes: ${err.message}`);
    return 0;
  }
}

async function retryOrgaos(deputadoId: number) {
  try {
    await q(`DELETE FROM orgaos_participacao WHERE deputado_id = $1`, [deputadoId]);
    const orgaos = await camara.getOrgaos(deputadoId);
    let total = 0;
    for (const o of orgaos) {
      await q(
        `INSERT INTO orgaos_participacao (deputado_id, orgao_id, sigla, nome, titulo, data_inicio, data_fim)
        VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [deputadoId, o.idOrgao, o.siglaOrgao, o.nomeOrgao, o.titulo, o.dataInicio, o.dataFim]
      );
      total++;
    }
    return total;
  } catch (err: any) {
    console.log(`     ⚠️ Órgãos: ${err.message}`);
    return 0;
  }
}

async function retryProposicoes(deputadoId: number) {
  // Verifica quantas já temos
  const existing = await q(`SELECT COUNT(*) as c FROM proposicoes WHERE deputado_id = $1`, [deputadoId]);
  const count = Number(existing.rows[0].c);
  if (count > 50) {
    console.log(`     Proposições: já tem ${count}, pulando`);
    return 0;
  }

  let total = 0;
  for (let pagina = 1; pagina <= 5; pagina++) {
    try {
      const props = await camara.getProposicoes(deputadoId, pagina, 15);
      if (!props.length) break;
      for (const p of props) {
        await q(
          `INSERT INTO proposicoes (id, deputado_id, sigla_tipo, numero, ano, ementa, data_apresentacao, uri)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO UPDATE SET ementa = EXCLUDED.ementa`,
          [p.id, deputadoId, p.siglaTipo, p.numero, p.ano, p.ementa, p.dataApresentacao,
           `https://dadosabertos.camara.leg.br/api/v2/proposicoes/${p.id}`]
        );
        total++;
      }
      if (props.length < 15) break;
      await delay(2000);
    } catch (err: any) {
      console.log(`     ⚠️ Proposições pag ${pagina}: ${err.message}`);
      await delay(5000);
    }
  }
  return total;
}

async function run() {
  console.log("🔄 Retry - buscando dados que falharam...\n");

  for (const c of CANDIDATOS) {
    console.log(`  📥 ${c.nome} (${c.id})...`);

    const ev = await retryEventos(c.id);
    console.log(`     Eventos: ${ev}`);
    await delay(3000);

    const fr = await retryFrentes(c.id);
    console.log(`     Frentes: ${fr}`);
    await delay(3000);

    const org = await retryOrgaos(c.id);
    console.log(`     Órgãos: ${org}`);
    await delay(3000);

    const prop = await retryProposicoes(c.id);
    console.log(`     Proposições (novas): ${prop}`);
    await delay(3000);
  }

  // Refresh materialized view
  try {
    await q("REFRESH MATERIALIZED VIEW CONCURRENTLY mv_resumo_deputados");
    console.log("\n📊 View atualizada.");
  } catch { /* ok */ }

  // Resumo
  const counts = await q(`
    SELECT
      (SELECT COUNT(*) FROM deputados) as deputados,
      (SELECT COUNT(*) FROM despesas) as despesas,
      (SELECT COUNT(*) FROM proposicoes) as proposicoes,
      (SELECT COUNT(*) FROM eventos) as eventos,
      (SELECT COUNT(*) FROM frentes) as frentes,
      (SELECT COUNT(*) FROM orgaos_participacao) as orgaos
  `);
  const r = counts.rows[0];
  console.log(`\n📊 Total: ${r.deputados} deputados | ${r.despesas} despesas | ${r.proposicoes} proposições | ${r.eventos} eventos | ${r.frentes} frentes | ${r.orgaos} órgãos`);
  console.log("✅ Retry concluído!\n");

  await pool.end();
}

run();
