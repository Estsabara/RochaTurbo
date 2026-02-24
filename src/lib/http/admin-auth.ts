import { NextRequest } from "next/server";
import { getServerEnv } from "@/lib/env";

export function assertAdminRequest(request: NextRequest): void {
  const env = getServerEnv();
  const configuredToken = env.ADMIN_API_TOKEN;
  if (!configuredToken) {
    return;
  }

  const authHeader = request.headers.get("authorization");
  const providedToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;

  if (!providedToken || providedToken !== configuredToken) {
    throw new Error("Unauthorized admin request");
  }
}
