import { env, assertEnv } from "./config/env.js";
import { connectDB } from "./config/db.js";
import { createApp } from "./app.js";
import { logger } from "./common/logger.js";
import { ImportJob } from "./models/index.js";
import { startScheduler } from "./jobs/scheduler.js";
import { ensureSuperAdmin } from "./services/bootstrap.js";

async function main() {
  assertEnv();
  await connectDB();
  await ensureSuperAdmin();

  // Imports run inside this process; anything still "processing" after a restart can never finish.
  await ImportJob.updateMany(
    { status: { $in: ["queued", "processing"] } },
    { $set: { status: "failed", errorMessage: "The server restarted while this import was running. Please upload the file again.", finishedAt: new Date() } }
  ).setOptions({ skipTenantGuard: true });

  const app = createApp();
  app.listen(env.port, () => logger.info(`Beno Digital Card API listening on http://localhost:${env.port} (${env.nodeEnv})`));

  if (env.jobsEnabled) startScheduler();
}

main().catch((e) => {
  logger.error("Failed to start:", e.message);
  process.exit(1);
});
