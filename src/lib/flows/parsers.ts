import type { FlowParserKind, FlowParserResult } from "@/lib/flows/types";

const OPERATION_ALIASES: Array<{ value: "urbano" | "rodoviario" | "misto"; aliases: RegExp[] }> = [
  { value: "urbano", aliases: [/^urbano$/i, /^u$/i] },
  { value: "rodoviario", aliases: [/^rodoviario$/i, /^r$/i] },
  { value: "misto", aliases: [/^misto$/i, /^m$/i] },
];

const SHIFT_ALIASES: Array<{ value: "12x36" | "8h"; aliases: RegExp[] }> = [
  { value: "12x36", aliases: [/^12\s*x\s*36$/i, /^12x36$/i] },
  { value: "8h", aliases: [/^8h$/i, /^8\s*horas?$/i, /^8$/i] },
];

export function normalizeFlowText(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

function normalizeForComparison(input: string): string {
  return normalizeFlowText(input)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function parseFlowCommand(input: string) {
  const normalized = normalizeForComparison(input);
  if (!normalized) return { command: null } as const;
  if (normalized === "menu") return { command: "menu" } as const;
  if (normalized === "status") return { command: "status" } as const;
  if (normalized === "voltar") return { command: "voltar" } as const;
  if (normalized === "pular" || normalized === "nao se aplica") {
    return { command: "pular" } as const;
  }
  if (normalized === "manter") return { command: "manter" } as const;
  if (normalized === "encerrar" || normalized === "cancelar") return { command: "encerrar" } as const;
  return { command: null } as const;
}

export function parseByKind(
  input: string,
  kind: FlowParserKind,
  options: string[] = [],
  constraints?: {
    minSelections?: number;
    maxSelections?: number;
  },
): FlowParserResult {
  switch (kind) {
    case "text":
      return parseText(input);
    case "number_br":
      return parseNumberBr(input);
    case "percentage_br":
      return parsePercentageBr(input);
    case "operation_type":
      return parseOperationType(input);
    case "shift":
      return parseShift(input);
    case "month_ref":
      return parseMonthRef(input);
    case "multi_select":
      return parseMultiSelect(input, options, constraints?.minSelections, constraints?.maxSelections);
    case "yes_no":
      return parseYesNo(input);
    default:
      return { ok: false, error: "Parser nao suportado." };
  }
}

function parseText(input: string): FlowParserResult {
  const value = normalizeFlowText(input);
  if (!value) return { ok: false, error: "Resposta vazia. Envie um texto valido." };
  return { ok: true, value };
}

function parseNumberBr(input: string): FlowParserResult {
  const normalized = normalizeFlowText(input)
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");
  if (!normalized) return { ok: false, error: "Nao consegui ler o numero. Ex.: 1234,56" };
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) {
    return { ok: false, error: "Informe um numero valido e nao negativo." };
  }
  return { ok: true, value };
}

function parsePercentageBr(input: string): FlowParserResult {
  const parsed = parseNumberBr(input.replace("%", ""));
  if (!parsed.ok) return parsed;
  const value = Number(parsed.value);
  if (value > 100) {
    return { ok: false, error: "Percentual invalido. Informe um valor entre 0 e 100." };
  }
  return { ok: true, value };
}

function parseOperationType(input: string): FlowParserResult {
  const normalized = normalizeForComparison(input);
  for (const candidate of OPERATION_ALIASES) {
    if (candidate.aliases.some((regex) => regex.test(normalized))) {
      return { ok: true, value: candidate.value };
    }
  }
  return { ok: false, error: "Responda com: urbano, rodoviario ou misto." };
}

function parseShift(input: string): FlowParserResult {
  const normalized = normalizeForComparison(input);
  for (const candidate of SHIFT_ALIASES) {
    if (candidate.aliases.some((regex) => regex.test(normalized))) {
      return { ok: true, value: candidate.value };
    }
  }
  return { ok: false, error: "Responda com: 12x36 ou 8h." };
}

function parseMonthRef(input: string): FlowParserResult {
  const normalized = normalizeForComparison(input);
  if (/^(sim|ok|certo|confirmo|manter)$/.test(normalized)) {
    return { ok: true, value: "use_suggested" };
  }

  const mmYyyy = normalized.match(/^(\d{1,2})[/-](\d{4})$/);
  if (mmYyyy) {
    const month = Number(mmYyyy[1]);
    const year = Number(mmYyyy[2]);
    if (month >= 1 && month <= 12) {
      return {
        ok: true,
        value: `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-01`,
      };
    }
  }

  const yyyyMm = normalized.match(/^(\d{4})[/-](\d{1,2})$/);
  if (yyyyMm) {
    const year = Number(yyyyMm[1]);
    const month = Number(yyyyMm[2]);
    if (month >= 1 && month <= 12) {
      return {
        ok: true,
        value: `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-01`,
      };
    }
  }

  return { ok: false, error: "Envie no formato MM/AAAA (ex.: 01/2026) ou responda 'sim'." };
}

function parseMultiSelect(
  input: string,
  options: string[],
  minSelections?: number,
  maxSelections?: number,
): FlowParserResult {
  const normalized = normalizeFlowText(input);
  if (!normalized) return { ok: false, error: "Informe ao menos uma opcao." };
  const rawItems = normalized
    .split(/[;,]/)
    .map((item) => normalizeForComparison(item))
    .filter(Boolean);

  const acceptedMap = new Map(options.map((item) => [normalizeForComparison(item), normalizeForComparison(item)]));
  const items = rawItems.filter((item) => acceptedMap.has(item));

  if (items.length === 0) {
    return { ok: false, error: `Opcoes validas: ${options.join(", ")}.` };
  }

  const uniqueItems = Array.from(new Set(items));
  if (typeof minSelections === "number" && uniqueItems.length < minSelections) {
    return { ok: false, error: `Selecione pelo menos ${minSelections} opcao(oes).` };
  }
  if (typeof maxSelections === "number" && uniqueItems.length > maxSelections) {
    return { ok: false, error: `Selecione no maximo ${maxSelections} opcao(oes).` };
  }

  return { ok: true, value: uniqueItems };
}

function parseYesNo(input: string): FlowParserResult {
  const normalized = normalizeForComparison(input);
  if (["sim", "s", "yes", "y"].includes(normalized)) return { ok: true, value: true };
  if (["nao", "n", "no"].includes(normalized)) return { ok: true, value: false };
  return { ok: false, error: "Responda com sim ou nao." };
}
