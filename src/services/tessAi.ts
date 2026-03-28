/**
 * Integração com Tess AI (Pareto)
 * Docs: https://tess-dfe1edf0.mintlify.app
 * API Base: https://api.tess.im
 *
 * Tess AI oferece endpoint compatível com OpenAI, então usamos o SDK oficial.
 * Isso permite trocar entre Tess AI e OpenAI facilmente.
 */
import OpenAI from "openai";
import { query } from "../db/connection.js";

// Tess AI usa endpoint compatível com OpenAI
const tess = new OpenAI({
  apiKey: process.env.TESS_API_KEY || "",
  baseURL: "https://api.tess.im",
});

// ID do agente criado na plataforma Tess AI
const AGENT_ID = process.env.TESS_AGENT_ID || "";

/**
 * System prompt do agente com contexto dos dados disponíveis.
 * O agente sabe quais queries fazer no banco para responder o usuário.
 */
const SYSTEM_PROMPT = `Você é o FiscalizaBot, um assistente especializado em dados de deputados federais do Rio de Janeiro.

Você tem acesso a dados oficiais de:
- Câmara dos Deputados (despesas, proposições, presença, comissões)
- Portal da Transparência (remuneração)
- TSE (patrimônio, filiações)

Deputados monitorados:
1. Talíria Petrone (PSOL) - ID 204464
2. Daniela do Waguinho (UNIÃO) - ID 204459
3. Glauber Braga (PSOL) - ID 152605 [CASSADO em dez/2024]
4. Doutor Luizinho (PP) - ID 204450

Responda de forma clara, objetiva e com dados concretos.
Sempre cite a fonte dos dados (Câmara, Transparência, TSE).
Use emojis para tornar a leitura mais agradável no WhatsApp.
Formate valores monetários em R$.`;

/**
 * Busca contexto relevante do banco para enriquecer a pergunta do usuário.
 */
async function getContexto(pergunta: string): Promise<string> {
  const lower = pergunta.toLowerCase();
  const partes: string[] = [];

  // Identifica qual deputado o usuário está perguntando
  const deputados = [
    { id: 204464, nomes: ["taliria", "talíria", "petrone"] },
    { id: 204459, nomes: ["daniela", "waguinho"] },
    { id: 152605, nomes: ["glauber", "braga"] },
    { id: 204450, nomes: ["luizinho", "doutor"] },
  ];

  const depMatch = deputados.find((d) => d.nomes.some((n) => lower.includes(n)));

  if (depMatch) {
    // Perfil
    const perfil = await query(
      `SELECT nome_eleitoral, partido, situacao, escolaridade, votos_2022, cassado
       FROM deputados WHERE id = $1`, [depMatch.id]
    );
    if (perfil.rows[0]) partes.push(`Perfil: ${JSON.stringify(perfil.rows[0])}`);

    // Despesas recentes
    if (lower.includes("despesa") || lower.includes("gast") || lower.includes("cota")) {
      const desp = await query(
        `SELECT tipo_despesa, SUM(valor_liquido) as total, COUNT(*) as qtd
         FROM despesas WHERE deputado_id = $1 AND ano = EXTRACT(YEAR FROM NOW())
         GROUP BY tipo_despesa ORDER BY total DESC LIMIT 5`, [depMatch.id]
      );
      partes.push(`Despesas ${new Date().getFullYear()}: ${JSON.stringify(desp.rows)}`);
    }

    // Proposições
    if (lower.includes("projeto") || lower.includes("proposi") || lower.includes("lei")) {
      const props = await query(
        `SELECT sigla_tipo, numero, ano, ementa FROM proposicoes
         WHERE deputado_id = $1 ORDER BY ano DESC, data_apresentacao DESC LIMIT 10`, [depMatch.id]
      );
      partes.push(`Proposições recentes: ${JSON.stringify(props.rows)}`);
    }

    // Presença
    if (lower.includes("presen") || lower.includes("falt") || lower.includes("sessão") || lower.includes("sessao")) {
      const ev = await query(
        `SELECT tipo, COUNT(*) as total FROM eventos
         WHERE deputado_id = $1 GROUP BY tipo`, [depMatch.id]
      );
      partes.push(`Eventos/Presença: ${JSON.stringify(ev.rows)}`);
    }
  }

  // Resumo geral se não especificou deputado
  if (!depMatch) {
    const resumo = await query(`SELECT * FROM mv_resumo_deputados`).catch(() => ({ rows: [] }));
    if (resumo.rows.length) partes.push(`Resumo geral: ${JSON.stringify(resumo.rows)}`);
  }

  return partes.join("\n\n");
}

/**
 * Envia mensagem para o agente Tess AI com contexto do banco.
 * Usa endpoint OpenAI-compatible: POST /agents/{id}/openai/chat/completions
 */
export async function chat(
  mensagemUsuario: string,
  telefone: string,
  sessionId?: string
): Promise<{ resposta: string; sessionId?: string }> {
  // 1. Busca contexto relevante do banco
  const contexto = await getContexto(mensagemUsuario);

  // 2. Salva mensagem do usuário
  await query(
    `INSERT INTO conversas (telefone, direcao, mensagem, tess_session_id) VALUES ($1,'in',$2,$3)`,
    [telefone, mensagemUsuario, sessionId]
  );

  // 3. Monta mensagens para a Tess AI
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

  if (contexto) {
    messages.push({
      role: "system",
      content: `Dados do banco de dados para responder a pergunta:\n\n${contexto}`,
    });
  }

  // Histórico recente da conversa
  const historico = await query(
    `SELECT direcao, mensagem FROM conversas
     WHERE telefone = $1 ORDER BY criado_em DESC LIMIT 6`,
    [telefone]
  );
  for (const h of historico.rows.reverse()) {
    messages.push({
      role: h.direcao === "in" ? "user" : "assistant",
      content: h.mensagem,
    });
  }

  messages.push({ role: "user", content: mensagemUsuario });

  // 4. Chama Tess AI (endpoint OpenAI-compatible)
  try {
    const completion = await tess.chat.completions.create({
      model: "tess-ai-3", // ou gpt-4o, claude-3-5-sonnet-latest
      messages,
      temperature: 0.3,
    } as any);

    const resposta = completion.choices[0]?.message?.content || "Desculpe, não consegui processar.";

    // 5. Salva resposta
    await query(
      `INSERT INTO conversas (telefone, direcao, mensagem, tess_session_id) VALUES ($1,'out',$2,$3)`,
      [telefone, resposta, sessionId]
    );

    return { resposta, sessionId };
  } catch (err: any) {
    console.error("[Tess AI] Erro:", err.message);
    return {
      resposta: "⚠️ Estou com dificuldades técnicas. Tente novamente em instantes.",
    };
  }
}

/**
 * Versão que funciona sem Tess AI (fallback com dados diretos do banco).
 * Útil para testes e quando a API da Tess está indisponível.
 */
export async function chatFallback(mensagem: string, telefone: string): Promise<string> {
  const contexto = await getContexto(mensagem);
  if (contexto) {
    return `📊 Dados encontrados:\n\n${contexto}\n\n_Fonte: APIs governamentais (Câmara, Transparência, TSE)_`;
  }
  return "Não encontrei dados específicos. Tente perguntar sobre um dos deputados: Talíria Petrone, Daniela do Waguinho, Glauber Braga ou Doutor Luizinho.";
}
