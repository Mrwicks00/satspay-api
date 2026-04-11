import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    phone: string;
  };
}

export const authMiddleware = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid token" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as any;
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Unauthorized" });
  }
};

/**
 * Middleware restricted to internal administrative telemetry & operations
 */
export const adminMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const adminSecret = process.env.ADMIN_SECRET_KEY;
  if (!adminSecret) {
    return res.status(500).json({ error: "Server admin security layer not configured" });
  }

  const requestedSecret = req.headers["x-admin-secret"];
  if (!requestedSecret || requestedSecret !== adminSecret) {
    return res.status(403).json({ error: "Forbidden: Invalid admin credentials" });
  }

  next();
};
