import { getServiceSupabaseClient } from "@/lib/supabase/server";

export async function logAuditEvent(input: {
  actor: string;
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const supabase = getServiceSupabaseClient();
  const { error } = await supabase.rpc("log_audit_event", {
    p_actor: input.actor,
    p_action: input.action,
    p_entity: input.entity,
    p_entity_id: input.entityId ?? null,
    p_metadata: input.metadata ?? {},
  });
  if (error) throw error;
}
