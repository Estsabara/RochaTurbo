import { NextRequest } from "next/server";
import { getAdminSessionFromRequest } from "@/lib/auth/admin";
import { getServerEnv } from "@/lib/env";

export type AdminRequestContext = {
  actor: string;
  authUserId?: string;
  role?: string;
};

export async function assertAdminRequest(request: NextRequest): Promise<AdminRequestContext> {
  const env = getServerEnv();
  const configuredToken = env.ADMIN_API_TOKEN;

  const authHeader = request.headers.get("authorization");
  const providedToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;

  if (configuredToken && providedToken && providedToken === configuredToken) {
    return { actor: "admin_api_token" };
  }

  if (configuredToken && providedToken && providedToken !== configuredToken) {
    throw new Error("Unauthorized admin request");
  }

  const session = await getAdminSessionFromRequest(request);
  if (!session) {
    throw new Error("Unauthorized admin request");
  }

  return {
    actor: session.actor,
    authUserId: session.authUserId,
    role: session.role,
  };
}
