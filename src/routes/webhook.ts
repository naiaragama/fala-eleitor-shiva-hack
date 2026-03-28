/**
 * Webhook para integração com WhatsApp.
 *
 * Suporta dois modos:
 * 1. WhatsApp Business API (Meta) - para produção
 * 2. Evolution API (open source) - para desenvolvimento/MVP
 *
 * O webhook recebe mensagens, processa com Tess AI e responde.
 */
import { Router } from "express";
import * as tessAi from "../services/tessAi.js";

const router = Router();

// Token de verificação do webhook (WhatsApp Business API)
const VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN || "fiscaliza-rj-token";
const WA_API_URL = process.env.WA_API_URL || ""; // URL da Evolution API ou Meta
const WA_API_TOKEN = process.env.WA_API_TOKEN || "";

// --- WhatsApp Business API (Meta) - Verificação ---
router.get("/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("[WhatsApp] Webhook verificado.");
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// --- Recebe mensagens do WhatsApp ---
router.post("/whatsapp", async (req, res) => {
  // Responde 200 imediatamente (WhatsApp exige resposta rápida)
  res.sendStatus(200);

  try {
    const body = req.body;

    // Formato Meta Business API
    const entry = body?.entry?.[0];
    const change = entry?.changes?.[0]?.value;
    const message = change?.messages?.[0];

    if (!message || message.type !== "text") return;

    const telefone = message.from; // número do remetente
    const texto = message.text.body;

    console.log(`[WhatsApp] ${telefone}: ${texto}`);

    // Processa com Tess AI
    const { resposta } = await tessAi.chat(texto, telefone);

    // Envia resposta via WhatsApp
    await enviarMensagem(telefone, resposta);
  } catch (err) {
    console.error("[WhatsApp] Erro ao processar:", err);
  }
});

// --- Evolution API webhook (formato diferente) ---
router.post("/evolution", async (req, res) => {
  res.sendStatus(200);

  try {
    const { data } = req.body;
    if (!data?.message?.conversation) return;

    const telefone = data.key.remoteJid.replace("@s.whatsapp.net", "");
    const texto = data.message.conversation;

    console.log(`[Evolution] ${telefone}: ${texto}`);

    const { resposta } = await tessAi.chat(texto, telefone);
    await enviarMensagemEvolution(telefone, resposta);
  } catch (err) {
    console.error("[Evolution] Erro:", err);
  }
});

// --- Envio de mensagens ---

async function enviarMensagem(telefone: string, texto: string) {
  if (!WA_API_URL || !WA_API_TOKEN) {
    console.log(`[WhatsApp] Simulando envio para ${telefone}: ${texto.substring(0, 80)}...`);
    return;
  }

  // Meta WhatsApp Business API
  const phoneNumberId = process.env.WA_PHONE_NUMBER_ID;
  await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WA_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: telefone,
      type: "text",
      text: { body: texto },
    }),
  });
}

async function enviarMensagemEvolution(telefone: string, texto: string) {
  if (!WA_API_URL || !WA_API_TOKEN) {
    console.log(`[Evolution] Simulando envio para ${telefone}: ${texto.substring(0, 80)}...`);
    return;
  }

  const instance = process.env.EVOLUTION_INSTANCE || "fiscaliza";
  await fetch(`${WA_API_URL}/message/sendText/${instance}`, {
    method: "POST",
    headers: {
      apikey: WA_API_TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      number: `${telefone}@s.whatsapp.net`,
      text: texto,
    }),
  });
}

// --- Endpoint de teste (simula conversa sem WhatsApp) ---
router.post("/chat-test", async (req, res) => {
  const { mensagem, telefone = "5521999999999" } = req.body;
  if (!mensagem) return res.status(400).json({ error: "Campo 'mensagem' obrigatório" });

  try {
    const { resposta } = await tessAi.chat(mensagem, telefone);
    res.json({ resposta });
  } catch {
    // Fallback sem Tess AI
    const resposta = await tessAi.chatFallback(mensagem, telefone);
    res.json({ resposta, fallback: true });
  }
});

export default router;
