import { createHash, randomInt, timingSafeEqual } from "crypto";

export function generateOtpCode(length = 6): string {
  const max = 10 ** length;
  return randomInt(0, max).toString().padStart(length, "0");
}

export function hashOtp(code: string, secret: string): string {
  return createHash("sha256").update(`${secret}:${code}`).digest("hex");
}

export function verifyOtp(code: string, expectedHash: string, secret: string): boolean {
  const providedHash = hashOtp(code, secret);
  const expectedBuffer = Buffer.from(expectedHash, "hex");
  const providedBuffer = Buffer.from(providedHash, "hex");

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}
