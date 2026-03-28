/**
 * Job de sincronização: puxa dados das APIs governamentais e persiste no PostgreSQL.
 * Pode ser executado via cron ou manualmente: npm run sync
 */
import { pool, query } from "../db/connection.js";
import { CANDIDATOS } from "../config/candidatos.js";
import * as camara from "../services/camaraApi.js";

async function logSync(entidade: string, deputadoId: number, registros: number, erro?: string) {
  await query(
    `INSERT INTO sync_log (entidade, deputado_id, status, registros, erro) VALUES ($1,$2,$3,$4,$5)`,
    [entidade, deputadoId, erro ? "erro" : "ok", registros, erro || null]
  );
}

async function syncDespesas(deputadoId: number) {
  const ano = new Date().getFullYear();
  let pagina = 1;
  let total = 0;

  while (true) {
    const despesas = await camara.getDespesas(deputadoId, ano, pagina, 100);
    if (!despesas.length) break;

    for (const d of despesas) {
      await query(
        `INSERT INTO despesas (deputado_id, ano, mes, tipo_despesa, data_documento,
          valor_documento, valor_liquido, valor_glosa, fornecedor,
          cnpj_cpf_fornecedor, url_documento, cod_documento)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (deputado_id, cod_documento) DO UPDATE SET
          valor_liquido = EXCLUDED.valor_liquido,
          valor_glosa = EXCLUDED.valor_glosa`,
        [
          deputadoId, d.ano, d.mes, d.tipoDespesa, d.dataDocumento,
          d.valorDocumento, d.valorLiquido, d.valorGlosa,
          d.nomeFornecedor, d.cnpjCpfFornecedor, d.urlDocumento,
          d.codDocumento?.toString() || `${d.ano}-${d.mes}-${total}`,
        ]
      );
      total++;
    }
    pagina++;
    if (despesas.length < 100) break;
  }

  await logSync("despesas", deputadoId, total);
  return total;
}

async function syncProposicoes(deputadoId: number) {
  let pagina = 1;
  let total = 0;

  while (true) {
    const props = await camara.getProposicoes(deputadoId, pagina, 100);
    if (!props.length) break;

    for (const p of props) {
      await query(
        `INSERT INTO proposicoes (id, deputado_id, sigla_tipo, numero, ano, ementa, data_apresentacao, uri)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (id) DO UPDATE SET ementa = EXCLUDED.ementa`,
        [p.id, deputadoId, p.siglaTipo, p.numero, p.ano, p.ementa, p.dataApresentacao,
         `https://dadosabertos.camara.leg.br/api/v2/proposicoes/${p.id}`]
      );
      total++;
    }
    pagina++;
    if (props.length < 100) break;
  }

  await logSync("proposicoes", deputadoId, total);
  return total;
}

async function syncEventos(deputadoId: number) {
  let pagina = 1;
  let total = 0;

  while (pagina <= 5) { // limita a 5 páginas (250 eventos recentes)
    const eventos = await camara.getEventos(deputadoId, pagina, 50);
    if (!eventos.length) break;

    for (const e of eventos) {
      const orgao = e.orgaos?.[0];
      await query(
        `INSERT INTO eventos (id, deputado_id, data_inicio, data_fim, situacao, tipo, descricao, orgao_sigla, orgao_nome, url_registro)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (id) DO NOTHING`,
        [e.id, deputadoId, e.dataHoraInicio, e.dataHoraFim, e.situacao,
         e.descricaoTipo, e.descricao, orgao?.sigla, orgao?.nome, e.urlRegistro]
      );
      total++;
    }
    pagina++;
    if (eventos.length < 50) break;
  }

  await logSync("eventos", deputadoId, total);
  return total;
}

async function syncFrentes(deputadoId: number) {
  const frentes = await camara.getFrentes(deputadoId);
  let total = 0;

  for (const f of frentes) {
    await query(
      `INSERT INTO frentes (id, titulo, id_legislatura) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING`,
      [f.id, f.titulo, f.idLegislatura]
    );
    await query(
      `INSERT INTO deputado_frentes (deputado_id, frente_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [deputadoId, f.id]
    );
    total++;
  }

  await logSync("frentes", deputadoId, total);
  return total;
}

async function syncOrgaos(deputadoId: number) {
  const orgaos = await camara.getOrgaos(deputadoId);
  let total = 0;

  for (const o of orgaos) {
    await query(
      `INSERT INTO orgaos_participacao (deputado_id, orgao_id, sigla, nome, titulo, data_inicio, data_fim)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [deputadoId, o.idOrgao, o.siglaOrgao, o.nomeOrgao, o.titulo, o.dataInicio, o.dataFim]
    );
    total++;
  }

  await logSync("orgaos", deputadoId, total);
  return total;
}

// --- Execução principal ---
async function syncAll() {
  console.log("🔄 Iniciando sincronização completa...\n");

  for (const c of CANDIDATOS) {
    console.log(`📥 ${c.nome} (${c.id})...`);
    try {
      const desp = await syncDespesas(c.id);
      console.log(`   Despesas: ${desp}`);

      const prop = await syncProposicoes(c.id);
      console.log(`   Proposições: ${prop}`);

      const ev = await syncEventos(c.id);
      console.log(`   Eventos: ${ev}`);

      const fr = await syncFrentes(c.id);
      console.log(`   Frentes: ${fr}`);

      const org = await syncOrgaos(c.id);
      console.log(`   Órgãos: ${org}`);
    } catch (err) {
      console.error(`   ❌ Erro:`, err);
    }
    // Rate limiting gentil
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Atualiza materialized view
  try {
    await query("REFRESH MATERIALIZED VIEW CONCURRENTLY mv_resumo_deputados");
    console.log("\n📊 Materialized view atualizada.");
  } catch {
    console.log("\n⚠️  Materialized view não atualizada (pode não existir dados ainda).");
  }

  console.log("\n✅ Sincronização concluída!");
  await pool.end();
}

// Executa se chamado diretamente
syncAll();
