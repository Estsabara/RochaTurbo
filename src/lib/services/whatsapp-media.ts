import { getServerEnv } from "@/lib/env";

interface MediaDownloadResult {
  buffer: ArrayBuffer;
  mimeType: string;
  fileName: string;
}

export async function downloadWhatsAppMedia(mediaId: string): Promise<MediaDownloadResult> {
  const env = getServerEnv();
  if (!env.WHATSAPP_TOKEN) {
    throw new Error("WHATSAPP_TOKEN is not configured");
  }

  const metadataResponse = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
    },
  });

  if (!metadataResponse.ok) {
    const body = await metadataResponse.text();
    throw new Error(`Failed to fetch WhatsApp media metadata: ${metadataResponse.status} ${body}`);
  }

  const metadata = (await metadataResponse.json()) as {
    url: string;
    mime_type?: string;
  };

  const fileResponse = await fetch(metadata.url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
    },
  });

  if (!fileResponse.ok) {
    const body = await fileResponse.text();
    throw new Error(`Failed to download WhatsApp media: ${fileResponse.status} ${body}`);
  }

  const mimeType = metadata.mime_type ?? fileResponse.headers.get("content-type") ?? "application/octet-stream";
  const extension = mimeType.includes("ogg")
    ? "ogg"
    : mimeType.includes("mpeg")
      ? "mp3"
      : mimeType.includes("mp4")
        ? "mp4"
        : "bin";
  const fileName = `wa-audio.${extension}`;

  return {
    buffer: await fileResponse.arrayBuffer(),
    mimeType,
    fileName,
  };
}
