import { Worker } from "bullmq";
import { getServerEnv } from "@/lib/env";
import { getRedisConnection } from "@/lib/queue/client";
import {
  InternalJobQueuePayload,
  QUEUE_NAMES,
  WhatsAppInboundQueuePayload,
  WhatsAppStatusQueuePayload,
} from "@/lib/queue/definitions";
import { runInternalJob } from "@/lib/services/internal-jobs";
import {
  processWhatsAppInboundPayload,
  type WhatsAppWebhookPayload,
} from "@/lib/services/whatsapp-inbound-processor";
import {
  processWhatsAppStatusPayload,
  type WhatsAppStatusPayload,
} from "@/lib/services/whatsapp-status-processor";
import { logJobFailure, updateWebhookEventStatus } from "@/lib/services/webhook-events";

export function startWorkers(): Worker[] {
  const connection = getRedisConnection();
  if (!connection) {
    return [];
  }

  const env = getServerEnv();

  const inboundWorker = new Worker<WhatsAppInboundQueuePayload>(
    QUEUE_NAMES.whatsappInbound,
    async (job) => {
      const payload = job.data;
      if (payload.webhookEventId) {
        await updateWebhookEventStatus(payload.webhookEventId, "queued");
      }

      await processWhatsAppInboundPayload(payload.payload as unknown as WhatsAppWebhookPayload);

      if (payload.webhookEventId) {
        await updateWebhookEventStatus(payload.webhookEventId, "processed");
      }
    },
    {
      connection: connection as never,
      concurrency: 15,
      prefix: env.QUEUE_PREFIX,
    },
  );

  const statusWorker = new Worker<WhatsAppStatusQueuePayload>(
    QUEUE_NAMES.whatsappStatus,
    async (job) => {
      const payload = job.data;
      if (payload.webhookEventId) {
        await updateWebhookEventStatus(payload.webhookEventId, "queued");
      }

      await processWhatsAppStatusPayload(payload.payload as unknown as WhatsAppStatusPayload);

      if (payload.webhookEventId) {
        await updateWebhookEventStatus(payload.webhookEventId, "processed");
      }
    },
    {
      connection: connection as never,
      concurrency: 20,
      prefix: env.QUEUE_PREFIX,
    },
  );

  const internalWorker = new Worker<InternalJobQueuePayload>(
    QUEUE_NAMES.internalJobs,
    async (job) => {
      const payload = job.data;
      const result = await runInternalJob(payload.job);
      if (!result.ok) {
        throw new Error(String(result.details.error ?? "internal_job_failed"));
      }

      if (payload.webhookEventId) {
        await updateWebhookEventStatus(payload.webhookEventId, "processed");
      }
    },
    {
      connection: connection as never,
      concurrency: 2,
      prefix: env.QUEUE_PREFIX,
    },
  );

  for (const worker of [inboundWorker, statusWorker, internalWorker]) {
    worker.on("failed", async (job, error) => {
      try {
        if (job?.data?.webhookEventId) {
          await updateWebhookEventStatus(Number(job.data.webhookEventId), "failed", {
            error: error.message,
            incrementRetry: true,
          });
        }

        await logJobFailure({
          queueName: worker.name,
          jobName: job?.name ?? "unknown",
          jobId: job?.id ? String(job.id) : null,
          payload: (job?.data as unknown as Record<string, unknown>) ?? {},
          errorText: error.message,
          stack: error.stack ?? null,
        });
      } catch {
        // noop
      }
    });
  }

  return [inboundWorker, statusWorker, internalWorker];
}
