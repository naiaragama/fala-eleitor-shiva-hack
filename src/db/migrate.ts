/**
 * Modelagem PostgreSQL otimizada para buscas do MVP Fiscaliza RJ
 *
 * Estratégias de otimização:
 * - Índices compostos para queries frequentes (deputado + ano/mês)
 * - Índice GIN em JSONB para buscas flexíveis em metadados
 * - Particionamento lógico por ano nas despesas (via índice)
 * - Materialized views para agregações pesadas
 * - Índice trigram para busca textual em proposições
 */

import { pool } from "./connection.js";

const MIGRATION = `
-- Extensões
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- busca textual fuzzy

-- ============================================
-- TABELA: deputados (perfil base)
-- ============================================
CREATE TABLE IF NOT EXISTS deputados (
  id              INTEGER PRIMARY KEY,  -- ID da API da Câmara
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
  espectro        TEXT,  -- 'Esquerda', 'Centro-direita', etc.
  situacao        TEXT,  -- 'Exercício', 'Cassado', etc.
  condicao_eleitoral TEXT,
  votos_2022      TEXT,
  foto_url        TEXT,
  email           TEXT,
  gabinete        JSONB,  -- {nome, predio, sala, telefone, email}
  redes_sociais   JSONB,  -- array de URLs
  cassado         BOOLEAN DEFAULT FALSE,
  meta            JSONB DEFAULT '{}',  -- dados extras flexíveis
  atualizado_em   TIMESTAMPTZ DEFAULT NOW(),
  criado_em       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deputados_partido ON deputados(partido);
CREATE INDEX IF NOT EXISTS idx_deputados_uf ON deputados(uf);
CREATE INDEX IF NOT EXISTS idx_deputados_nome_trgm ON deputados USING gin(nome_eleitoral gin_trgm_ops);

-- ============================================
-- TABELA: despesas (Cota Parlamentar - CEAP)
-- Volume alto: ~700 registros/deputado/ano
-- ============================================
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
);

CREATE INDEX IF NOT EXISTS idx_despesas_deputado_ano ON despesas(deputado_id, ano DESC, mes DESC);
CREATE INDEX IF NOT EXISTS idx_despesas_tipo ON despesas(tipo_despesa);
CREATE INDEX IF NOT EXISTS idx_despesas_fornecedor ON despesas(cnpj_cpf_fornecedor);

-- ============================================
-- TABELA: proposicoes (Projetos de Lei)
-- ============================================
CREATE TABLE IF NOT EXISTS proposicoes (
  id                  INTEGER PRIMARY KEY,  -- ID da API
  deputado_id         INTEGER NOT NULL REFERENCES deputados(id),
  sigla_tipo          TEXT NOT NULL,  -- PL, PEC, REQ, etc.
  numero              INTEGER,
  ano                 SMALLINT,
  ementa              TEXT,
  data_apresentacao   TIMESTAMPTZ,
  keywords            TEXT[],
  temas               TEXT[],
  uri                 TEXT
);

CREATE INDEX IF NOT EXISTS idx_proposicoes_deputado ON proposicoes(deputado_id, ano DESC);
CREATE INDEX IF NOT EXISTS idx_proposicoes_tipo ON proposicoes(sigla_tipo);
CREATE INDEX IF NOT EXISTS idx_proposicoes_ementa_trgm ON proposicoes USING gin(ementa gin_trgm_ops);

-- ============================================
-- TABELA: eventos (Presença em sessões)
-- ============================================
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
);

CREATE INDEX IF NOT EXISTS idx_eventos_deputado_data ON eventos(deputado_id, data_inicio DESC);
CREATE INDEX IF NOT EXISTS idx_eventos_tipo ON eventos(tipo);

-- ============================================
-- TABELA: frentes (Frentes Parlamentares)
-- ============================================
CREATE TABLE IF NOT EXISTS frentes (
  id              INTEGER PRIMARY KEY,
  titulo          TEXT NOT NULL,
  id_legislatura  SMALLINT
);

CREATE TABLE IF NOT EXISTS deputado_frentes (
  deputado_id     INTEGER REFERENCES deputados(id),
  frente_id       INTEGER REFERENCES frentes(id),
  PRIMARY KEY (deputado_id, frente_id)
);

-- ============================================
-- TABELA: orgaos (Comissões)
-- ============================================
CREATE TABLE IF NOT EXISTS orgaos_participacao (
  id              SERIAL PRIMARY KEY,
  deputado_id     INTEGER NOT NULL REFERENCES deputados(id),
  orgao_id        INTEGER,
  sigla           TEXT,
  nome            TEXT,
  titulo          TEXT,  -- cargo na comissão
  data_inicio     DATE,
  data_fim        DATE
);

CREATE INDEX IF NOT EXISTS idx_orgaos_deputado ON orgaos_participacao(deputado_id);

-- ============================================
-- TABELA: remuneracao (Portal da Transparência)
-- ============================================
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
);

CREATE INDEX IF NOT EXISTS idx_remuneracao_deputado_periodo ON remuneracao(deputado_id, ano DESC, mes DESC);

-- ============================================
-- TABELA: filiacao_partidaria (TSE)
-- ============================================
CREATE TABLE IF NOT EXISTS filiacoes (
  id              SERIAL PRIMARY KEY,
  deputado_id     INTEGER NOT NULL REFERENCES deputados(id),
  partido         TEXT NOT NULL,
  data_filiacao   DATE,
  data_desfiliacao DATE,
  situacao        TEXT
);

CREATE INDEX IF NOT EXISTS idx_filiacoes_deputado ON filiacoes(deputado_id);

-- ============================================
-- TABELA: patrimonio (Bens declarados - TSE)
-- ============================================
CREATE TABLE IF NOT EXISTS patrimonio (
  id              SERIAL PRIMARY KEY,
  deputado_id     INTEGER NOT NULL REFERENCES deputados(id),
  ano_eleicao     SMALLINT NOT NULL,
  descricao       TEXT,
  valor           NUMERIC(14,2),
  tipo_bem        TEXT
);

CREATE INDEX IF NOT EXISTS idx_patrimonio_deputado ON patrimonio(deputado_id, ano_eleicao DESC);

-- ============================================
-- TABELA: conversas_whatsapp (histórico do agente)
-- ============================================
CREATE TABLE IF NOT EXISTS conversas (
  id              SERIAL PRIMARY KEY,
  telefone        TEXT NOT NULL,
  direcao         TEXT NOT NULL CHECK(direcao IN ('in', 'out')),
  mensagem        TEXT NOT NULL,
  contexto        JSONB DEFAULT '{}',
  tess_session_id TEXT,
  criado_em       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversas_telefone ON conversas(telefone, criado_em DESC);

-- ============================================
-- TABELA: sync_log (controle de sincronização)
-- ============================================
CREATE TABLE IF NOT EXISTS sync_log (
  id              SERIAL PRIMARY KEY,
  entidade        TEXT NOT NULL,  -- 'despesas', 'proposicoes', etc.
  deputado_id     INTEGER,
  status          TEXT NOT NULL DEFAULT 'ok',
  registros       INTEGER DEFAULT 0,
  erro            TEXT,
  executado_em    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- VIEW MATERIALIZADA: resumo por deputado
-- Otimiza a query mais frequente do agente
-- ============================================
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_resumo_deputados AS
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
) fr ON TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_resumo_id ON mv_resumo_deputados(id);
`;

async function migrate() {
  console.log("🔄 Executando migração...");
  try {
    await pool.query(MIGRATION);
    console.log("✅ Migração concluída com sucesso!");
  } catch (err) {
    console.error("❌ Erro na migração:", err);
    throw err;
  } finally {
    await pool.end();
  }
}

migrate();
