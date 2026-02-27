import { createHmac, timingSafeEqual } from "node:crypto";
import { getServerEnv } from "@/lib/env";

export function verifyMetaWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const env = getServerEnv();

  if (!env.WHATSAPP_APP_SECRET) {
    return true;
  }

  if (!signatureHeader) {
    return false;
  }

  const [algo, providedHex] = signatureHeader.split("=");
  if (algo !== "sha256" || !providedHex) {
    return false;
  }

  const expectedHex = createHmac("sha256", env.WHATSAPP_APP_SECRET).update(rawBody, "utf8").digest("hex");

  const expected = Buffer.from(expectedHex, "hex");
  const provided = Buffer.from(providedHex, "hex");
  if (expected.length !== provided.length) {
    return false;
  }

  return timingSafeEqual(expected, provided);
}
