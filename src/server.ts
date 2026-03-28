import express from "express";
import cors from "cors";
import cron from "node-cron";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import deputadosRouter from "./routes/deputados.js";
import webhookRouter from "./routes/webhook.js";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.use(cors());
app.use(express.json());

// Serve frontend estático
app.use(express.static(join(__dirname, "..", "public")));

// API routes
app.use("/api/deputados", deputadosRouter);
app.use("/api/webhook", webhookRouter);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    apis: {
      camara: "https://dadosabertos.camara.leg.br/api/v2",
      transparencia: "https://portaldatransparencia.gov.br/api-de-dados",
      tse: "https://dadosabertos.tse.jus.br",
      tessAi: "https://api.tess.im",
    },
    db: !!process.env.DATABASE_URL,
    whatsapp: !!process.env.WA_API_URL,
  });
});

// Cron: sincroniza dados diariamente às 3h da manhã
cron.schedule("0 3 * * *", async () => {
  console.log("⏰ Cron: iniciando sincronização diária...");
  try {
    const { execSync } = await import("child_process");
    execSync("npx tsx src/jobs/syncDados.ts", { stdio: "inherit" });
  } catch (err) {
    console.error("⏰ Cron: erro na sincronização:", err);
  }
});

app.listen(PORT, () => {
  console.log(`🏛️  Servidor rodando em http://localhost:${PORT}`);
  console.log(`📊 API: http://localhost:${PORT}/api/deputados`);
  console.log(`💬 Webhook WhatsApp: http://localhost:${PORT}/api/webhook/whatsapp`);
  console.log(`🧪 Chat teste: POST http://localhost:${PORT}/api/webhook/chat-test`);
});
