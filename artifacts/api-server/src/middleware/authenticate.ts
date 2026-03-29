import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthenticatedRequest extends Request {
  user?: { id: string; email: string };
}

export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.mi_session;
  if (!token) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    const secret = process.env.SESSION_SECRET;
    if (!secret) throw new Error("SESSION_SECRET not set");
    const payload = jwt.verify(token, secret) as { id: string; email: string };
    req.user = { id: payload.id, email: payload.email };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired session" });
  }
}

export function attachUserIfPresent(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  const token = req.cookies?.mi_session;
  if (token) {
    try {
      const secret = process.env.SESSION_SECRET;
      if (secret) {
        const payload = jwt.verify(token, secret) as { id: string; email: string };
        req.user = { id: payload.id, email: payload.email };
      }
    } catch {
    }
  }
  next();
}
