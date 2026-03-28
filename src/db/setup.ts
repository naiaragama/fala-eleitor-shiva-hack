/**
 * Script único para rodar no Replit:
 * 1. Cria todas as tabelas (migrate)
 * 2. Popula deputados do MVP (seed)
 * 3. Sincroniza dados das APIs governamentais (sync)
 *
 * Uso no shell do Replit:
 *   npx tsx src/db/setup.ts
 */
import pg from "pg";
import { CANDIDATOS } from "../config/candidatos.js";
import * as camara from "../services/camaraApi.js";

const { Pool } = pg;

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:password@helium/heliumdb?sslmode=disable";

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes("sslmode=disable") ? false : undefined,
});

async function q(text: string, params?: any[]) {
  return pool.query(text, params);
}

// =============================================
// PASSO 1: MIGRATE
// =============================================
async function migrate() {
  console.log("\n🔄 [1/3] Criando tabelas...\n");

  await q(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

  await q(`
    CREATE TABLE IF NOT EXISTS deputados (
      id              INTEGER PRIMARY KEY,
      nome_civil      TEXT NOT NULL,
      nome_eleitoral  TEXT NOT NULL,
      cpf             TEXT,
      sexo            CHAR(1),
      data_nascimento DATE,
      uf_nascimento   TEXT,
      municipio_nascimento TEXT,
      escolaridade    TEXT,
      partido         TEXT NOT NULL,
      uf              TEXT NOT NULL DEFAULT 'RJ',
      espectro        TEXT,
      situacao        TEXT,
      condicao_eleitoral TEXT,
      votos_2022      TEXT,
      foto_url        TEXT,
      email           TEXT,
      gabinete        JSONB,
      redes_sociais   JSONB,
      cassado         BOOLEAN DEFAULT FALSE,
      meta            JSONB DEFAULT '{}',
      atualizado_em   TIMESTAMPTZ DEFAULT NOW(),
      criado_em       TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await q(`CREATE INDEX IF NOT EXISTS idx_deputados_partido ON deputados(partido)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_deputados_uf ON deputados(uf)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_deputados_nome_trgm ON deputados USING gin(nome_eleitoral gin_trgm_ops)`);

  await q(`
    CREATE TABLE IF NOT EXISTS despesas (
      id              SERIAL PRIMARY KEY,
      deputado_id     INTEGER NOT NULL REFERENCES deputados(id),
      ano             SMALLINT NOT NULL,
      mes             SMALLINT NOT NULL,
      tipo_despesa    TEXT NOT NULL,
      data_documento  DATE,
      valor_documento NUMERIC(12,2),
      valor_liquido   NUMERIC(12,2),
      valor_glosa     NUMERIC(12,2) DEFAULT 0,
      fornecedor      TEXT,
      cnpj_cpf_fornecedor TEXT,
      url_documento   TEXT,
      cod_documento   TEXT,
      UNIQUE(deputado_id, cod_documento)
    )
  `);
  await q(`CREATE INDEX IF NOT EXISTS idx_despesas_deputado_ano ON despesas(deputado_id, ano DESC, mes DESC)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_despesas_tipo ON despesas(tipo_despesa)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_despesas_fornecedor ON despesas(cnpj_cpf_fornecedor)`);

  await q(`
    CREATE TABLE IF NOT EXISTS proposicoes (
      id                  INTEGER PRIMARY KEY,
      deputado_id         INTEGER NOT NULL REFERENCES deputados(id),
      sigla_tipo          TEXT NOT NULL,
      numero              INTEGER,
      ano                 SMALLINT,
      ementa              TEXT,
      data_apresentacao   TIMESTAMPTZ,
      keywords            TEXT[],
      temas               TEXT[],
      uri                 TEXT
    )
  `);
  await q(`CREATE INDEX IF NOT EXISTS idx_proposicoes_deputado ON proposicoes(deputado_id, ano DESC)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_proposicoes_tipo ON proposicoes(sigla_tipo)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_proposicoes_ementa_trgm ON proposicoes USING gin(ementa gin_trgm_ops)`);

  await q(`
    CREATE TABLE IF NOT EXISTS eventos (
      id              INTEGER PRIMARY KEY,
      deputado_id     INTEGER NOT NULL REFERENCES deputados(id),
      data_inicio     TIMESTAMPTZ,
      data_fim        TIMESTAMPTZ,
      situacao        TEXT,
      tipo            TEXT,
      descricao       TEXT,
      orgao_sigla     TEXT,
      orgao_nome      TEXT,
      url_registro    TEXT
    )
  `);
  await q(`CREATE INDEX IF NOT EXISTS idx_eventos_deputado_data ON eventos(deputado_id, data_inicio DESC)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_eventos_tipo ON eventos(tipo)`);

  await q(`
    CREATE TABLE IF NOT EXISTS frentes (
      id              INTEGER PRIMARY KEY,
      titulo          TEXT NOT NULL,
      id_legislatura  SMALLINT
    )
  `);
  await q(`
    CREATE TABLE IF NOT EXISTS deputado_frentes (
      deputado_id     INTEGER REFERENCES deputados(id),
      frente_id       INTEGER REFERENCES frentes(id),
      PRIMARY KEY (deputado_id, frente_id)
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS orgaos_participacao (
      id              SERIAL PRIMARY KEY,
      deputado_id     INTEGER NOT NULL REFERENCES deputados(id),
      orgao_id        INTEGER,
      sigla           TEXT,
      nome            TEXT,
      titulo          TEXT,
      data_inicio     DATE,
      data_fim        DATE
    )
  `);
  await q(`CREATE INDEX IF NOT EXISTS idx_orgaos_deputado ON orgaos_participacao(deputado_id)`);

  await q(`
    CREATE TABLE IF NOT EXISTS remuneracao (
      id                  SERIAL PRIMARY KEY,
      deputado_id         INTEGER NOT NULL REFERENCES deputados(id),
      mes                 SMALLINT NOT NULL,
      ano                 SMALLINT NOT NULL,
      remuneracao_bruta   NUMERIC(12,2),
      abate_teto          NUMERIC(12,2) DEFAULT 0,
      gratificacao_natal  NUMERIC(12,2) DEFAULT 0,
      ferias              NUMERIC(12,2) DEFAULT 0,
      outras_remuneracoes NUMERIC(12,2) DEFAULT 0,
      irrf                NUMERIC(12,2) DEFAULT 0,
      pss                 NUMERIC(12,2) DEFAULT 0,
      demais_deducoes     NUMERIC(12,2) DEFAULT 0,
      remuneracao_liquida NUMERIC(12,2),
      UNIQUE(deputado_id, ano, mes)
    )
  `);
  await q(`CREATE INDEX IF NOT EXISTS idx_remuneracao_deputado_periodo ON remuneracao(deputado_id, ano DESC, mes DESC)`);

  await q(`
    CREATE TABLE IF NOT EXISTS filiacoes (
      id              SERIAL PRIMARY KEY,
      deputado_id     INTEGER NOT NULL REFERENCES deputados(id),
      partido         TEXT NOT NULL,
      data_filiacao   DATE,
      data_desfiliacao DATE,
      situacao        TEXT
    )
  `);
  await q(`CREATE INDEX IF NOT EXISTS idx_filiacoes_deputado ON filiacoes(deputado_id)`);

  await q(`
    CREATE TABLE IF NOT EXISTS patrimonio (
      id              SERIAL PRIMARY KEY,
      deputado_id     INTEGER NOT NULL REFERENCES deputados(id),
      ano_eleicao     SMALLINT NOT NULL,
      descricao       TEXT,
      valor           NUMERIC(14,2),
      tipo_bem        TEXT
    )
  `);
  await q(`CREATE INDEX IF NOT EXISTS idx_patrimonio_deputado ON patrimonio(deputado_id, ano_eleicao DESC)`);

  await q(`
    CREATE TABLE IF NOT EXISTS conversas (
      id              SERIAL PRIMARY KEY,
      telefone        TEXT NOT NULL,
      direcao         TEXT NOT NULL CHECK(direcao IN ('in', 'out')),
      mensagem        TEXT NOT NULL,
      contexto        JSONB DEFAULT '{}',
      tess_session_id TEXT,
      criado_em       TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await q(`CREATE INDEX IF NOT EXISTS idx_conversas_telefone ON conversas(telefone, criado_em DESC)`);

  await q(`
    CREATE TABLE IF NOT EXISTS sync_log (
      id              SERIAL PRIMARY KEY,
      entidade        TEXT NOT NULL,
      deputado_id     INTEGER,
      status          TEXT NOT NULL DEFAULT 'ok',
      registros       INTEGER DEFAULT 0,
      erro            TEXT,
      executado_em    TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  console.log("  ✅ Tabelas criadas com sucesso!");
}

// =============================================
// PASSO 2: SEED (deputados do MVP)
// =============================================
async function seed() {
  console.log("\n🌱 [2/3] Populando deputados do MVP...\n");

  for (const c of CANDIDATOS) {
    try {
      const perfil = await camara.getPerfil(c.id);
      const status = perfil.ultimoStatus;

      await q(
        `INSERT INTO deputados (
          id, nome_civil, nome_eleitoral, cpf, sexo, data_nascimento,
          uf_nascimento, municipio_nascimento, escolaridade,
          partido, uf, espectro, situacao, condicao_eleitoral,
          votos_2022, foto_url, email, gabinete, redes_sociais, cassado
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
        ON CONFLICT (id) DO UPDATE SET
          nome_civil = EXCLUDED.nome_civil,
          partido = EXCLUDED.partido,
          situacao = EXCLUDED.situacao,
          gabinete = EXCLUDED.gabinete,
          atualizado_em = NOW()`,
        [
          c.id,
          perfil.nomeCivil,
          status?.nomeEleitoral || status?.nome || c.nome,
          perfil.cpf,
          perfil.sexo,
          perfil.dataNascimento,
          perfil.ufNascimento,
          perfil.municipioNascimento,
          perfil.escolaridade,
          c.partido,
          status?.siglaUf || "RJ",
          c.espectro,
          status?.situacao,
          status?.condicaoEleitoral,
          c.votos2022,
          `https://www.camara.leg.br/internet/deputado/bandep/${c.id}.jpg`,
          status?.gabinete?.email,
          JSON.stringify(status?.gabinete || {}),
          JSON.stringify(perfil.redeSocial || []),
          c.cassado || false,
        ]
      );
      console.log(`  ✅ ${c.nome} (${c.id})`);
    } catch (err: any) {
      console.error(`  ❌ ${c.nome}: ${err.message}`);
    }
  }
}

// =============================================
// PASSO 3: SYNC (dados das APIs governamentais)
// =============================================
async function logSync(entidade: string, deputadoId: number, registros: number, erro?: string) {
  await q(
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
      await q(
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

  // Limita a 10 páginas para o MVP (200 proposições)
  while (pagina <= 10) {
    const props = await camara.getProposicoes(deputadoId, pagina, 20);
    if (!props.length) break;

    for (const p of props) {
      await q(
        `INSERT INTO proposicoes (id, deputado_id, sigla_tipo, numero, ano, ementa, data_apresentacao, uri)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (id) DO UPDATE SET ementa = EXCLUDED.ementa`,
        [p.id, deputadoId, p.siglaTipo, p.numero, p.ano, p.ementa, p.dataApresentacao,
         `https://dadosabertos.camara.leg.br/api/v2/proposicoes/${p.id}`]
      );
      total++;
    }
    pagina++;
    if (props.length < 20) break;
  }

  await logSync("proposicoes", deputadoId, total);
  return total;
}

async function syncEventos(deputadoId: number) {
  let pagina = 1;
  let total = 0;

  while (pagina <= 3) {
    const eventos = await camara.getEventos(deputadoId, pagina, 50);
    if (!eventos.length) break;

    for (const e of eventos) {
      const orgao = e.orgaos?.[0];
      await q(
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
    await q(
      `INSERT INTO frentes (id, titulo, id_legislatura) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING`,
      [f.id, f.titulo, f.idLegislatura]
    );
    await q(
      `INSERT INTO deputado_frentes (deputado_id, frente_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [deputadoId, f.id]
    );
    total++;
  }

  await logSync("frentes", deputadoId, total);
  return total;
}

async function syncOrgaos(deputadoId: number) {
  // Limpa registros antigos para evitar duplicatas (não tem ID único)
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

  await logSync("orgaos", deputadoId, total);
  return total;
}

async function sync() {
  console.log("\n📥 [3/3] Sincronizando dados das APIs governamentais...\n");

  for (const c of CANDIDATOS) {
    console.log(`  📥 ${c.nome} (${c.id})...`);
    try {
      const desp = await syncDespesas(c.id);
      console.log(`     Despesas: ${desp}`);

      const prop = await syncProposicoes(c.id);
      console.log(`     Proposições: ${prop}`);

      const ev = await syncEventos(c.id);
      console.log(`     Eventos: ${ev}`);

      const fr = await syncFrentes(c.id);
      console.log(`     Frentes: ${fr}`);

      const org = await syncOrgaos(c.id);
      console.log(`     Órgãos: ${org}`);
    } catch (err: any) {
      console.error(`     ❌ Erro: ${err.message}`);
    }
    // Rate limiting
    await new Promise((r) => setTimeout(r, 1500));
  }
}

async function createMaterializedView() {
  console.log("\n📊 Criando materialized view...");
  try {
    await q(`DROP MATERIALIZED VIEW IF EXISTS mv_resumo_deputados`);
    await q(`
      CREATE MATERIALIZED VIEW mv_resumo_deputados AS
      SELECT
        d.id,
        d.nome_eleitoral,
        d.partido,
        d.situacao,
        d.votos_2022,
        d.cassado,
        COALESCE(desp.total_despesas, 0) AS total_despesas_ano,
        COALESCE(desp.qtd_despesas, 0) AS qtd_despesas_ano,
        COALESCE(prop.total_proposicoes, 0) AS total_proposicoes,
        COALESCE(ev.total_eventos, 0) AS total_eventos,
        COALESCE(fr.total_frentes, 0) AS total_frentes
      FROM deputados d
      LEFT JOIN LATERAL (
        SELECT SUM(valor_liquido) AS total_despesas, COUNT(*) AS qtd_despesas
        FROM despesas WHERE deputado_id = d.id AND ano = EXTRACT(YEAR FROM NOW())
      ) desp ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS total_proposicoes FROM proposicoes WHERE deputado_id = d.id
      ) prop ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS total_eventos FROM eventos WHERE deputado_id = d.id
      ) ev ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS total_frentes FROM deputado_frentes WHERE deputado_id = d.id
      ) fr ON TRUE
    `);
    await q(`CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_resumo_id ON mv_resumo_deputados(id)`);
    console.log("  ✅ Materialized view criada!");
  } catch (err: any) {
    console.error("  ⚠️ Materialized view:", err.message);
  }
}

// =============================================
// EXECUÇÃO
// =============================================
async function run() {
  console.log("═══════════════════════════════════════════");
  console.log("  🏛️  FISCALIZA RJ - Setup Completo");
  console.log("═══════════════════════════════════════════");
  console.log(`  DB: ${DATABASE_URL.replace(/:[^:@]+@/, ":***@")}`);

  const start = Date.now();

  try {
    // Testa conexão
    const r = await q("SELECT NOW() as now, current_database() as db");
    console.log(`  ✅ Conectado ao banco: ${r.rows[0].db} (${r.rows[0].now})`);

    await migrate();
    await seed();
    await sync();
    await createMaterializedView();

    // Resumo final
    const counts = await q(`
      SELECT
        (SELECT COUNT(*) FROM deputados) as deputados,
        (SELECT COUNT(*) FROM despesas) as despesas,
        (SELECT COUNT(*) FROM proposicoes) as proposicoes,
        (SELECT COUNT(*) FROM eventos) as eventos,
        (SELECT COUNT(*) FROM frentes) as frentes,
        (SELECT COUNT(*) FROM orgaos_participacao) as orgaos
    `);

    const c = counts.rows[0];
    console.log("\n═══════════════════════════════════════════");
    console.log("  📊 RESUMO FINAL");
    console.log("═══════════════════════════════════════════");
    console.log(`  Deputados:    ${c.deputados}`);
    console.log(`  Despesas:     ${c.despesas}`);
    console.log(`  Proposições:  ${c.proposicoes}`);
    console.log(`  Eventos:      ${c.eventos}`);
    console.log(`  Frentes:      ${c.frentes}`);
    console.log(`  Órgãos:       ${c.orgaos}`);
    console.log(`  Tempo total:  ${((Date.now() - start) / 1000).toFixed(1)}s`);
    console.log("═══════════════════════════════════════════");
    console.log("  ✅ Setup completo! Pronto para uso.");
    console.log("═══════════════════════════════════════════\n");
  } catch (err) {
    console.error("\n❌ Erro fatal:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
