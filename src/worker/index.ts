import { startWorkers } from "../lib/queue/worker";

const workers = startWorkers();

if (workers.length === 0) {
  console.error("Worker not started: REDIS_URL is not configured.");
  process.exit(1);
}

console.info(`Workers started: ${workers.length}`);

async function shutdown(signal: string) {
  console.info(`Shutting down workers (${signal})...`);
  await Promise.all(workers.map((worker) => worker.close()));
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
