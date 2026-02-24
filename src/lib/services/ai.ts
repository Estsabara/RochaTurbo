import OpenAI from "openai";
import { getServerEnv } from "@/lib/env";

let client: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (client) return client;
  const env = getServerEnv();
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return client;
}

export async function createEmbedding(input: string): Promise<number[]> {
  const openai = getOpenAIClient();
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input,
  });
  return response.data[0].embedding;
}

interface GenerateRagAnswerInput {
  userQuestion: string;
  contextChunks: Array<{
    chunkText: string;
    sourceLabel: string;
    sectionHint?: string | null;
  }>;
  conversationHistory?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
}

export async function generateRagAnswer(input: GenerateRagAnswerInput): Promise<string> {
  const openai = getOpenAIClient();

  const context = input.contextChunks
    .map(
      (chunk, index) =>
        `[fonte_${index + 1}] ${chunk.sourceLabel}${
          chunk.sectionHint ? ` (${chunk.sectionHint})` : ""
        }\n${chunk.chunkText}`,
    )
    .join("\n\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content:
          "Voce e a R.Ai. Responda em portugues-BR, de forma objetiva, profissional e etica. " +
          "Use o contexto fornecido e cite as fontes como [fonte_n]. " +
          "Se nao houver base suficiente, diga claramente que faltam dados e nao invente informacoes.",
      },
      ...(input.conversationHistory ?? []).map((message) => ({
        role: message.role,
        content: message.content,
      })),
      {
        role: "user",
        content: `Pergunta:\n${input.userQuestion}\n\nContexto:\n${context}`,
      },
    ],
    temperature: 0.2,
  });

  return (
    completion.choices[0]?.message?.content?.trim() || "Nao foi possivel gerar uma resposta neste momento."
  );
}

export async function transcribeAudioFile(params: {
  file: File;
  language?: string;
}): Promise<string> {
  const openai = getOpenAIClient();
  const transcription = await openai.audio.transcriptions.create({
    model: "gpt-4o-mini-transcribe",
    file: params.file,
    language: params.language ?? "pt",
  });
  return transcription.text.trim();
}
