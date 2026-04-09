import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import authRoutes from "./routes/auth.routes.js";
import transferRoutes from "./routes/transfer.routes.js";
import webhookRoutes from "./routes/webhook.routes.js";
import offrampRoutes from "./routes/offramp.routes.js";
import businessRoutes from "./routes/business.routes.js";
import claimRoutes from "./routes/claim.routes.js";
import fxRoutes from "./routes/fx.routes.js";
import { startFxJob } from "./jobs/fx.job.js";
import { startExpiryJob } from "./jobs/expiry.job.js";
import { logger } from "./utils/logger.js";
import { apiRateLimiter } from "./middleware/rateLimit.middleware.js";
import { errorHandler, notFoundHandler } from "./middleware/error.middleware.js";

const app = express();

// Security & logging middleware
app.use(helmet());
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

// Global API rate limiter (60 req/min per IP)
app.use("/api", apiRateLimiter);

// Health check (no rate limiting, no auth)
app.get("/health", async (_req, res) => {
  res.json({
    status: "ok",
    env: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/transfers", transferRoutes);
app.use("/api/v1/claims", claimRoutes);
app.use("/api/v1/webhooks", webhookRoutes);
app.use("/api/v1/offramp", offrampRoutes);
app.use("/api/v1/business", businessRoutes);
app.use("/api/v1/fx", fxRoutes);

// 404 catch-all (must be after all routes)
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

const PORT = env.PORT || 4000;

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    logger.info(`SatsPay API running on port ${PORT}`, { env: env.NODE_ENV });
    startFxJob();
    startExpiryJob();
  });
}

export default app;
