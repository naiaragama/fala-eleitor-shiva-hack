/**
 * Agente "Fala Eleitor" — Chatbot inteligente sobre deputados federais do RJ.
 *
 * Fluxo:
 * 1. Detecta intenção do usuário (qual dado quer, sobre qual deputado)
 * 2. Busca dados no PostgreSQL
 * 3. Formata resposta amigável (WhatsApp-friendly)
 * 4. Se Tess AI estiver configurada, usa IA para resposta mais natural
 * 5. Se não, usa o motor local de respostas
 */
import OpenAI from "openai";
import { query } from "../db/connection.js";

// =============================================
// CONFIG
// =============================================
const TESS_KEY = process.env.TESS_API_KEY || "";
const TESS_AGENT_ID = process.env.TESS_AGENT_ID || "";

const tess = TESS_KEY
  ? new OpenAI({ apiKey: TESS_KEY, baseURL: "https://api.tess.im" })
  : null;

const DEPUTADOS = [
  { id: 204464, nomes: ["taliria", "talíria", "petrone", "taliría"], label: "Talíria Petrone" },
  { id: 204459, nomes: ["daniela", "waguinho"], label: "Daniela do Waguinho" },
  { id: 152605, nomes: ["glauber", "braga"], label: "Glauber Braga" },
  { id: 204450, nomes: ["luizinho", "doutor", "dr. luizinho", "dr luizinho"], label: "Doutor Luizinho" },
];

type Intencao =
  | "saudacao"
  | "ajuda"
  | "listar"
  | "perfil"
  | "despesas"
  | "proposicoes"
  | "presenca"
  | "frentes"
  | "comissoes"
  | "resumo"
  | "comparar"
  | "desconhecido";

// =============================================
// DETECÇÃO DE INTENÇÃO
// =============================================
function detectarIntencao(msg: string): Intencao {
  const m = msg.toLowerCase().trim();
  if (/^(oi|olá|ola|hey|eai|e ai|bom dia|boa tarde|boa noite|hello|hi)/.test(m)) return "saudacao";
  if (/ajuda|help|como funciona|o que voc[eê]|menu|comandos/.test(m)) return "ajuda";
  if (/lista|todos|quais|deputados monitorados/.test(m)) return "listar";
  if (/compar/.test(m)) return "comparar";
  if (/despesa|gast|cota|dinheiro|verba|quanto.*gast/.test(m)) return "despesas";
  if (/projeto|proposi|lei|pl |pec |req |autori/.test(m)) return "proposicoes";
  if (/presen|falt|sess[aã]o|plen[aá]rio|frequen/.test(m)) return "presenca";
  if (/frente|bancada|grupo/.test(m)) return "frentes";
  if (/comiss[aã]o|[oó]rg[aã]o|participa/.test(m)) return "comissoes";
  if (/resum|geral|vis[aã]o|overview|dashboard/.test(m)) return "resumo";
  if (/quem [eé]|perfil|dados|info|sobre/.test(m)) return "perfil";
  return "desconhecido";
}

function detectarDeputado(msg: string) {
  const m = msg.toLowerCase();
  return DEPUTADOS.find((d) => d.nomes.some((n) => m.includes(n)));
}

// =============================================
// QUERIES DO BANCO
// =============================================
async function buscarPerfil(id: number) {
  const r = await query(
    `SELECT nome_eleitoral, nome_civil, partido, uf, espectro, situacao,
            escolaridade, votos_2022, cassado, data_nascimento,
            municipio_nascimento, uf_nascimento, gabinete, email
     FROM deputados WHERE id = $1`, [id]
  );
  return r.rows[0] || null;
}

async function buscarDespesas(id: number) {
  const ano = new Date().getFullYear();
  const total = await query(
    `SELECT SUM(valor_liquido) as total, COUNT(*) as qtd
     FROM despesas WHERE deputado_id = $1 AND ano = $2`, [id, ano]
  );
  const porTipo = await query(
    `SELECT tipo_despesa, SUM(valor_liquido) as total, COUNT(*) as qtd
     FROM despesas WHERE deputado_id = $1 AND ano = $2
     GROUP BY tipo_despesa ORDER BY total DESC LIMIT 5`, [id, ano]
  );
  const maiores = await query(
    `SELECT tipo_despesa, valor_liquido, fornecedor, mes
     FROM despesas WHERE deputado_id = $1 AND ano = $2
     ORDER BY valor_liquido DESC LIMIT 5`, [id, ano]
  );
  return {
    ano,
    total: total.rows[0]?.total || 0,
    qtd: total.rows[0]?.qtd || 0,
    porTipo: porTipo.rows,
    maiores: maiores.rows,
  };
}

async function buscarProposicoes(id: number) {
  const r = await query(
    `SELECT sigla_tipo, numero, ano, ementa FROM proposicoes
     WHERE deputado_id = $1 AND sigla_tipo IN ('PL','PEC','PLP','PDL','MPV')
     ORDER BY ano DESC, data_apresentacao DESC LIMIT 10`, [id]
  );
  const total = await query(
    `SELECT COUNT(*) as total FROM proposicoes WHERE deputado_id = $1`, [id]
  );
  return { proposicoes: r.rows, total: total.rows[0]?.total || 0 };
}

async function buscarPresenca(id: number) {
  const r = await query(
    `SELECT tipo, COUNT(*) as total FROM eventos
     WHERE deputado_id = $1 GROUP BY tipo ORDER BY total DESC`, [id]
  );
  const recentes = await query(
    `SELECT tipo, descricao, data_inicio FROM eventos
     WHERE deputado_id = $1 ORDER BY data_inicio DESC LIMIT 5`, [id]
  );
  return { porTipo: r.rows, recentes: recentes.rows };
}

async function buscarFrentes(id: number) {
  const r = await query(
    `SELECT f.titulo FROM deputado_frentes df
     JOIN frentes f ON f.id = df.frente_id
     WHERE df.deputado_id = $1 ORDER BY f.titulo LIMIT 15`, [id]
  );
  const total = await query(
    `SELECT COUNT(*) as total FROM deputado_frentes WHERE deputado_id = $1`, [id]
  );
  return { frentes: r.rows, total: total.rows[0]?.total || 0 };
}

async function buscarComissoes(id: number) {
  const r = await query(
    `SELECT sigla, nome, titulo, data_inicio, data_fim
     FROM orgaos_participacao WHERE deputado_id = $1
     ORDER BY data_inicio DESC LIMIT 10`, [id]
  );
  return r.rows;
}

async function buscarResumo() {
  try {
    const r = await query(`SELECT * FROM mv_resumo_deputados ORDER BY total_despesas_ano DESC`);
    return r.rows;
  } catch {
    const r = await query(
      `SELECT d.id, d.nome_eleitoral, d.partido, d.situacao, d.votos_2022, d.cassado,
              COALESCE(SUM(desp.valor_liquido), 0) as total_despesas_ano,
              COUNT(DISTINCT desp.id) as qtd_despesas_ano
       FROM deputados d
       LEFT JOIN despesas desp ON desp.deputado_id = d.id AND desp.ano = EXTRACT(YEAR FROM NOW())
       GROUP BY d.id ORDER BY total_despesas_ano DESC`
    );
    return r.rows;
  }
}

// =============================================
// FORMATAÇÃO DE RESPOSTAS (WhatsApp-friendly)
// =============================================
function fmt$(v: any): string {
  return `R$ ${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

function respostaSaudacao(): string {
  return `👋 Olá! Eu sou o *Fala Eleitor*, seu assistente de fiscalização política.

Monitoro deputados federais do RJ com dados oficiais da Câmara, Portal da Transparência e TSE.

📋 *Deputados monitorados:*
1️⃣ Talíria Petrone (PSOL)
2️⃣ Daniela do Waguinho (UNIÃO)
3️⃣ Glauber Braga (PSOL) ⚠️ Cassado
4️⃣ Doutor Luizinho (PP)

💡 Pergunte algo como:
• _"Quanto a Talíria gastou?"_
• _"Projetos do Doutor Luizinho"_
• _"Presença da Daniela"_
• _"Resumo geral"_`;
}

function respostaAjuda(): string {
  return `📖 *Como usar o Fala Eleitor:*

Você pode perguntar sobre qualquer deputado monitorado:

💰 *Despesas:* _"gastos da Talíria"_, _"cota do Luizinho"_
📝 *Projetos:* _"proposições do Glauber"_, _"leis da Daniela"_
🏛️ *Presença:* _"sessões da Talíria"_, _"presença do Luizinho"_
👥 *Frentes:* _"frentes da Daniela"_
🏢 *Comissões:* _"comissões do Glauber"_
👤 *Perfil:* _"quem é Talíria Petrone"_
📊 *Resumo:* _"resumo geral"_, _"comparar deputados"_

📡 _Dados: Câmara dos Deputados, Portal da Transparência, TSE_`;
}

async function respostaListar(): Promise<string> {
  const resumo = await buscarResumo();
  let txt = `🏛️ *Deputados Federais do RJ monitorados:*\n`;
  for (const d of resumo) {
    const status = d.cassado ? "⚠️ Cassado" : "✅ Ativo";
    txt += `\n*${d.nome_eleitoral}* (${d.partido}) ${status}`;
    txt += `\n   🗳️ Votos 2022: ${d.votos_2022}`;
    txt += `\n   💰 Despesas ${new Date().getFullYear()}: ${fmt$(d.total_despesas_ano)}`;
    txt += `\n   📝 Proposições: ${d.total_proposicoes}`;
  }
  return txt;
}

async function respostaPerfil(id: number): Promise<string> {
  const p = await buscarPerfil(id);
  if (!p) return "❌ Deputado não encontrado.";

  const idade = p.data_nascimento
    ? Math.floor((Date.now() - new Date(p.data_nascimento).getTime()) / 31557600000)
    : "?";

  return `👤 *${p.nome_eleitoral}*
📛 Nome civil: ${p.nome_civil}
🏛️ Partido: *${p.partido}* (${p.espectro})
📍 UF: ${p.uf}
${p.cassado ? "⚠️ *MANDATO CASSADO*" : `✅ Situação: ${p.situacao}`}
🎓 Escolaridade: ${p.escolaridade || "Não informada"}
🎂 Idade: ${idade} anos (${p.municipio_nascimento}/${p.uf_nascimento})
🗳️ Votos 2022: *${p.votos_2022}*
📧 ${p.email || "Email não disponível"}

📡 _Fonte: API Câmara dos Deputados_`;
}

async function respostaDespesas(id: number, label: string): Promise<string> {
  const d = await buscarDespesas(id);
  if (!d.qtd) return `💰 *${label}* não tem despesas registradas em ${d.ano}.`;

  let txt = `💰 *Despesas de ${label} em ${d.ano}:*\n`;
  txt += `\n💵 Total: *${fmt$(d.total)}* (${d.qtd} registros)\n`;
  txt += `\n📊 *Por categoria:*`;
  for (const t of d.porTipo) {
    txt += `\n• ${t.tipo_despesa}: ${fmt$(t.total)} (${t.qtd}x)`;
  }
  txt += `\n\n🔝 *Maiores despesas:*`;
  for (const m of d.maiores) {
    txt += `\n• ${fmt$(m.valor_liquido)} — ${m.fornecedor} (mês ${m.mes})`;
  }
  txt += `\n\n📡 _Fonte: Cota Parlamentar (CEAP) — Câmara dos Deputados_`;
  return txt;
}

async function respostaProposicoes(id: number, label: string): Promise<string> {
  const d = await buscarProposicoes(id);
  if (!d.total) return `📝 *${label}* não tem proposições registradas.`;

  let txt = `📝 *Proposições de ${label}:*\n`;
  txt += `📊 Total: *${d.total}* proposições\n`;
  txt += `\n🔝 *Mais recentes (PL/PEC/PLP):*`;
  for (const p of d.proposicoes) {
    const ementa = p.ementa ? p.ementa.substring(0, 100) : "Sem ementa";
    txt += `\n• *${p.sigla_tipo} ${p.numero}/${p.ano}* — ${ementa}`;
  }
  txt += `\n\n📡 _Fonte: API Câmara dos Deputados_`;
  return txt;
}

async function respostaPresenca(id: number, label: string): Promise<string> {
  const d = await buscarPresenca(id);
  if (!d.porTipo.length) return `🏛️ *${label}* não tem eventos de presença registrados.`;

  let txt = `🏛️ *Presença de ${label}:*\n`;
  txt += `\n📊 *Por tipo de sessão:*`;
  for (const t of d.porTipo) {
    txt += `\n• ${t.tipo}: *${t.total}* sessões`;
  }
  if (d.recentes.length) {
    txt += `\n\n🕐 *Sessões recentes:*`;
    for (const r of d.recentes) {
      const data = r.data_inicio ? new Date(r.data_inicio).toLocaleDateString("pt-BR") : "?";
      txt += `\n• ${data} — ${r.tipo}`;
    }
  }
  txt += `\n\n📡 _Fonte: API Câmara dos Deputados_`;
  return txt;
}

async function respostaFrentes(id: number, label: string): Promise<string> {
  const d = await buscarFrentes(id);
  if (!d.total) return `👥 *${label}* não tem frentes parlamentares registradas.`;

  let txt = `👥 *Frentes Parlamentares de ${label}:*\n`;
  txt += `📊 Total: *${d.total}* frentes\n`;
  for (const f of d.frentes) {
    txt += `\n• ${f.titulo}`;
  }
  txt += `\n\n📡 _Fonte: API Câmara dos Deputados_`;
  return txt;
}

async function respostaComissoes(id: number, label: string): Promise<string> {
  const comissoes = await buscarComissoes(id);
  if (!comissoes.length) return `🏢 *${label}* não tem participação em comissões registrada.`;

  let txt = `🏢 *Comissões de ${label}:*\n`;
  for (const c of comissoes) {
    const cargo = c.titulo ? ` (${c.titulo})` : "";
    txt += `\n• *${c.sigla}* — ${c.nome}${cargo}`;
  }
  txt += `\n\n📡 _Fonte: API Câmara dos Deputados_`;
  return txt;
}

async function respostaResumo(): Promise<string> {
  const resumo = await buscarResumo();
  const ano = new Date().getFullYear();

  let txt = `📊 *Resumo Geral — Deputados RJ (${ano}):*\n`;
  for (const d of resumo) {
    const status = d.cassado ? "⚠️" : "✅";
    txt += `\n${status} *${d.nome_eleitoral}* (${d.partido})`;
    txt += `\n   💰 Despesas: ${fmt$(d.total_despesas_ano)} (${d.qtd_despesas_ano}x)`;
    txt += `\n   📝 Proposições: ${d.total_proposicoes}`;
    txt += `\n   🏛️ Eventos: ${d.total_eventos}`;
    txt += `\n   👥 Frentes: ${d.total_frentes}`;
  }
  txt += `\n\n📡 _Fonte: Câmara dos Deputados, Portal da Transparência, TSE_`;
  return txt;
}

// =============================================
// MOTOR LOCAL (funciona sem Tess AI)
// =============================================
async function respostaLocal(msg: string): Promise<string> {
  const intencao = detectarIntencao(msg);
  const dep = detectarDeputado(msg);

  switch (intencao) {
    case "saudacao":
      return respostaSaudacao();
    case "ajuda":
      return respostaAjuda();
    case "listar":
      return respostaListar();
    case "resumo":
    case "comparar":
      return respostaResumo();
    case "perfil":
      if (!dep) return "👤 Sobre qual deputado? Diga o nome: Talíria, Daniela, Glauber ou Luizinho.";
      return respostaPerfil(dep.id);
    case "despesas":
      if (!dep) return "💰 De qual deputado? Diga o nome: Talíria, Daniela, Glauber ou Luizinho.";
      return respostaDespesas(dep.id, dep.label);
    case "proposicoes":
      if (!dep) return "📝 De qual deputado? Diga o nome: Talíria, Daniela, Glauber ou Luizinho.";
      return respostaProposicoes(dep.id, dep.label);
    case "presenca":
      if (!dep) return "🏛️ De qual deputado? Diga o nome: Talíria, Daniela, Glauber ou Luizinho.";
      return respostaPresenca(dep.id, dep.label);
    case "frentes":
      if (!dep) return "👥 De qual deputado? Diga o nome: Talíria, Daniela, Glauber ou Luizinho.";
      return respostaFrentes(dep.id, dep.label);
    case "comissoes":
      if (!dep) return "🏢 De qual deputado? Diga o nome: Talíria, Daniela, Glauber ou Luizinho.";
      return respostaComissoes(dep.id, dep.label);
    default:
      // Se mencionou um deputado, mostra o perfil
      if (dep) return respostaPerfil(dep.id);
      return `🤔 Não entendi. Tente perguntar sobre um deputado específico ou digite *ajuda*.

📋 Deputados: Talíria, Daniela, Glauber, Luizinho
💡 Exemplos: _"gastos da Talíria"_, _"projetos do Luizinho"_, _"resumo geral"_`;
  }
}

// =============================================
// MOTOR TESS AI (respostas mais naturais)
// =============================================
const SYSTEM_PROMPT = `Você é o *Fala Eleitor*, assistente de fiscalização de deputados federais do RJ.

REGRAS:
- Responda SEMPRE em português brasileiro
- Use emojis para facilitar leitura no WhatsApp
- Formate valores em R$ brasileiro
- Cite a fonte dos dados (Câmara, Transparência, TSE)
- Seja objetivo e direto, sem enrolação
- Use *negrito* para destaques (formato WhatsApp)
- Se não souber, diga que não tem o dado e sugira outra consulta

Deputados monitorados:
1. Talíria Petrone (PSOL) - ID 204464
2. Daniela do Waguinho (UNIÃO) - ID 204459
3. Glauber Braga (PSOL) - ID 152605 [CASSADO dez/2024]
4. Doutor Luizinho (PP) - ID 204450`;

async function respostaTessAI(msg: string, telefone: string): Promise<string> {
  if (!tess) throw new Error("Tess AI não configurada");

  // Busca contexto do banco
  const dep = detectarDeputado(msg);
  const intencao = detectarIntencao(msg);
  const partes: string[] = [];

  if (dep) {
    const perfil = await buscarPerfil(dep.id);
    if (perfil) partes.push(`PERFIL: ${JSON.stringify(perfil)}`);

    if (["despesas", "resumo", "comparar"].includes(intencao)) {
      const desp = await buscarDespesas(dep.id);
      partes.push(`DESPESAS: ${JSON.stringify(desp)}`);
    }
    if (["proposicoes"].includes(intencao)) {
      const prop = await buscarProposicoes(dep.id);
      partes.push(`PROPOSIÇÕES: ${JSON.stringify(prop)}`);
    }
    if (["presenca"].includes(intencao)) {
      const pres = await buscarPresenca(dep.id);
      partes.push(`PRESENÇA: ${JSON.stringify(pres)}`);
    }
    if (["frentes"].includes(intencao)) {
      const fr = await buscarFrentes(dep.id);
      partes.push(`FRENTES: ${JSON.stringify(fr)}`);
    }
    if (["comissoes"].includes(intencao)) {
      const com = await buscarComissoes(dep.id);
      partes.push(`COMISSÕES: ${JSON.stringify(com)}`);
    }
  } else if (["resumo", "comparar", "listar"].includes(intencao)) {
    const resumo = await buscarResumo();
    partes.push(`RESUMO GERAL: ${JSON.stringify(resumo)}`);
  }

  // Histórico
  const historico = await query(
    `SELECT direcao, mensagem FROM conversas
     WHERE telefone = $1 ORDER BY criado_em DESC LIMIT 6`, [telefone]
  );

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

  if (partes.length) {
    messages.push({
      role: "system",
      content: `DADOS DO BANCO (use para responder):\n\n${partes.join("\n\n")}`,
    });
  }

  for (const h of historico.rows.reverse()) {
    messages.push({
      role: h.direcao === "in" ? "user" : "assistant",
      content: h.mensagem,
    });
  }

  messages.push({ role: "user", content: msg });

  const completion = await tess.chat.completions.create({
    model: "tess-ai-3",
    messages,
    temperature: 0.3,
  } as any);

  return completion.choices[0]?.message?.content || "Desculpe, não consegui processar.";
}

// =============================================
// FUNÇÃO PRINCIPAL DO AGENTE
// =============================================
export async function processar(
  mensagem: string,
  telefone: string
): Promise<string> {
  // Salva mensagem recebida
  await query(
    `INSERT INTO conversas (telefone, direcao, mensagem) VALUES ($1,'in',$2)`,
    [telefone, mensagem]
  ).catch(() => {});

  let resposta: string;

  try {
    if (tess && TESS_KEY) {
      // Usa Tess AI para respostas mais naturais
      resposta = await respostaTessAI(mensagem, telefone);
    } else {
      // Motor local — funciona sem IA externa
      resposta = await respostaLocal(mensagem);
    }
  } catch (err: any) {
    console.error("[Agente] Erro Tess AI, usando fallback:", err.message);
    resposta = await respostaLocal(mensagem);
  }

  // Salva resposta
  await query(
    `INSERT INTO conversas (telefone, direcao, mensagem) VALUES ($1,'out',$2)`,
    [telefone, resposta]
  ).catch(() => {});

  return resposta;
}
