import { Router } from "express";
import { CANDIDATOS } from "../config/candidatos.js";
import * as camara from "../services/camaraApi.js";
import * as transparencia from "../services/transparenciaApi.js";
import * as tse from "../services/tseApi.js";

const router = Router();

// GET /api/deputados - Lista os candidatos do MVP
router.get("/", (_req, res) => {
  res.json(CANDIDATOS);
});

// GET /api/deputados/:id/perfil - Perfil completo do deputado
router.get("/:id/perfil", async (req, res) => {
  try {
    const perfil = await camara.getPerfil(Number(req.params.id));
    res.json(perfil);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/deputados/:id/despesas?ano=2024
router.get("/:id/despesas", async (req, res) => {
  try {
    const { ano, pagina } = req.query;
    const data = await camara.getDespesas(
      Number(req.params.id),
      ano ? Number(ano) : undefined,
      pagina ? Number(pagina) : 1
    );
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/deputados/:id/proposicoes
router.get("/:id/proposicoes", async (req, res) => {
  try {
    const { pagina } = req.query;
    const data = await camara.getProposicoes(
      Number(req.params.id),
      pagina ? Number(pagina) : 1
    );
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});


// GET /api/deputados/:id/eventos (presença em sessões)
router.get("/:id/eventos", async (req, res) => {
  try {
    const { pagina } = req.query;
    const data = await camara.getEventos(
      Number(req.params.id),
      pagina ? Number(pagina) : 1
    );
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/deputados/:id/frentes
router.get("/:id/frentes", async (req, res) => {
  try {
    const data = await camara.getFrentes(Number(req.params.id));
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/deputados/:id/orgaos (comissões)
router.get("/:id/orgaos", async (req, res) => {
  try {
    const data = await camara.getOrgaos(Number(req.params.id));
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/deputados/:id/ocupacoes
router.get("/:id/ocupacoes", async (req, res) => {
  try {
    const data = await camara.getOcupacoes(Number(req.params.id));
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/deputados/:id/remuneracao (Portal da Transparência - requer API key)
router.get("/:id/remuneracao", async (req, res) => {
  try {
    // Primeiro busca o CPF do perfil na Câmara
    const perfil = await camara.getPerfil(Number(req.params.id));
    if (!perfil.cpf) {
      return res.status(404).json({ error: "CPF não disponível" });
    }
    const data = await transparencia.getRemuneracao(perfil.cpf);
    if (data === null) {
      return res.status(503).json({
        error: "API do Portal da Transparência indisponível. Configure TRANSPARENCIA_API_KEY.",
        cadastro: "https://portaldatransparencia.gov.br/api-de-dados/cadastrar-email",
      });
    }
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/deputados/:id/completo - Todos os dados agregados
router.get("/:id/completo", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const candidato = CANDIDATOS.find((c) => c.id === id);

    const [perfil, despesas, proposicoes, eventos, frentes, orgaos] =
      await Promise.allSettled([
        camara.getPerfil(id),
        camara.getDespesas(id, new Date().getFullYear()),
        camara.getProposicoes(id),
        camara.getEventos(id),
        camara.getFrentes(id),
        camara.getOrgaos(id),
      ]);

    res.json({
      candidato,
      perfil: perfil.status === "fulfilled" ? perfil.value : null,
      despesas: despesas.status === "fulfilled" ? despesas.value : [],
      proposicoes: proposicoes.status === "fulfilled" ? proposicoes.value : [],
      eventos: eventos.status === "fulfilled" ? eventos.value : [],
      frentes: frentes.status === "fulfilled" ? frentes.value : [],
      orgaos: orgaos.status === "fulfilled" ? orgaos.value : [],
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/tse/datasets - Lista datasets do TSE
router.get("/tse/datasets", async (_req, res) => {
  try {
    const data = await tse.listarDatasets();
    res.json(data ?? []);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
