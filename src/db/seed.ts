/**
 * Seed: busca dados da API da Câmara e insere os deputados do MVP no banco.
 */
import { pool, query } from "./connection.js";
import { CANDIDATOS } from "../config/candidatos.js";
import * as camara from "../services/camaraApi.js";

async function seed() {
  console.log("🌱 Populando deputados do MVP...");

  for (const c of CANDIDATOS) {
    try {
      const perfil = await camara.getPerfil(c.id);
      const status = perfil.ultimoStatus;

      await query(
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
    } catch (err) {
      console.error(`  ❌ ${c.nome}:`, err);
    }
  }

  console.log("🌱 Seed concluído!");
  await pool.end();
}

seed();
