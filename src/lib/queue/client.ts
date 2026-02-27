import { getServerEnv } from "@/lib/env";

export interface RedisConnectionOptions {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
  tls?: Record<string, never>;
  maxRetriesPerRequest: null;
  enableReadyCheck: false;
}

let cachedConnectionOptions: RedisConnectionOptions | null | undefined;

export function getRedisConnection(): RedisConnectionOptions | null {
  if (cachedConnectionOptions !== undefined) {
    return cachedConnectionOptions;
  }

  const env = getServerEnv();
  if (!env.REDIS_URL) {
    cachedConnectionOptions = null;
    return cachedConnectionOptions;
  }

  const parsed = new URL(env.REDIS_URL);
  const options: RedisConnectionOptions = {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };

  if (parsed.username) options.username = decodeURIComponent(parsed.username);
  if (parsed.password) options.password = decodeURIComponent(parsed.password);

  const dbRaw = parsed.pathname.replace("/", "").trim();
  if (dbRaw) {
    const db = Number(dbRaw);
    if (Number.isFinite(db)) {
      options.db = db;
    }
  }

  if (parsed.protocol === "rediss:") {
    options.tls = {};
  }

  cachedConnectionOptions = options;
  return cachedConnectionOptions;
}

export function hasRedisConfigured(): boolean {
  return Boolean(getServerEnv().REDIS_URL);
}
