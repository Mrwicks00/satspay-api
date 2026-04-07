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

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

// Routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/transfers", transferRoutes);
app.use("/api/v1/webhooks", webhookRoutes);
app.use("/api/v1/offramp", offrampRoutes);
app.use("/api/v1/business", businessRoutes);

// Routes Placeholder
app.get("/health", (req, res) => {
  res.json({ status: "ok", env: env.NODE_ENV });
});

const PORT = env.PORT || 4000;

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`SatsPay API running on port ${PORT} [${env.NODE_ENV}]`);
  });
}

export default app;
