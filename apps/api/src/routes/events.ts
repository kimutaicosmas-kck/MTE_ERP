import { Router } from "express";
import { authenticateToken, tokenFromRequest } from "../lib/session-auth.js";
import { addSseClient } from "../lib/realtime.js";

export const eventsRouter = Router();

eventsRouter.get("/stream", async (req, res) => {
  const token = tokenFromRequest(req);
  if (!token) return res.status(401).json({ error: "Sign in required" });
  try {
    const user = await authenticateToken(token);
    addSseClient(res, user.id);
  } catch {
    return res.status(401).json({ error: "Session expired" });
  }
});
