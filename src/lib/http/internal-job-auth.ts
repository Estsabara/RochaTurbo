import { NextRequest } from "next/server";
import { getServerEnv } from "@/lib/env";
import { assertAdminRequest } from "@/lib/http/admin-auth";

export async function assertInternalJobRequest(request: NextRequest): Promise<{ actor: string }> {
  const env = getServerEnv();
  const header = request.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;

  if (env.INTERNAL_JOB_SECRET && token === env.INTERNAL_JOB_SECRET) {
    return { actor: "internal_job_secret" };
  }

  if (env.INTERNAL_JOB_SECRET && token && token !== env.INTERNAL_JOB_SECRET) {
    throw new Error("Unauthorized internal job request");
  }

  const admin = await assertAdminRequest(request);
  return { actor: admin.actor };
}
