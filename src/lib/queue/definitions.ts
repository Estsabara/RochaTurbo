export const QUEUE_NAMES = {
  whatsappInbound: "whatsapp-inbound",
  whatsappStatus: "whatsapp-status",
  internalJobs: "internal-jobs",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export type InternalJobName = "retention" | "dunning" | "subscription-renewal";

export interface WhatsAppInboundQueuePayload {
  webhookEventId?: number;
  payload: Record<string, unknown>;
}

export interface WhatsAppStatusQueuePayload {
  webhookEventId?: number;
  payload: Record<string, unknown>;
}

export interface InternalJobQueuePayload {
  webhookEventId?: number;
  job: InternalJobName;
  requestedBy?: string;
  payload?: Record<string, unknown>;
}
