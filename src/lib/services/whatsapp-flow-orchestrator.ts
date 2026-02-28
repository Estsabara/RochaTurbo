import { getServerEnv } from "@/lib/env";
import { ONBOARDING_FLOW_DEFINITION, getOnboardingCoreKeys } from "@/lib/flows/onboarding-definition";
import { detectMenuSelection, detectModuleByText, getMainMenuText, MODULE_FLOW_DEFINITIONS } from "@/lib/flows/module-definitions";
import { parseByKind, parseFlowCommand } from "@/lib/flows/parsers";
import type { FlowDefinition, FlowQuestionDefinition } from "@/lib/flows/types";
import { inferIntent } from "@/lib/services/intent";
import { computeAndUpsertMonthlyKpis, getLatestMonthlyInputBefore, getMonthlyInput, getRecentMonthlyKpis, upsertMonthlyInput } from "@/lib/services/monthly";
import { generateMonthlyDiagnosisReport } from "@/lib/services/monthly-report";
import { createChatFlow, getActiveChatFlow, type ChatFlowRow, updateChatFlow } from "@/lib/services/chat-flows";
import { generateModuleArtifact, getGeneratedFileSignedUrl } from "@/lib/services/modules";
import { monthlyInputSchema } from "@/lib/validation/monthly-input";

interface ProcessFlowMessageInput {
  userId: string;
  text: string;
  waMessageId: string;
}

interface ProcessFlowMessageResult {
  handled: boolean;
  messages: string[];
  allowRag: boolean;
}

const CORE_QUESTION_KEYS = new Set(getOnboardingCoreKeys());

export async function processWhatsAppFlowMessage(input: ProcessFlowMessageInput): Promise<ProcessFlowMessageResult> {
  const env = getServerEnv();
  if (!env.WHATSAPP_FLOW_V2_ENABLED) {
    return { handled: false, messages: [], allowRag: true };
  }

  const normalizedText = input.text.trim();
  const parsedCommand = parseFlowCommand(normalizedText);
  const activeFlow = await getActiveChatFlow(input.userId);

  if (activeFlow) {
    return handleExistingFlow(activeFlow, normalizedText, parsedCommand.command, input.waMessageId);
  }

  if (parsedCommand.command === "menu") {
    return { handled: true, messages: [getMainMenuText()], allowRag: false };
  }

  const suggestedMonthRef = getSuggestedPreviousMonthRef(env.FLOW_TIMEZONE);
  const hasCoreInSuggestedMonth = await hasCoreCompletedForMonth(input.userId, suggestedMonthRef);
  const menuSelection = detectMenuSelection(normalizedText);
  const moduleByText = detectModuleByText(normalizedText);
  const monthlyIntent = inferIntent(normalizedText) === "monthly_data_collection";
  const shouldStartOnboarding =
    !hasCoreInSuggestedMonth && env.FORCE_EXISTING_USERS || monthlyIntent || menuSelection === "onboarding";

  if (shouldStartOnboarding) {
    const onboarding = await startOnboardingFlow(input.userId, suggestedMonthRef);
    return { handled: true, messages: [buildQuestionPrompt(onboarding.definition, onboarding.flow)], allowRag: false };
  }

  const moduleSelection = menuSelection && menuSelection !== "rag" ? menuSelection : null;
  if (moduleSelection || moduleByText) {
    if (!hasCoreInSuggestedMonth) {
      const onboarding = await startOnboardingFlow(input.userId, suggestedMonthRef);
      return {
        handled: true,
        messages: [
          "Antes de abrir os modulos, preciso finalizar o nucleo do diagnostico mensal.",
          buildQuestionPrompt(onboarding.definition, onboarding.flow),
        ],
        allowRag: false,
      };
    }

    const wizard = moduleSelection ?? moduleByText;
    if (wizard) {
      const flow = await createChatFlow({
        userId: input.userId,
        flowType: "module",
        stepKey: MODULE_FLOW_DEFINITIONS[wizard].initialStep,
        monthRef: suggestedMonthRef,
        answers: {},
        context: {
          module_wizard: wizard,
          month_ref: suggestedMonthRef,
          created_from: moduleSelection ? "menu" : "text",
        },
      });
      return {
        handled: true,
        messages: [
          `Perfeito. Vamos montar o modulo ${MODULE_FLOW_DEFINITIONS[wizard].menuLabel}.`,
          buildQuestionPrompt(MODULE_FLOW_DEFINITIONS[wizard], flow),
        ],
        allowRag: false,
      };
    }
  }

  return { handled: false, messages: [], allowRag: true };
}

async function startOnboardingFlow(userId: string, suggestedMonthRef: string) {
  const current = await getMonthlyInput(userId, suggestedMonthRef);
  const previous = await getLatestMonthlyInputBefore(userId, suggestedMonthRef);
  const prefillInput = sanitizeInputData((current?.input_json as Record<string, unknown>) ?? (previous?.input_json as Record<string, unknown>) ?? {});
  const flow = await createChatFlow({
    userId,
    flowType: "onboarding",
    stepKey: ONBOARDING_FLOW_DEFINITION.initialStep,
    monthRef: suggestedMonthRef,
    answers: current?.input_json && typeof current.input_json === "object" ? (current.input_json as Record<string, unknown>) : {},
    context: {
      suggested_month_ref: suggestedMonthRef,
      month_ref: suggestedMonthRef,
      prefill_input: prefillInput,
      prefill_month_ref: current?.month_ref ?? previous?.month_ref ?? null,
    },
  });
  return { flow, definition: ONBOARDING_FLOW_DEFINITION };
}

async function handleExistingFlow(
  flow: ChatFlowRow,
  text: string,
  command: ReturnType<typeof parseFlowCommand>["command"],
  waMessageId: string,
): Promise<ProcessFlowMessageResult> {
  const definition = getDefinitionForFlow(flow);
  if (!definition) {
    await updateChatFlow(flow.id, {
      status: "canceled",
      canceledAt: new Date().toISOString(),
      context: { ...(flow.context_json ?? {}), canceled_reason: "definition_not_found" },
    });
    return {
      handled: true,
      messages: ["Nao consegui continuar o fluxo atual. Digite 'menu' para reiniciar."],
      allowRag: false,
    };
  }

  const answers = asObject(flow.answers_json);
  const context = asObject(flow.context_json);
  const question = getQuestionByKey(definition, flow.step_key);
  if (!question) {
    return completeFlow(flow, definition, answers, context);
  }

  if (command) {
    const handledCommand = await handleFlowCommand(flow, definition, question, command, answers, context, waMessageId);
    if (handledCommand) return handledCommand;
  }

  const parsed = parseByKind(text, question.parser, question.options ?? []);
  if (!parsed.ok) {
    if (definition.type === "onboarding" && !isCoreCompleted(answers) && seemsDiversion(text)) {
      const pending = pendingCoreQuestions(answers);
      return {
        handled: true,
        allowRag: false,
        messages: [
          `Antes de seguir para outros assuntos, preciso concluir o nucleo do diagnostico. Pendencias: ${pending.join(", ")}.`,
          buildQuestionPrompt(definition, flow),
        ],
      };
    }
    return {
      handled: true,
      allowRag: false,
      messages: [`Nao entendi sua resposta: ${parsed.error}`, buildQuestionPrompt(definition, flow)],
    };
  }

  const nextAnswers = { ...answers };
  const nextContext = { ...context };
  const resolvedValue =
    definition.type === "onboarding" && question.key === "month_ref"
      ? resolveMonthRefValue(parsed.value, nextContext)
      : parsed.value;
  setPath(nextAnswers, question.fieldPath, resolvedValue);

  if (definition.type === "onboarding" && question.key === "month_ref") {
    nextContext.month_ref = resolvedValue;
  }

  const nextQuestion = getNextQuestion(definition, answers, question.key, nextAnswers);

  await updateChatFlow(flow.id, {
    answers: nextAnswers,
    context: nextContext,
    ...(nextContext.month_ref || flow.month_ref
      ? { monthRef: String(nextContext.month_ref ?? flow.month_ref ?? "") }
      : {}),
    lastWaMessageId: waMessageId,
    ...(nextQuestion ? { stepKey: nextQuestion.key } : {}),
  });

  if (definition.type === "onboarding") {
    const monthRef = String(nextContext.month_ref ?? flow.month_ref ?? "");
    if (monthRef) {
      const monthlyInput = sanitizeInputData(nextAnswers);
      await upsertMonthlyInput(flow.user_id, monthRef, monthlyInput, "chat", false);
    }
  }

  if (nextQuestion) {
    const refreshedFlow = {
      ...flow,
      answers_json: nextAnswers,
      context_json: nextContext,
      step_key: nextQuestion.key,
      month_ref: String(nextContext.month_ref ?? flow.month_ref ?? ""),
    };
    return {
      handled: true,
      allowRag: false,
      messages: [buildQuestionPrompt(definition, refreshedFlow)],
    };
  }

  return completeFlow(flow, definition, nextAnswers, nextContext);
}

async function handleFlowCommand(
  flow: ChatFlowRow,
  definition: FlowDefinition,
  question: FlowQuestionDefinition,
  command: ReturnType<typeof parseFlowCommand>["command"],
  answers: Record<string, unknown>,
  context: Record<string, unknown>,
  waMessageId: string,
): Promise<ProcessFlowMessageResult | null> {
  if (!command) return null;

  if (command === "menu") {
    return { handled: true, allowRag: false, messages: [getMainMenuText(), buildQuestionPrompt(definition, flow)] };
  }

  if (command === "status") {
    return {
      handled: true,
      allowRag: false,
      messages: [buildStatusMessage(definition, answers), buildQuestionPrompt(definition, flow)],
    };
  }

  if (command === "voltar") {
    const previous = getPreviousQuestion(definition, answers, question.key);
    if (!previous) {
      return {
        handled: true,
        allowRag: false,
        messages: ["Esse ja e o primeiro passo do fluxo.", buildQuestionPrompt(definition, flow)],
      };
    }
    await updateChatFlow(flow.id, { stepKey: previous.key, lastWaMessageId: waMessageId });
    const nextFlow = { ...flow, step_key: previous.key };
    return { handled: true, allowRag: false, messages: [buildQuestionPrompt(definition, nextFlow)] };
  }

  if (command === "pular") {
    if (question.required || !question.allowSkip) {
      return {
        handled: true,
        allowRag: false,
        messages: ["Essa pergunta e obrigatoria. Se quiser, responda com um valor aproximado.", buildQuestionPrompt(definition, flow)],
      };
    }
    const nextAnswers = { ...answers };
    setPath(nextAnswers, question.fieldPath, null);
    const nextQuestion = getNextQuestion(definition, answers, question.key, nextAnswers);
    await updateChatFlow(flow.id, {
      answers: nextAnswers,
      stepKey: nextQuestion?.key ?? question.key,
      lastWaMessageId: waMessageId,
    });
    if (!nextQuestion) {
      return completeFlow(flow, definition, nextAnswers, context);
    }
    const nextFlow = { ...flow, step_key: nextQuestion.key, answers_json: nextAnswers };
    return { handled: true, allowRag: false, messages: [buildQuestionPrompt(definition, nextFlow)] };
  }

  if (command === "manter") {
    const prefill = asObject(context.prefill_input);
    const keepValue = getPath(prefill, question.fieldPath);
    if (keepValue === undefined) {
      return {
        handled: true,
        allowRag: false,
        messages: ["Nao encontrei valor anterior para manter nessa pergunta.", buildQuestionPrompt(definition, flow)],
      };
    }

    const nextAnswers = { ...answers };
    setPath(nextAnswers, question.fieldPath, keepValue);
    const nextQuestion = getNextQuestion(definition, answers, question.key, nextAnswers);
    await updateChatFlow(flow.id, {
      answers: nextAnswers,
      stepKey: nextQuestion?.key ?? question.key,
      lastWaMessageId: waMessageId,
    });
    if (!nextQuestion) {
      return completeFlow(flow, definition, nextAnswers, context);
    }
    const nextFlow = { ...flow, step_key: nextQuestion.key, answers_json: nextAnswers };
    return { handled: true, allowRag: false, messages: [buildQuestionPrompt(definition, nextFlow)] };
  }

  if (command === "encerrar") {
    if (definition.type === "onboarding" && !isCoreCompleted(answers)) {
      const pending = pendingCoreQuestions(answers);
      return {
        handled: true,
        allowRag: false,
        messages: [
          `Ainda faltam itens obrigatorios do nucleo: ${pending.join(", ")}.`,
          buildQuestionPrompt(definition, flow),
        ],
      };
    }
    return completeFlow(flow, definition, answers, context);
  }

  return null;
}

async function completeFlow(
  flow: ChatFlowRow,
  definition: FlowDefinition,
  answers: Record<string, unknown>,
  context: Record<string, unknown>,
): Promise<ProcessFlowMessageResult> {
  if (definition.type === "onboarding") {
    const monthRef = String(context.month_ref ?? flow.month_ref ?? context.suggested_month_ref ?? "");
    if (!monthRef) {
      return {
        handled: true,
        allowRag: false,
        messages: ["Nao consegui identificar o mes de referencia. Digite 'menu' e escolha Diagnostico mensal."],
      };
    }

    const sanitized = sanitizeInputData(answers);
    await upsertMonthlyInput(flow.user_id, monthRef, sanitized, "chat", true);
    const computed = await computeAndUpsertMonthlyKpis(flow.user_id, monthRef, sanitized);
    const comparisonRows = await getRecentMonthlyKpis(flow.user_id, 3);
    const report = await generateMonthlyDiagnosisReport({
      userId: flow.user_id,
      monthRef,
      calculated: computed.calculated,
      comparisonRows: comparisonRows as Array<Record<string, unknown>>,
    });

    await updateChatFlow(flow.id, {
      status: "completed",
      completedAt: new Date().toISOString(),
      answers,
      context: {
        ...context,
        completed_reason: "onboarding_finished",
        report_file_id: report.fileId,
      },
      lastWaMessageId: flow.last_wa_message_id,
    });

    const resumeMessages = report.summaryBlocks.slice(0, 3);
    return {
      handled: true,
      allowRag: false,
      messages: [
        `Diagnostico inicial do mes ${formatMonthRef(monthRef)} concluido.`,
        ...resumeMessages,
        `Relatorio completo (PDF): ${report.signedUrl}`,
        getMainMenuText(),
      ],
    };
  }

  const wizard = String(context.module_wizard ?? "");
  const moduleDef = wizard && wizard in MODULE_FLOW_DEFINITIONS ? MODULE_FLOW_DEFINITIONS[wizard as keyof typeof MODULE_FLOW_DEFINITIONS] : null;
  if (!moduleDef) {
    await updateChatFlow(flow.id, {
      status: "canceled",
      canceledAt: new Date().toISOString(),
      context: { ...context, canceled_reason: "module_definition_missing" },
    });
    return { handled: true, allowRag: false, messages: ["Modulo encerrado por falha de configuracao. Digite 'menu'."] };
  }

  const monthRef = String(context.month_ref ?? flow.month_ref ?? getSuggestedPreviousMonthRef(getServerEnv().FLOW_TIMEZONE));
  const monthlyInput = await getMonthlyInput(flow.user_id, monthRef);
  const monthlySnapshot = await getRecentMonthlyKpis(flow.user_id, 1);

  const artifact = await generateModuleArtifact({
    userId: flow.user_id,
    module: moduleDef.module,
    requestedBy: "whatsapp:user",
    input: {
      source: "whatsapp_flow_v2",
      wizard,
      month_ref: monthRef,
      answers,
      monthly_input: monthlyInput?.input_json ?? null,
      monthly_kpis: monthlySnapshot?.[0]?.kpis_json ?? null,
    },
  });

  const fileId = String(artifact.file.id ?? "");
  const signedUrl = fileId ? await getGeneratedFileSignedUrl(fileId) : null;

  await updateChatFlow(flow.id, {
    status: "completed",
    completedAt: new Date().toISOString(),
    context: {
      ...context,
      completed_reason: "module_generated",
      generated_file_id: fileId || null,
    },
    answers,
  });

  return {
    handled: true,
    allowRag: false,
    messages: [
      `Modulo ${moduleDef.menuLabel} concluido.`,
      signedUrl ? `Arquivo: ${signedUrl}` : "Arquivo disponivel no CRM.",
      getMainMenuText(),
    ],
  };
}

function getDefinitionForFlow(flow: ChatFlowRow): FlowDefinition | null {
  if (flow.flow_type === "onboarding") {
    return ONBOARDING_FLOW_DEFINITION;
  }
  if (flow.flow_type === "module") {
    const wizard = String(flow.context_json?.module_wizard ?? "");
    return wizard && wizard in MODULE_FLOW_DEFINITIONS
      ? MODULE_FLOW_DEFINITIONS[wizard as keyof typeof MODULE_FLOW_DEFINITIONS]
      : null;
  }
  return null;
}

function getQuestionByKey(definition: FlowDefinition, key: string): FlowQuestionDefinition | null {
  return definition.questions.find((question) => question.key === key) ?? null;
}

function getVisibleQuestions(definition: FlowDefinition, answers: Record<string, unknown>) {
  return definition.questions.filter((question) => (question.when ? question.when(answers) : true));
}

function getNextQuestion(
  definition: FlowDefinition,
  currentAnswers: Record<string, unknown>,
  currentKey: string,
  nextAnswers: Record<string, unknown>,
): FlowQuestionDefinition | null {
  const visible = getVisibleQuestions(definition, nextAnswers);
  const currentIndex = visible.findIndex((question) => question.key === currentKey);
  if (currentIndex === -1) return visible[0] ?? null;
  return visible[currentIndex + 1] ?? null;
}

function getPreviousQuestion(
  definition: FlowDefinition,
  answers: Record<string, unknown>,
  currentKey: string,
): FlowQuestionDefinition | null {
  const visible = getVisibleQuestions(definition, answers);
  const currentIndex = visible.findIndex((question) => question.key === currentKey);
  if (currentIndex <= 0) return null;
  return visible[currentIndex - 1] ?? null;
}

function buildQuestionPrompt(definition: FlowDefinition, flow: ChatFlowRow): string {
  const question = getQuestionByKey(definition, flow.step_key);
  if (!question) return "Fluxo concluido.";
  const context = asObject(flow.context_json);
  const basePrompt = typeof question.prompt === "function"
    ? question.prompt({
        suggestedMonthRef: String(context.suggested_month_ref ?? ""),
        monthRef: String(context.month_ref ?? flow.month_ref ?? ""),
      })
    : question.prompt;

  const helpers: string[] = [];
  if (!question.required && question.allowSkip) {
    helpers.push("Digite 'pular' se nao se aplica.");
  }
  if (question.allowKeep) {
    helpers.push("Digite 'manter' para usar valor do mes anterior.");
  }
  helpers.push("Digite 'status' para ver progresso.");
  return helpers.length > 0 ? `${basePrompt}\n${helpers.join(" ")}` : basePrompt;
}

function buildStatusMessage(definition: FlowDefinition, answers: Record<string, unknown>): string {
  const visible = getVisibleQuestions(definition, answers);
  const answered = visible.filter((question) => getPath(answers, question.fieldPath) !== undefined).length;
  if (definition.type === "onboarding") {
    const pendingCore = pendingCoreQuestions(answers);
    return [
      `Progresso: ${answered}/${visible.length} perguntas respondidas.`,
      pendingCore.length > 0
        ? `Pendencias do nucleo obrigatorio: ${pendingCore.join(", ")}.`
        : "Nucleo obrigatorio concluido.",
    ].join("\n");
  }
  return `Progresso do modulo: ${answered}/${visible.length} perguntas respondidas.`;
}

function pendingCoreQuestions(answers: Record<string, unknown>): string[] {
  return ONBOARDING_FLOW_DEFINITION.questions
    .filter((question) => CORE_QUESTION_KEYS.has(question.key))
    .filter((question) => isMissingRequiredValue(getPath(answers, question.fieldPath)))
    .map((question) => question.key);
}

function isCoreCompleted(answers: Record<string, unknown>): boolean {
  return pendingCoreQuestions(answers).length === 0;
}

function isMissingRequiredValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  return false;
}

async function hasCoreCompletedForMonth(userId: string, monthRef: string): Promise<boolean> {
  const currentInput = await getMonthlyInput(userId, monthRef);
  if (!currentInput?.input_json || typeof currentInput.input_json !== "object") {
    return false;
  }
  const answers = currentInput.input_json as Record<string, unknown>;
  return isCoreCompleted(answers);
}

function sanitizeInputData(answers: Record<string, unknown>) {
  const candidate = { ...answers };
  delete candidate._meta;
  const parsed = monthlyInputSchema.partial().safeParse(candidate);
  return parsed.success ? parsed.data : {};
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
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

function setPath(target: Record<string, unknown>, path: string, value: unknown) {
  const segments = path.split(".");
  let cursor: Record<string, unknown> = target;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    const current = cursor[segment];
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      cursor[segment] = {};
    }
    cursor = cursor[segment] as Record<string, unknown>;
  }
  cursor[segments[segments.length - 1]] = value;
}

function resolveMonthRefValue(parsedValue: unknown, context: Record<string, unknown>): string {
  if (parsedValue === "use_suggested") {
    return String(context.suggested_month_ref ?? "");
  }
  return String(parsedValue ?? "");
}

function getSuggestedPreviousMonthRef(timeZone: string): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((item) => item.type === "year")?.value ?? now.getUTCFullYear());
  const month = Number(parts.find((item) => item.type === "month")?.value ?? now.getUTCMonth() + 1);

  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  return `${String(prevYear).padStart(4, "0")}-${String(prevMonth).padStart(2, "0")}-01`;
}

function formatMonthRef(monthRef: string): string {
  const [year, month] = monthRef.split("-");
  return year && month ? `${month}/${year}` : monthRef;
}

function seemsDiversion(text: string): boolean {
  if (detectMenuSelection(text)) return true;
  if (detectModuleByText(text)) return true;
  const lowered = text.toLowerCase();
  return /menu|kpi|promoc|marketing|swot|checklist|padr[aã]o|dashboard|indicador/.test(lowered);
}
