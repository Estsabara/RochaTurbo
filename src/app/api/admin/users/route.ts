import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/http/admin-auth";
import { isValidCpf, normalizeCpf } from "@/lib/security/cpf";
import { logAuditEvent } from "@/lib/services/audit";
import { createOrUpdateUser, listUsers, updateUserStatus } from "@/lib/services/users";

const createSchema = z.object({
  name: z.string().min(2),
  phone_e164: z.string().regex(/^\+[1-9][0-9]{7,14}$/),
  cpf: z.string().min(11),
  status: z.enum(["pending_activation", "active", "blocked", "canceled"]).optional(),
});

const statusSchema = z.object({
  user_id: z.string().uuid(),
  status: z.enum(["pending_activation", "active", "blocked", "canceled"]),
});

export async function GET(request: NextRequest) {
  try {
    await assertAdminRequest(request);
    const users = await listUsers(200);
    return NextResponse.json({ users });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list users" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await assertAdminRequest(request);
    const body = await request.json();
    const parsed = createSchema.parse(body);

    const cpf = normalizeCpf(parsed.cpf);
    if (!isValidCpf(cpf)) {
      return NextResponse.json({ error: "CPF invalido" }, { status: 400 });
    }

    const user = await createOrUpdateUser({
      name: parsed.name,
      phoneE164: parsed.phone_e164,
      cpf,
      status: parsed.status,
    });

    await logAuditEvent({
      actor: admin.actor,
      action: "upsert_user",
      entity: "users",
      entityId: user.id as string,
      metadata: {
        phone: parsed.phone_e164,
      },
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload", details: error.issues }, { status: 400 });
    }
    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to upsert user" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await assertAdminRequest(request);
    const body = await request.json();
    const parsed = statusSchema.parse(body);
    const user = await updateUserStatus(parsed.user_id, parsed.status);

    await logAuditEvent({
      actor: admin.actor,
      action: "update_user_status",
      entity: "users",
      entityId: parsed.user_id,
      metadata: { status: parsed.status },
    });

    return NextResponse.json({ user });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload", details: error.issues }, { status: 400 });
    }
    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update user status" },
      { status: 500 },
    );
  }
}
