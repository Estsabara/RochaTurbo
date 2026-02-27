import { JobsOptions, Queue } from "bullmq";
import { getServerEnv } from "@/lib/env";
import { getRedisConnection } from "@/lib/queue/client";
import {
  InternalJobName,
  InternalJobQueuePayload,
  QUEUE_NAMES,
  QueueName,
  WhatsAppInboundQueuePayload,
  WhatsAppStatusQueuePayload,
} from "@/lib/queue/definitions";

const queueCache = new Map<QueueName, Queue>();

function getQueue(name: QueueName): Queue | null {
  const existing = queueCache.get(name);
  if (existing) return existing;

  const connection = getRedisConnection();
  if (!connection) return null;

  const env = getServerEnv();
  const queue = new Queue(name, {
    connection: connection as never,
    prefix: env.QUEUE_PREFIX,
    defaultJobOptions: {
      removeOnComplete: 200,
      removeOnFail: 500,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
    },
  });

  queueCache.set(name, queue);
  return queue;
}

async function enqueue<T>(queueName: QueueName, jobName: string, payload: T, options?: JobsOptions): Promise<boolean> {
  const queue = getQueue(queueName);
  if (!queue) return false;

  await queue.add(jobName, payload, options);
  return true;
}

export async function enqueueWhatsAppInbound(payload: WhatsAppInboundQueuePayload): Promise<boolean> {
  const jobId = payload.webhookEventId ? `wa-inbound-${payload.webhookEventId}` : undefined;
  return enqueue(QUEUE_NAMES.whatsappInbound, "whatsapp-inbound", payload, {
    jobId,
    attempts: 1,
  });
}

export async function enqueueWhatsAppStatus(payload: WhatsAppStatusQueuePayload): Promise<boolean> {
  const jobId = payload.webhookEventId ? `wa-status-${payload.webhookEventId}` : undefined;
  return enqueue(QUEUE_NAMES.whatsappStatus, "whatsapp-status", payload, {
    jobId,
    attempts: 1,
  });
}

export async function enqueueInternalJob(
  job: InternalJobName,
  payload?: Record<string, unknown>,
  requestedBy = "system",
): Promise<boolean> {
  const data: InternalJobQueuePayload = {
    job,
    payload: payload ?? {},
    requestedBy,
  };

  return enqueue(QUEUE_NAMES.internalJobs, `internal-${job}`, data);
}

export function closeQueues(): Promise<void[]> {
  return Promise.all(
    [...queueCache.values()].map(async (queue) => {
      await queue.close();
    }),
  );
}
