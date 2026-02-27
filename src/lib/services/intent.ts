import type { IntentType } from "@/lib/types/domain";

const INTENT_KEYWORDS: Array<{ intent: IntentType; patterns: RegExp[] }> = [
  {
    intent: "payment",
    patterns: [/pagamento/i, /assinatura/i, /cobranca/i, /pix/i],
  },
  {
    intent: "monthly_data_collection",
    patterns: [/lancar mes/i, /dados do mes/i, /dashboard/i, /indicador/i, /kpi/i],
  },
  {
    intent: "compliance_guidance",
    patterns: [/anp/i, /inmetro/i, /procon/i, /lgpd/i, /norma/i, /conformidade/i],
  },
  {
    intent: "kpi_explain",
    patterns: [/mix/i, /gap/i, /margem/i, /frentista/i, /conveniencia/i],
  },
  {
    intent: "faq",
    patterns: [/swot/i, /fofa/i, /checklist/i, /promoc/i, /marketing/i, /campanha/i],
  },
];

export function inferIntent(message: string): IntentType {
  for (const candidate of INTENT_KEYWORDS) {
    if (candidate.patterns.some((regex) => regex.test(message))) {
      return candidate.intent;
    }
  }
  return "faq";
}
