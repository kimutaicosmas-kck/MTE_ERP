import type { Response } from "express";

type SseClient = { res: Response; userId: string };

const clients = new Set<SseClient>();

export function addSseClient(res: Response, userId: string) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  res.write(`data: ${JSON.stringify({ event: "connected", at: new Date().toISOString() })}\n\n`);
  const client: SseClient = { res, userId };
  clients.add(client);
  const ping = setInterval(() => {
    try {
      res.write(`: ping\n\n`);
    } catch {
      clearInterval(ping);
    }
  }, 25_000);
  res.on("close", () => {
    clearInterval(ping);
    clients.delete(client);
  });
}

export function broadcastRealtime(event: string, data: unknown) {
  const payload = JSON.stringify({ event, data, at: new Date().toISOString() });
  for (const c of clients) {
    try {
      c.res.write(`data: ${payload}\n\n`);
    } catch {
      clients.delete(c);
    }
  }
}
