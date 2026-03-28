/**
 * Proxy de fotos dos deputados.
 * Baixa a foto da Câmara e serve localmente, evitando problemas de CORS.
 * Cache em memória para não ficar batendo na API toda hora.
 */
import { Router } from "express";

const router = Router();
const cache = new Map<number, { buffer: Buffer; contentType: string }>();

router.get("/:id.jpg", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.sendStatus(400);

  // Serve do cache se tiver
  const cached = cache.get(id);
  if (cached) {
    res.set("Content-Type", cached.contentType);
    res.set("Cache-Control", "public, max-age=86400");
    return res.send(cached.buffer);
  }

  try {
    const url = `https://www.camara.leg.br/internet/deputado/bandep/${id}.jpg`;
    const response = await fetch(url);

    if (!response.ok) {
      return res.sendStatus(404);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = response.headers.get("content-type") || "image/jpeg";

    // Cacheia
    cache.set(id, { buffer, contentType });

    res.set("Content-Type", contentType);
    res.set("Cache-Control", "public, max-age=86400");
    res.send(buffer);
  } catch {
    res.sendStatus(502);
  }
});

export default router;
