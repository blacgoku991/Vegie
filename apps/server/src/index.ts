import { config } from "./config.ts";
import { migrate } from "./db/migrate.ts";
import { pool } from "./db/pool.ts";
import { buildServer } from "./http/server.ts";
import { registerHandlers, startSchedulers } from "./jobs/handlers.ts";
import { startWorkers } from "./jobs/queue.ts";
import { log } from "./lib/log.ts";
import { stopImap } from "./mail/imap.ts";

await migrate();
registerHandlers();

const stops: Array<() => void> = [];

if (config.ROLE !== "worker") {
  const app = buildServer();
  await app.listen({ port: config.PORT, host: "0.0.0.0" });
  stops.push(() => void app.close());
  log.info("api.started", { port: config.PORT, ai: config.AI_PROVIDER, scanner: !!config.SCANNER_URL });
}

if (config.ROLE !== "api") {
  stops.push(startWorkers(4), startSchedulers(), stopImap);
  log.info("worker.started");
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.once(sig, async () => {
    stops.forEach((s) => s());
    await pool.end().catch(() => {});
    process.exit(0);
  });
}
