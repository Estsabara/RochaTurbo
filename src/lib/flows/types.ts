import type { FlowType, QuestionKey } from "@/lib/types/domain";

export type FlowParserKind =
  | "text"
  | "number_br"
  | "percentage_br"
  | "operation_type"
  | "shift"
  | "month_ref"
  | "multi_select"
  | "yes_no";

export interface FlowParserResult {
  ok: boolean;
  value?: unknown;
  error?: string;
}

export interface FlowQuestionContext {
  suggestedMonthRef?: string;
  monthRef?: string;
}

export interface FlowQuestionDefinition {
  key: QuestionKey;
  fieldPath: string;
  prompt: string | ((context: FlowQuestionContext) => string);
  required?: boolean;
  coreRequired?: boolean;
  allowSkip?: boolean;
  allowKeep?: boolean;
  parser: FlowParserKind;
  options?: string[];
  when?: (answers: Record<string, unknown>) => boolean;
}

export interface FlowDefinition {
  type: FlowType;
  initialStep: QuestionKey;
  questions: FlowQuestionDefinition[];
}

export interface FlowCommandParseResult {
  command: "menu" | "status" | "voltar" | "pular" | "manter" | "encerrar" | null;
}

