/**
 * Webhook para WhatsApp + endpoint de teste do agente.
 */
import { Router } from "express";
import * as agente from "../services/agente.js";

const router = Router();

const VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN || "fiscaliza-rj-token";
const WA_API_TOKEN = process.env.WA_API_TOKEN || "";
const WA_API_URL = process.env.WA_API_URL || "";

// --- WhatsApp Business API (Meta) - Verificação ---
router.get("/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// --- Recebe mensagens do WhatsApp (Meta) ---
router.post("/whatsapp", async (req, res) => {
  res.sendStatus(200);
  try {
    const message = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message || message.type !== "text") return;

    const telefone = message.from;
    const texto = message.text.body;
    console.log(`[WA] ${telefone}: ${texto}`);

    const resposta = await agente.processar(texto, telefone);
    await enviarMensagem(telefone, resposta);
  } catch (err) {
    console.error("[WA] Erro:", err);
  }
});

// --- Evolution API webhook ---
router.post("/evolution", async (req, res) => {
  res.sendStatus(200);
  try {
    const { data } = req.body;
    if (!data?.message?.conversation) return;

    const telefone = data.key.remoteJid.replace("@s.whatsapp.net", "");
    const texto = data.message.conversation;
    console.log(`[Evolution] ${telefone}: ${texto}`);

    const resposta = await agente.processar(texto, telefone);
    await enviarMensagemEvolution(telefone, resposta);
  } catch (err) {
    console.error("[Evolution] Erro:", err);
  }
});

// --- Endpoint de teste (funciona sem WhatsApp) ---
router.post("/chat", async (req, res) => {
  const { mensagem, telefone = "teste-web" } = req.body;
  if (!mensagem) return res.status(400).json({ error: "Campo 'mensagem' obrigatório" });

  const resposta = await agente.processar(mensagem, telefone);
  res.json({ resposta });
});

// --- Envio de mensagens ---
async function enviarMensagem(telefone: string, texto: string) {
  if (!WA_API_TOKEN) {
    console.log(`[WA] → ${telefone}: ${texto.substring(0, 80)}...`);
    return;
  }
  const phoneNumberId = process.env.WA_PHONE_NUMBER_ID;
  await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${WA_API_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: telefone, type: "text", text: { body: texto } }),
  });
}

async function enviarMensagemEvolution(telefone: string, texto: string) {
  if (!WA_API_URL) {
    console.log(`[Evolution] → ${telefone}: ${texto.substring(0, 80)}...`);
    return;
  }
  const instance = process.env.EVOLUTION_INSTANCE || "fiscaliza";
  await fetch(`${WA_API_URL}/message/sendText/${instance}`, {
    method: "POST",
    headers: { apikey: WA_API_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ number: `${telefone}@s.whatsapp.net`, text: texto }),
  });
}

export default router;
