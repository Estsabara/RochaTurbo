"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isValidCpf, normalizeCpf } from "@/lib/security/cpf";
import { createAsaasBillingLink, mapAsaasPaymentStatus } from "@/lib/services/asaas";
import { createEmbedding } from "@/lib/services/ai";
import { logAuditEvent } from "@/lib/services/audit";
import { computeAndUpsertMonthlyKpis, upsertMonthlyInput } from "@/lib/services/monthly";
import { getOrCreateSubscription, updateSubscriptionStatus, upsertPayment } from "@/lib/services/subscriptions";
import { createOrUpdateUser, updateUserStatus } from "@/lib/services/users";
import { getServiceSupabaseClient } from "@/lib/supabase/server";
import { sendWhatsAppTextMessage } from "@/lib/services/whatsapp";

function go(path: string, ok?: string, err?: string): never {
  if (err) redirect(`${path}?err=${encodeURIComponent(err)}`);
  redirect(`${path}?ok=${encodeURIComponent(ok ?? "Operacao concluida")}`);
}

function splitIntoChunks(text: string, size = 900) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const chunks: string[] = [];
  for (let i = 0; i < cleaned.length; i += size) chunks.push(cleaned.slice(i, i + size));
  return chunks;
}

export async function createUserAction(formData: FormData): Promise<never> {
  const path = "/crm/usuarios";
  try {
    const name = String(formData.get("name") ?? "").trim();
    const phone = String(formData.get("phone_e164") ?? "").trim();
    const cpfRaw = String(formData.get("cpf") ?? "").trim();
    const status = String(formData.get("status") ?? "pending_activation") as
      | "pending_activation"
      | "active"
      | "blocked"
      | "canceled";

    if (name.length < 2) go(path, undefined, "Nome invalido.");
    if (!/^\+[1-9][0-9]{7,14}$/.test(phone)) go(path, undefined, "Telefone deve estar em formato E.164.");

    const cpf = normalizeCpf(cpfRaw);
    if (!isValidCpf(cpf)) go(path, undefined, "CPF invalido.");

    const user = await createOrUpdateUser({
      name,
      phoneE164: phone,
      cpf,
      cpfEncrypted: cpf,
      status,
    });

    await logAuditEvent({
      actor: "crm_server_action",
      action: "upsert_user",
      entity: "users",
      entityId: String(user.id),
      metadata: { phone, status },
    });

    revalidatePath("/crm/usuarios");
    revalidatePath("/crm/dashboard");
    go(path, "Usuario salvo com sucesso.");
  } catch (error) {
    go(path, undefined, error instanceof Error ? error.message : "Falha ao salvar usuario.");
  }
}

export async function setUserStatusAction(formData: FormData): Promise<never> {
  const path = "/crm/usuarios";
  try {
    const userId = String(formData.get("user_id") ?? "").trim();
    const status = String(formData.get("status") ?? "").trim() as
      | "pending_activation"
      | "active"
      | "blocked"
      | "canceled";

    if (!userId) go(path, undefined, "user_id obrigatorio.");
    if (!["pending_activation", "active", "blocked", "canceled"].includes(status)) {
      go(path, undefined, "Status invalido.");
    }

    await updateUserStatus(userId, status);
    await logAuditEvent({
      actor: "crm_server_action",
      action: "update_user_status",
      entity: "users",
      entityId: userId,
      metadata: { status },
    });
    revalidatePath("/crm/usuarios");
    revalidatePath("/crm/dashboard");
    go(path, "Status atualizado.");
  } catch (error) {
    go(path, undefined, error instanceof Error ? error.message : "Falha ao atualizar status.");
  }
}

export async function createBillingLinkAction(formData: FormData): Promise<never> {
  const path = "/crm/cobranca";
  try {
    const userId = String(formData.get("user_id") ?? "").trim();
    const amountBrl = Number(String(formData.get("amount_brl") ?? "").trim());
    const description = String(formData.get("description") ?? "").trim();
    const dueInDaysRaw = String(formData.get("due_in_days") ?? "").trim();
    const dueInDays = dueInDaysRaw ? Number(dueInDaysRaw) : undefined;
    const sendViaWhatsapp = String(formData.get("send_via_whatsapp") ?? "").trim() === "on";

    if (!userId) go(path, undefined, "Selecione um usuario.");
    if (!Number.isFinite(amountBrl) || amountBrl <= 0) go(path, undefined, "Valor invalido.");
    if (description.length < 3) go(path, undefined, "Descricao invalida.");

    const supabase = getServiceSupabaseClient();
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, name, phone_e164, cpf_encrypted")
      .eq("id", userId)
      .single();
    if (userError) throw userError;

    const cpf = normalizeCpf(String(user.cpf_encrypted ?? ""));
    if (!cpf) go(path, undefined, "Usuario sem CPF legivel (cpf_encrypted).");

    const subscription = await getOrCreateSubscription(userId);
    const billing = await createAsaasBillingLink({
      customerName: String(user.name),
      customerCpfCnpj: cpf,
      customerPhone: String(user.phone_e164),
      value: amountBrl,
      description,
      dueInDays,
      externalReference: userId,
    });

    const paymentStatus = mapAsaasPaymentStatus(billing.status);
    await upsertPayment({
      userId,
      subscriptionId: String(subscription.id),
      asaasPaymentId: billing.asaasPaymentId,
      asaasInvoiceNumber: billing.invoiceNumber,
      invoiceUrl: billing.invoiceUrl,
      pixPayload: billing.pixPayload,
      method: "UNDEFINED",
      amountCents: Math.round(billing.amount * 100),
      dueDate: billing.dueDate,
      status: paymentStatus,
      metadata: {
        asaas_status: billing.status,
        send_via_whatsapp: sendViaWhatsapp,
      },
    });

    await updateSubscriptionStatus(userId, "pending_payment");

    if (sendViaWhatsapp && billing.invoiceUrl) {
      await sendWhatsAppTextMessage({
        to: String(user.phone_e164),
        message:
          `Seu acesso ao Rocha Turbo esta pendente de pagamento.\n` +
          `Link para pagamento: ${billing.invoiceUrl}\n` +
          `Assim que confirmado, o acesso sera liberado automaticamente.`,
      });
    }

    await logAuditEvent({
      actor: "crm_server_action",
      action: "create_billing_link",
      entity: "payments",
      entityId: billing.asaasPaymentId,
      metadata: {
        user_id: userId,
        invoice_url: billing.invoiceUrl,
      },
    });

    revalidatePath("/crm/cobranca");
    revalidatePath("/crm/dashboard");
    go(path, `Cobranca criada. Link: ${billing.invoiceUrl ?? "sem URL"}`);
  } catch (error) {
    go(path, undefined, error instanceof Error ? error.message : "Falha ao criar cobranca.");
  }
}

export async function uploadKnowledgeAction(formData: FormData): Promise<never> {
  const path = "/crm/configuracoes";
  try {
    const title = String(formData.get("title") ?? "").trim();
    const source = String(formData.get("source") ?? "").trim();
    const version = String(formData.get("version") ?? "").trim() || null;
    const sectionHint = String(formData.get("section_hint") ?? "").trim() || null;
    const text = String(formData.get("text") ?? "").trim();

    if (title.length < 3) go(path, undefined, "Titulo invalido.");
    if (source.length < 3) go(path, undefined, "Source invalido.");
    if (text.length < 20) go(path, undefined, "Texto muito curto.");

    const supabase = getServiceSupabaseClient();
    const { data: doc, error: docError } = await supabase
      .from("knowledge_docs")
      .insert({
        title,
        source,
        version,
        status: "active",
      })
      .select("*")
      .single();
    if (docError) throw docError;

    const chunks = splitIntoChunks(text);
    const rows: Array<Record<string, unknown>> = [];
    for (let i = 0; i < chunks.length; i += 1) {
      const embedding = await createEmbedding(chunks[i]);
      rows.push({
        doc_id: doc.id,
        chunk_index: i,
        section_hint: sectionHint,
        chunk_text: chunks[i],
        embedding,
      });
    }

    const { error: chunksError } = await supabase.from("knowledge_chunks").insert(rows);
    if (chunksError) throw chunksError;

    await logAuditEvent({
      actor: "crm_server_action",
      action: "upload_knowledge_document",
      entity: "knowledge_docs",
      entityId: String(doc.id),
      metadata: { chunks: rows.length, title },
    });

    revalidatePath("/crm/configuracoes");
    go(path, `Documento indexado com ${rows.length} chunks.`);
  } catch (error) {
    go(path, undefined, error instanceof Error ? error.message : "Falha no upload de conhecimento.");
  }
}

export async function runRetentionAction(): Promise<never> {
  const path = "/crm/configuracoes";
  try {
    const supabase = getServiceSupabaseClient();
    const { data, error } = await supabase.rpc("run_retention_cleanup");
    if (error) throw error;
    revalidatePath("/crm/configuracoes");
    go(path, `Retencao executada: ${JSON.stringify(data)}`);
  } catch (error) {
    go(path, undefined, error instanceof Error ? error.message : "Falha ao executar retencao.");
  }
}

export async function computeMonthlyAction(formData: FormData): Promise<never> {
  const path = "/crm/configuracoes";
  try {
    const userId = String(formData.get("user_id") ?? "").trim();
    const monthRef = String(formData.get("month_ref") ?? "").trim();
    const inputJsonRaw = String(formData.get("input_json") ?? "").trim();

    if (!userId) go(path, undefined, "user_id obrigatorio.");
    if (!/^\d{4}-\d{2}-01$/.test(monthRef)) go(path, undefined, "month_ref invalido (use YYYY-MM-01).");
    const inputData = JSON.parse(inputJsonRaw || "{}") as Record<string, unknown>;

    await upsertMonthlyInput(userId, monthRef, inputData, "form");
    await computeAndUpsertMonthlyKpis(userId, monthRef, inputData);
    revalidatePath("/crm/configuracoes");
    go(path, "KPI mensal calculado e salvo.");
  } catch (error) {
    go(path, undefined, error instanceof Error ? error.message : "Falha no calculo mensal.");
  }
}
