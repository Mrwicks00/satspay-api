import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger.js";

export interface AppError extends Error {
  status?: number;
  code?: string;
}

/**
 * Global Express error handler — must be registered LAST in the middleware chain.
 * Catches all errors passed via next(err) and returns consistent JSON responses.
 */
export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  const status = err.status || 500;
  const code = err.code || "INTERNAL_ERROR";
  const message = status === 500 ? "An unexpected error occurred" : err.message;

  // Always log the full error for observability
  logger.error("Unhandled error", {
    method: req.method,
    path: req.path,
    status,
    code,
    message: err.message,
    stack: err.stack,
  });

  res.status(status).json({
    error: message,
    code,
    ...(process.env.NODE_ENV !== "production" && { detail: err.message }),
  });
}

/**
 * 404 handler — catches any route that wasn't matched.
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: `Route ${req.method} ${req.path} not found`,
    code: "NOT_FOUND",
  });
}
