import { z } from "zod";
import { loadEnvConfig } from "@next/env";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalSecret = z.preprocess(emptyToUndefined, z.string().min(1).optional());
const toBoolean = (value: unknown) => {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
};

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  OPENAI_API_KEY: optionalSecret,
  OPENAI_PROMPT_ID: optionalSecret,
  WHATSAPP_TOKEN: optionalSecret,
  WHATSAPP_PHONE_NUMBER_ID: optionalSecret,
  WHATSAPP_VERIFY_TOKEN: optionalSecret,
  WHATSAPP_APP_SECRET: optionalSecret,
  ASAAS_API_KEY: optionalSecret,
  ASAAS_API_BASE: z.string().url().default("https://api.asaas.com/v3"),
  ASAAS_WEBHOOK_TOKEN: optionalSecret,
  BILLING_DISABLED: z.preprocess(toBoolean, z.boolean()).default(false),
  REDIS_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  QUEUE_PREFIX: z.string().min(1).default("rocha-turbo"),
  INTERNAL_JOB_SECRET: z.preprocess(emptyToUndefined, z.string().min(16).optional()),
  MODULE_FILES_BUCKET: z.string().min(1).default("generated-files"),
  OTP_SECRET: z.string().min(16).default("change-this-secret"),
  ADMIN_API_TOKEN: z.preprocess(emptyToUndefined, z.string().min(16).optional()),
});

type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedEnv: ServerEnv | null = null;
let envLoaded = false;

function ensureEnvLoaded() {
  if (envLoaded) return;
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
  envLoaded = true;
}

export function getServerEnv(): ServerEnv {
  if (cachedEnv) return cachedEnv;
  ensureEnvLoaded();
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  cachedEnv = parsed.data;
  return cachedEnv;
}

export function tryGetServerEnv(): ServerEnv | null {
  try {
    return getServerEnv();
  } catch {
    return null;
  }
}
