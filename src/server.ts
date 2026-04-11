import app from "./index.js";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";
import { startFxJob } from "./jobs/fx.job.js";
import { startExpiryJob } from "./jobs/expiry.job.js";
import { startReconciliationJob } from "./jobs/reconciliation.job.js";

const PORT = env.PORT || 4000;

app.listen(PORT, () => {
  logger.info(`SatsPay API running on port ${PORT}`, { env: env.NODE_ENV });
  startFxJob();
  startExpiryJob();
  startReconciliationJob();
});
