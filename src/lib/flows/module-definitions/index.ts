import type { ModuleType } from "@/lib/types/domain";
import type { FlowDefinition } from "@/lib/flows/types";

export type ModuleWizardType =
  | "padrao"
  | "checklist"
  | "promocao"
  | "kpi"
  | "marketing"
  | "swot";

export interface ModuleWizardDefinition extends FlowDefinition {
  module: ModuleType;
  wizard: ModuleWizardType;
  menuLabel: string;
}

const PADRAO_FLOW: ModuleWizardDefinition = {
  type: "module",
  module: "padrao",
  wizard: "padrao",
  menuLabel: "Padrao de atendimento",
  initialStep: "objetivos",
  questions: [
    {
      key: "objetivos",
      fieldPath: "objetivos",
      parser: "multi_select",
      options: [
        "volume",
        "fidelizacao",
        "mix_aditivada",
        "venda_pista",
        "troca_oleo",
        "conveniencia",
      ],
      required: true,
      prompt:
        "Escolha ate 3 objetivos (separados por virgula): volume, fidelizacao, mix_aditivada, venda_pista, troca_oleo, conveniencia.",
    },
    {
      key: "programa_fidelidade",
      fieldPath: "programa_fidelidade",
      parser: "text",
      required: false,
      allowSkip: true,
      when: (answers) => hasSelected(answers, "volume") || hasSelected(answers, "fidelizacao"),
      prompt:
        "Voce possui programa de fidelidade com controle LGPD e possibilidade de migracao de base? Se sim, informe o nome.",
    },
    {
      key: "aditivados_disponiveis",
      fieldPath: "aditivados_disponiveis",
      parser: "text",
      required: false,
      allowSkip: true,
      when: (answers) => hasSelected(answers, "mix_aditivada"),
      prompt: "Quais combustiveis aditivados voce possui (Gasolina, Etanol, S10 e/ou S500)?",
    },
    {
      key: "produtos_pista",
      fieldPath: "produtos_pista",
      parser: "text",
      required: false,
      allowSkip: true,
      when: (answers) => hasSelected(answers, "venda_pista"),
      prompt: "Quais produtos voce possui para venda na pista?",
    },
    {
      key: "parcelamento_troca",
      fieldPath: "parcelamento_troca",
      parser: "yes_no",
      required: false,
      allowSkip: true,
      when: (answers) => hasSelected(answers, "troca_oleo"),
      prompt: "Na troca de oleo, voce possui condicao de parcelamento? (sim/nao)",
    },
    {
      key: "perfil_conveniencia",
      fieldPath: "perfil_conveniencia",
      parser: "text",
      required: false,
      allowSkip: true,
      when: (answers) => hasSelected(answers, "conveniencia"),
      prompt:
        "Na conveniencia, informe linhas disponiveis (padaria/cafeteria/salgados/food service) e publico principal (balada, bairro ou passantes).",
    },
  ],
};

const CHECKLIST_FLOW: ModuleWizardDefinition = {
  type: "module",
  module: "checklist",
  wizard: "checklist",
  menuLabel: "Checklist",
  initialStep: "tipo_checklist",
  questions: [
    {
      key: "tipo_checklist",
      fieldPath: "tipo_checklist",
      parser: "multi_select",
      options: ["qualidade", "custom"],
      required: true,
      prompt: "Qual checklist voce quer agora? Responda: qualidade ou custom.",
    },
    {
      key: "padrao_existente",
      fieldPath: "padrao_existente",
      parser: "yes_no",
      required: false,
      allowSkip: true,
      when: (answers) => hasSelected(answers, "qualidade"),
      prompt: "Voce ja possui padrao de atendimento definido? (sim/nao)",
    },
    {
      key: "objetivo_custom",
      fieldPath: "objetivo_custom",
      parser: "text",
      required: false,
      allowSkip: true,
      when: (answers) => hasSelected(answers, "custom"),
      prompt: "Qual o objetivo do checklist customizado?",
    },
    {
      key: "area_custom",
      fieldPath: "area_custom",
      parser: "text",
      required: false,
      allowSkip: true,
      when: (answers) => hasSelected(answers, "custom"),
      prompt: "A qual area/local ele se aplica?",
    },
    {
      key: "foco_custom",
      fieldPath: "foco_custom",
      parser: "text",
      required: false,
      allowSkip: true,
      when: (answers) => hasSelected(answers, "custom"),
      prompt: "Quais itens merecem maior atencao nesse checklist?",
    },
  ],
};

const PROMOCAO_FLOW: ModuleWizardDefinition = {
  type: "module",
  module: "promocao",
  wizard: "promocao",
  menuLabel: "Promocao",
  initialStep: "o_que_promover",
  questions: [
    {
      key: "o_que_promover",
      fieldPath: "o_que_promover",
      parser: "text",
      required: true,
      prompt: "O que voce quer promover? Descreva produto/servico, local e contexto.",
    },
    {
      key: "tipo_promocao",
      fieldPath: "tipo_promocao",
      parser: "multi_select",
      options: ["preco", "valor_agregado", "urgencia", "fidelidade"],
      required: true,
      prompt: "Qual tipo de promocao voce quer? (preco, valor_agregado, urgencia, fidelidade)",
    },
    {
      key: "detalhes_combo",
      fieldPath: "detalhes_combo",
      parser: "text",
      required: false,
      allowSkip: true,
      when: (answers) => hasSelected(answers, "valor_agregado"),
      prompt: "Se for valor agregado/combo, quais itens quer atrelar e qual objetivo comercial?",
    },
    {
      key: "periodo",
      fieldPath: "periodo",
      parser: "text",
      required: true,
      prompt: "Defina periodo da campanha (inicio e termino).",
    },
    {
      key: "meta_principal",
      fieldPath: "meta_principal",
      parser: "text",
      required: true,
      prompt: "Qual KPI principal quer mover com essa promocao?",
    },
  ],
};

const KPI_FLOW: ModuleWizardDefinition = {
  type: "module",
  module: "kpi",
  wizard: "kpi",
  menuLabel: "Indicadores KPI",
  initialStep: "tarefas",
  questions: [
    {
      key: "tarefas",
      fieldPath: "tarefas",
      parser: "text",
      required: true,
      prompt: "Quais tarefas/processos voce quer acompanhar com indicadores?",
    },
    {
      key: "ferramentas",
      fieldPath: "ferramentas",
      parser: "multi_select",
      options: ["fluxograma", "ishikawa", "pareto", "histograma", "checklist", "dispersao", "controle"],
      required: true,
      prompt:
        "Quais ferramentas deseja usar na avaliacao? (fluxograma, ishikawa, pareto, histograma, checklist, dispersao, controle)",
    },
    {
      key: "incmodo",
      fieldPath: "incmodo",
      parser: "text",
      required: true,
      prompt: "O que mais te incomoda hoje e voce quer melhorar com monitoramento?",
    },
  ],
};

const MARKETING_FLOW: ModuleWizardDefinition = {
  type: "module",
  module: "marketing",
  wizard: "marketing",
  menuLabel: "Campanha de marketing",
  initialStep: "cliente_ideal",
  questions: [
    {
      key: "cliente_ideal",
      fieldPath: "cliente_ideal",
      parser: "text",
      required: true,
      prompt: "Descreva seu cliente ideal (idade, perfil, veiculo, ticket, combustivel e comportamento).",
    },
    {
      key: "picos_fluxo",
      fieldPath: "picos_fluxo",
      parser: "text",
      required: true,
      prompt: "Quais dias/horarios de maior e menor frequencia?",
    },
    {
      key: "sazonalidade",
      fieldPath: "sazonalidade",
      parser: "text",
      required: false,
      allowSkip: true,
      prompt: "Existe sazonalidade que impacta vendas? Descreva.",
    },
    {
      key: "datas_importantes",
      fieldPath: "datas_importantes",
      parser: "text",
      required: false,
      allowSkip: true,
      prompt: "Quais datas importantes para seu negocio/público?",
    },
    {
      key: "diferenciais",
      fieldPath: "diferenciais",
      parser: "text",
      required: true,
      prompt: "Quais seus diferenciais competitivos?",
    },
    {
      key: "produtos_destaque",
      fieldPath: "produtos_destaque",
      parser: "text",
      required: true,
      prompt: "Quais produtos/servicos voce quer destacar na comunicacao?",
    },
    {
      key: "identidade_visual",
      fieldPath: "identidade_visual",
      parser: "yes_no",
      required: false,
      allowSkip: true,
      prompt: "Voce ja possui identidade visual consolidada? (sim/nao)",
    },
    {
      key: "reels_script",
      fieldPath: "reels_script",
      parser: "yes_no",
      required: true,
      prompt: "Voce quer que eu gere scripts para reels/stories? (sim/nao)",
    },
  ],
};

const SWOT_FLOW: ModuleWizardDefinition = {
  type: "module",
  module: "swot",
  wizard: "swot",
  menuLabel: "Analise SWOT",
  initialStep: "forcas",
  questions: [
    {
      key: "forcas",
      fieldPath: "forcas",
      parser: "text",
      required: true,
      prompt: "Liste suas principais forcas internas.",
    },
    {
      key: "fraquezas",
      fieldPath: "fraquezas",
      parser: "text",
      required: true,
      prompt: "Liste suas principais fraquezas internas.",
    },
    {
      key: "oportunidades",
      fieldPath: "oportunidades",
      parser: "text",
      required: true,
      prompt: "Liste oportunidades externas relevantes para seu posto.",
    },
    {
      key: "ameacas",
      fieldPath: "ameacas",
      parser: "text",
      required: true,
      prompt: "Liste ameacas externas que podem impactar o negocio.",
    },
  ],
};

export const MODULE_FLOW_DEFINITIONS: Record<ModuleWizardType, ModuleWizardDefinition> = {
  padrao: PADRAO_FLOW,
  checklist: CHECKLIST_FLOW,
  promocao: PROMOCAO_FLOW,
  kpi: KPI_FLOW,
  marketing: MARKETING_FLOW,
  swot: SWOT_FLOW,
};

export const MAIN_MENU_LINES = [
  "Menu Rocha Turbo:",
  "1) Diagnostico mensal",
  "2) Padrao de atendimento",
  "3) Checklist",
  "4) Promocao",
  "5) KPI",
  "6) Marketing",
  "7) SWOT",
  "8) Pergunta livre (IA)",
  "Comandos: menu | status | voltar | pular | manter | encerrar",
];

export function getMainMenuText(): string {
  return MAIN_MENU_LINES.join("\n");
}

export function detectMenuSelection(text: string): ModuleWizardType | "onboarding" | "rag" | null {
  const normalized = text.trim().toLowerCase();
  if (normalized === "1") return "onboarding";
  if (normalized === "2") return "padrao";
  if (normalized === "3") return "checklist";
  if (normalized === "4") return "promocao";
  if (normalized === "5") return "kpi";
  if (normalized === "6") return "marketing";
  if (normalized === "7") return "swot";
  if (normalized === "8") return "rag";
  return null;
}

export function detectModuleByText(text: string): ModuleWizardType | null {
  const normalized = text.toLowerCase();
  if (/swot|fofa/.test(normalized)) return "swot";
  if (/checklist/.test(normalized)) return "checklist";
  if (/promo[cç][aã]o|campanha/.test(normalized)) return "promocao";
  if (/marketing|instagram|reels/.test(normalized)) return "marketing";
  if (/padr[aã]o|atendimento/.test(normalized)) return "padrao";
  if (/kpi|indicador|pareto|ishikawa|histograma/.test(normalized)) return "kpi";
  return null;
}

function hasSelected(answers: Record<string, unknown>, value: string): boolean {
  const selected = answers.tipo_checklist ?? answers.objetivos ?? answers.tipo_promocao;
  if (!Array.isArray(selected)) return false;
  return selected.some((item) => String(item).toLowerCase() === value.toLowerCase());
}

