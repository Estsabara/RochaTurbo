export type UserStatus = "pending_activation" | "active" | "blocked" | "canceled";

export type ConversationState =
  | "awaiting_cpf"
  | "awaiting_otp"
  | "authenticated"
  | "blocked";

export type SubscriptionStatus =
  | "inactive"
  | "pending_payment"
  | "trial_active"
  | "active"
  | "overdue"
  | "canceled";

export type EntitlementStatus = "none" | "trial" | "active" | "blocked" | "overdue";

export type PaymentStatus =
  | "pending"
  | "received"
  | "overdue"
  | "refunded"
  | "canceled"
  | "failed";

export type IntentType =
  | "faq"
  | "monthly_data_collection"
  | "kpi_explain"
  | "compliance_guidance"
  | "payment";

export type ModuleType =
  | "padrao"
  | "checklist"
  | "promocao"
  | "kpi"
  | "marketing"
  | "swot"
  | "compliance";

export type MessageDirection = "inbound" | "outbound" | "system";

export type OperationType = "urbano" | "rodoviario" | "misto";
export type ShiftType = "12x36" | "8h";
export type FlowType = "onboarding" | "module";
export type FlowStatus = "active" | "completed" | "canceled";
export type QuestionKey = string;

export interface QuestionDefinition {
  key: QuestionKey;
  prompt: string;
  required?: boolean;
  allowSkip?: boolean;
  allowKeep?: boolean;
  fieldPath?: string;
}

export interface FlowTransition {
  from: QuestionKey | null;
  to: QuestionKey | null;
  command?: "menu" | "status" | "voltar" | "pular" | "manter" | "encerrar";
}

export interface FuelPriceInput {
  ga?: number;
  gc?: number;
  etanol_comum?: number;
  etanol_aditivado?: number;
  s10?: number;
  s500?: number;
  s10_aditivado?: number;
  s500_aditivado?: number;
  gasolina_premium?: number;
  gnv?: number;
}

export interface MonthlyInputData {
  a_tipo_posto?: OperationType;
  b_volume_diesel_l?: number;
  c_volume_otto_l?: number;
  d_gnv_m3?: number;
  e_volume_otto_aditivado_l?: number;
  f_volume_diesel_aditivado_l?: number;
  g_qtd_frentistas?: number;
  h_turno?: ShiftType;
  i_horario_funcionamento?: string;
  j_faturamento_pista?: number;
  l_faturamento_troca_oleo?: number;
  m_margem_media_pista_pct?: number;
  n_margem_media_troca_pct?: number;
  o_trocas_oleo_por_dia?: number;
  p_faturamento_conveniencia?: number;
  q_funcionarios_conveniencia?: number;
  r_food_service_faturamento?: number;
  s_bebidas_faturamento?: number;
  t_mercearia_faturamento?: number;
  u_bomboniere_tabacaria_faturamento?: number;
  v_diff_custo_aditivada_r_l?: number;
  x_precos_venda?: FuelPriceInput;
  y_oleo_litros_vendidos?: number;
  z_qtd_trocadores_oleo?: number;
  aa_qtd_abastecimentos_mes?: number;
}

export interface KpiAlert {
  id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  recommendation?: string;
}

export interface CitationItem {
  doc_id: string;
  doc_name: string;
  section_hint?: string | null;
  chunk_id: string;
  similarity?: number;
}
