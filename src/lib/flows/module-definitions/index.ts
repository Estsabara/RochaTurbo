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
      options: ["volume", "fidelizacao", "mix_aditivada", "venda_pista", "troca_oleo", "conveniencia"],
      minSelections: 1,
      maxSelections: 3,
      required: true,
      prompt:
        "Quais indicadores voce quer melhorar no padrao? Escolha de 1 a 3 (separados por virgula): volume, fidelizacao, mix_aditivada, venda_pista, troca_oleo, conveniencia.",
    },
    {
      key: "fidelidade_programa_ativo",
      fieldPath: "fidelidade.programa_ativo",
      parser: "yes_no",
      required: false,
      allowSkip: true,
      when: (answers) => hasSelected(answers, "objetivos", "fidelizacao"),
      prompt: "Voce possui programa de fidelidade ativo hoje? (sim/nao)",
    },
    {
      key: "fidelidade_programa_nome",
      fieldPath: "fidelidade.programa_nome",
      parser: "text",
      required: true,
      when: (answers) =>
        hasSelected(answers, "objetivos", "fidelizacao") &&
        getBooleanPath(answers, "fidelidade.programa_ativo") === true,
      prompt: "Qual o nome do programa de fidelidade do posto?",
    },
    {
      key: "fidelidade_lgpd",
      fieldPath: "fidelidade.conformidade_lgpd",
      parser: "yes_no",
      required: false,
      allowSkip: true,
      when: (answers) => hasSelected(answers, "objetivos", "fidelizacao"),
      prompt: "O programa atende LGPD e permite capturar/usar dados com consentimento adequado? (sim/nao)",
    },
    {
      key: "fidelidade_migracao_base",
      fieldPath: "fidelidade.migracao_base",
      parser: "yes_no",
      required: false,
      allowSkip: true,
      when: (answers) => hasSelected(answers, "objetivos", "fidelizacao"),
      prompt: "Voce consegue migrar a base de clientes em caso de troca de fornecedor? (sim/nao)",
    },
    {
      key: "mix_aditivada_produtos",
      fieldPath: "mix_aditivada.produtos",
      parser: "text",
      required: false,
      allowSkip: true,
      when: (answers) => hasSelected(answers, "objetivos", "mix_aditivada"),
      prompt: "Quais combustiveis aditivados voce oferece (Gasolina, Etanol, S10 e/ou S500)?",
    },
    {
      key: "venda_pista_produtos",
      fieldPath: "venda_pista.produtos",
      parser: "text",
      required: false,
      allowSkip: true,
      when: (answers) => hasSelected(answers, "objetivos", "venda_pista"),
      prompt: "Quais produtos voce tem para venda na pista?",
    },
    {
      key: "troca_oleo_parcelamento",
      fieldPath: "troca_oleo.parcelamento",
      parser: "yes_no",
      required: false,
      allowSkip: true,
      when: (answers) => hasSelected(answers, "objetivos", "troca_oleo"),
      prompt: "Voce possui condicao de parcelamento na troca de oleo? (sim/nao)",
    },
    {
      key: "conveniencia_linhas",
      fieldPath: "conveniencia.linhas",
      parser: "text",
      required: false,
      allowSkip: true,
      when: (answers) => hasSelected(answers, "objetivos", "conveniencia"),
      prompt:
        "Sua conveniencia possui quais linhas? (padaria, cafeteria, salgados, food service). Se quiser, descreva os itens principais.",
    },
    {
      key: "conveniencia_publico",
      fieldPath: "conveniencia.publico_principal",
      parser: "multi_select",
      options: ["balada", "bairro", "passantes"],
      minSelections: 1,
      maxSelections: 1,
      required: false,
      allowSkip: true,
      when: (answers) => hasSelected(answers, "objetivos", "conveniencia"),
      prompt: "Qual publico principal da conveniencia? (balada, bairro ou passantes)",
    },
    {
      key: "padrao_observacoes",
      fieldPath: "observacoes",
      parser: "text",
      required: false,
      allowSkip: true,
      prompt: "Existe alguma regra interna do seu posto que precisa entrar no padrao? Se sim, descreva.",
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
      minSelections: 1,
      maxSelections: 1,
      required: true,
      prompt: "Qual checklist voce quer montar agora? (qualidade ou custom)",
    },
    {
      key: "qualidade_possui_padrao",
      fieldPath: "qualidade.possui_padrao",
      parser: "yes_no",
      required: false,
      allowSkip: true,
      when: (answers) => hasSelected(answers, "tipo_checklist", "qualidade"),
      prompt: "Voce ja possui um padrao de atendimento pronto? (sim/nao)",
    },
    {
      key: "qualidade_descricao_padrao",
      fieldPath: "qualidade.descricao_padrao",
      parser: "text",
      required: false,
      allowSkip: true,
      when: (answers) =>
        hasSelected(answers, "tipo_checklist", "qualidade") &&
        getBooleanPath(answers, "qualidade.possui_padrao") === true,
      prompt: "Resuma seu padrao atual para eu adaptar o checklist shoulder-to-shoulder.",
    },
    {
      key: "qualidade_turnos",
      fieldPath: "qualidade.turnos",
      parser: "text",
      required: false,
      allowSkip: true,
      when: (answers) => hasSelected(answers, "tipo_checklist", "qualidade"),
      prompt: "Quais turnos voce quer acompanhar no checklist de qualidade?",
    },
    {
      key: "custom_objetivo",
      fieldPath: "custom.objetivo",
      parser: "text",
      required: false,
      allowSkip: true,
      when: (answers) => hasSelected(answers, "tipo_checklist", "custom"),
      prompt: "Qual o objetivo desse checklist customizado?",
    },
    {
      key: "custom_area",
      fieldPath: "custom.area",
      parser: "text",
      required: false,
      allowSkip: true,
      when: (answers) => hasSelected(answers, "tipo_checklist", "custom"),
      prompt: "A qual area/local esse checklist se aplica?",
    },
    {
      key: "custom_periodicidade",
      fieldPath: "custom.periodicidade",
      parser: "text",
      required: false,
      allowSkip: true,
      when: (answers) => hasSelected(answers, "tipo_checklist", "custom"),
      prompt: "Qual periodicidade desejada (diario, semanal, mensal, por evento)?",
    },
    {
      key: "custom_itens_foco",
      fieldPath: "custom.itens_foco",
      parser: "text",
      required: false,
      allowSkip: true,
      when: (answers) => hasSelected(answers, "tipo_checklist", "custom"),
      prompt: "Quais itens devem receber maior atencao nesse checklist?",
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
      fieldPath: "campanha.objeto",
      parser: "text",
      required: true,
      prompt: "O que voce quer promover? Descreva produto/servico, local e contexto.",
    },
    {
      key: "tipo_promocao",
      fieldPath: "campanha.tipos",
      parser: "multi_select",
      options: ["preco", "valor_agregado", "urgencia", "fidelidade"],
      minSelections: 1,
      maxSelections: 4,
      required: true,
      prompt: "Qual tipo de promocao deseja usar? (preco, valor_agregado, urgencia, fidelidade)",
    },
    {
      key: "valor_agregado_formato",
      fieldPath: "campanha.valor_agregado_formato",
      parser: "multi_select",
      options: ["combo", "brinde", "leve3pague2", "pacote", "outro"],
      minSelections: 1,
      maxSelections: 2,
      required: false,
      allowSkip: true,
      when: (answers) => hasSelected(answers, "campanha.tipos", "valor_agregado"),
      prompt: "Se usar valor agregado, qual formato? (combo, brinde, leve3pague2, pacote, outro)",
    },
    {
      key: "combo_detalhes",
      fieldPath: "campanha.combo_detalhes",
      parser: "text",
      required: false,
      allowSkip: true,
      when: (answers) => hasSelected(answers, "campanha.valor_agregado_formato", "combo"),
      prompt: "Se for combo, qual produto de tracao e qual produto quer impulsionar?",
    },
    {
      key: "periodo",
      fieldPath: "campanha.periodo",
      parser: "text",
      required: true,
      prompt: "Informe data de inicio e termino da promocao.",
    },
    {
      key: "meta_principal",
      fieldPath: "campanha.meta_principal",
      parser: "text",
      required: true,
      prompt: "Qual indicador principal quer mover com essa promocao?",
    },
    {
      key: "canais_comunicacao",
      fieldPath: "campanha.canais",
      parser: "text",
      required: false,
      allowSkip: true,
      prompt: "Quais canais de comunicacao serao usados (pista, topo de bomba, redes, influenciador etc)?",
    },
    {
      key: "mensuracao",
      fieldPath: "mensuracao.indicadores",
      parser: "multi_select",
      options: ["cac", "conversao", "resultado_financeiro"],
      minSelections: 1,
      maxSelections: 3,
      required: true,
      prompt: "Quais indicadores de mensuracao quer acompanhar? (cac, conversao, resultado_financeiro)",
    },
    {
      key: "materiais_campanha",
      fieldPath: "campanha.materiais",
      parser: "yes_no",
      required: false,
      allowSkip: true,
      prompt: "Deseja que eu gere materiais de campanha (cartaz, topo de bomba, panfleto, copy e script de reels)? (sim/nao)",
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
      fieldPath: "kpi.tarefas",
      parser: "text",
      required: true,
      prompt: "Quais tarefas/processos voce quer acompanhar com indicadores?",
    },
    {
      key: "ferramentas",
      fieldPath: "kpi.ferramentas",
      parser: "multi_select",
      options: ["fluxograma", "ishikawa", "pareto", "histograma", "checklist", "dispersao", "controle"],
      minSelections: 1,
      maxSelections: 4,
      required: true,
      prompt:
        "Quais ferramentas deseja usar na avaliacao? (fluxograma, ishikawa, pareto, histograma, checklist, dispersao, controle)",
    },
    {
      key: "incomodo",
      fieldPath: "kpi.incomodo_principal",
      parser: "text",
      required: true,
      prompt: "O que mais te incomoda hoje e voce quer melhorar com esses indicadores?",
    },
    {
      key: "periodicidade",
      fieldPath: "kpi.periodicidade_medicao",
      parser: "text",
      required: false,
      allowSkip: true,
      prompt: "Qual periodicidade de medicao e revisao (diaria, semanal, mensal)?",
    },
    {
      key: "fonte_dados",
      fieldPath: "kpi.fonte_dados",
      parser: "text",
      required: false,
      allowSkip: true,
      prompt: "De onde os dados serao coletados (ERP, planilha, sistema do posto, check manual)?",
    },
  ],
};

const MARKETING_FLOW: ModuleWizardDefinition = {
  type: "module",
  module: "marketing",
  wizard: "marketing",
  menuLabel: "Campanha de marketing",
  initialStep: "cliente_perfil",
  questions: [
    {
      key: "cliente_perfil",
      fieldPath: "marketing.cliente_perfil",
      parser: "text",
      required: true,
      prompt:
        "Descreva seu cliente: idade, sexo, regiao, tipo de veiculo, estado de conservacao, ticket medio, combustivel e comportamento.",
    },
    {
      key: "picos_fluxo",
      fieldPath: "marketing.picos_fluxo",
      parser: "text",
      required: true,
      prompt: "Quais dias/horarios de maior frequencia e de menor frequencia?",
    },
    {
      key: "sazonalidade",
      fieldPath: "marketing.sazonalidade",
      parser: "text",
      required: false,
      allowSkip: true,
      prompt: "Existe sazonalidade que interfere nas vendas (ferias, safra, eventos)?",
    },
    {
      key: "datas_importantes",
      fieldPath: "marketing.datas_importantes",
      parser: "text",
      required: false,
      allowSkip: true,
      prompt: "Quais datas importantes para seu negocio e publico?",
    },
    {
      key: "diferenciais",
      fieldPath: "marketing.diferenciais",
      parser: "text",
      required: true,
      prompt: "Quais seus diferenciais competitivos?",
    },
    {
      key: "horario_funcionamento",
      fieldPath: "marketing.horario_funcionamento",
      parser: "text",
      required: true,
      prompt: "Qual o horario de funcionamento do posto?",
    },
    {
      key: "produtos_destaque",
      fieldPath: "marketing.produtos_destaque",
      parser: "text",
      required: true,
      prompt: "Quais produtos/servicos quer destacar na campanha?",
    },
    {
      key: "logomarca_enviada",
      fieldPath: "marketing.logomarca_enviada",
      parser: "yes_no",
      required: false,
      allowSkip: true,
      prompt: "Voce ja enviou a logomarca (PNG)? (sim/nao)",
    },
    {
      key: "identidade_visual",
      fieldPath: "marketing.identidade_visual",
      parser: "yes_no",
      required: false,
      allowSkip: true,
      prompt: "Voce ja possui identidade visual consolidada? (sim/nao)",
    },
    {
      key: "print_instagram",
      fieldPath: "marketing.print_instagram_9_posts",
      parser: "yes_no",
      required: false,
      allowSkip: true,
      when: (answers) => getBooleanPath(answers, "marketing.identidade_visual") === true,
      prompt: "Consegue enviar print do Instagram com as ultimas 9 postagens? (sim/nao)",
    },
    {
      key: "scripts_video",
      fieldPath: "marketing.scripts_video",
      parser: "yes_no",
      required: true,
      prompt: "Deseja gerar scripts para reels e stories? (sim/nao)",
    },
  ],
};

const SWOT_FLOW: ModuleWizardDefinition = {
  type: "module",
  module: "swot",
  wizard: "swot",
  menuLabel: "Analise SWOT",
  initialStep: "contexto",
  questions: [
    {
      key: "contexto",
      fieldPath: "swot.contexto_negocio",
      parser: "text",
      required: true,
      prompt: "Resuma o contexto atual do negocio neste mes (cenario, desafios e foco).",
    },
    {
      key: "forcas",
      fieldPath: "swot.forcas",
      parser: "text",
      required: true,
      prompt: "Liste as principais forcas internas.",
    },
    {
      key: "fraquezas",
      fieldPath: "swot.fraquezas",
      parser: "text",
      required: true,
      prompt: "Liste as principais fraquezas internas.",
    },
    {
      key: "oportunidades",
      fieldPath: "swot.oportunidades",
      parser: "text",
      required: true,
      prompt: "Liste as oportunidades externas relevantes.",
    },
    {
      key: "ameacas",
      fieldPath: "swot.ameacas",
      parser: "text",
      required: true,
      prompt: "Liste as ameacas externas relevantes.",
    },
    {
      key: "prioridades",
      fieldPath: "swot.prioridades_estrategicas",
      parser: "text",
      required: false,
      allowSkip: true,
      prompt: "Quais prioridades estrategicas devem ser atacadas primeiro?",
    },
    {
      key: "plano_acao",
      fieldPath: "swot.plano_acao",
      parser: "text",
      required: false,
      allowSkip: true,
      prompt: "Descreva plano de acao inicial (responsaveis, prazos e metas).",
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
  const normalized = normalizeForDetection(text);
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
  const normalized = normalizeForDetection(text);
  if (/swot|fofa/.test(normalized)) return "swot";
  if (/checklist/.test(normalized)) return "checklist";
  if (/promocao|campanha/.test(normalized)) return "promocao";
  if (/marketing|instagram|reels/.test(normalized)) return "marketing";
  if (/padrao|atendimento/.test(normalized)) return "padrao";
  if (/kpi|indicador|pareto|ishikawa|histograma/.test(normalized)) return "kpi";
  return null;
}

function normalizeForDetection(text: string): string {
  return text
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function hasSelected(answers: Record<string, unknown>, fieldPath: string, value: string): boolean {
  const selected = getPath(answers, fieldPath);
  if (!Array.isArray(selected)) return false;
  return selected.some((item) => String(item).toLowerCase() === value.toLowerCase());
}

function getBooleanPath(answers: Record<string, unknown>, fieldPath: string): boolean | null {
  const value = getPath(answers, fieldPath);
  return typeof value === "boolean" ? value : null;
}

function getPath(source: Record<string, unknown>, path: string): unknown {
  const segments = path.split(".");
  let cursor: unknown = source;
  for (const segment of segments) {
    if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

