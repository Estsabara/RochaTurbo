import { enqueueInternalJob } from "../lib/queue/enqueue";
import { hasRedisConfigured } from "../lib/queue/client";

if (!hasRedisConfigured()) {
  console.error("Scheduler not started: REDIS_URL is not configured.");
  process.exit(1);
}

const lastRun = new Map<string, string>();

function minuteKey(now: Date): string {
  return now.toISOString().slice(0, 16);
}

async function runIfNeeded(job: "retention" | "dunning" | "subscription-renewal", shouldRun: boolean) {
  if (!shouldRun) return;

  const key = `${job}:${minuteKey(new Date())}`;
  if (lastRun.get(job) === key) return;

  const ok = await enqueueInternalJob(job, {}, "scheduler");
  if (ok) {
    lastRun.set(job, key);
    console.info(`[scheduler] queued ${job}`);
  }
}

async function tick() {
  const now = new Date();
  const minute = now.getUTCMinutes();
  const hour = now.getUTCHours();

  await runIfNeeded("dunning", minute === 0);
  await runIfNeeded("subscription-renewal", minute % 30 === 0);
  await runIfNeeded("retention", minute === 0 && hour === 3);
}

void tick();
setInterval(() => {
  void tick();
}, 60_000);
