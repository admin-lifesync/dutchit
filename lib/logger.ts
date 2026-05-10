/**
 * Tiny structured logger.
 *
 * - In development, logs are colorful and grouped per `scope` for fast scanning.
 * - In production, logs are JSON-serialised so any log aggregator (Vercel Log
 *   Drains, Datadog, Better Stack, etc.) can index them. We never log PII or
 *   raw Firebase error objects — only known fields.
 *
 * This logger is the ONLY place that should ever touch `console.*` in app code.
 */

type Level = "debug" | "info" | "warn" | "error";

const isDev = process.env.NODE_ENV !== "production";

const STYLES: Record<Level, string> = {
  debug: "color:#6b7280;font-weight:600",
  info: "color:#10b981;font-weight:600",
  warn: "color:#f59e0b;font-weight:600",
  error: "color:#ef4444;font-weight:600",
};

interface LogPayload {
  scope: string;
  message: string;
  data?: Record<string, unknown>;
}

function emit(level: Level, payload: LogPayload) {
  const ts = new Date().toISOString();
  if (isDev) {
    const args: unknown[] = [
      `%c[${level.toUpperCase()}]%c ${payload.scope} — ${payload.message}`,
      STYLES[level],
      "color:inherit",
    ];
    if (payload.data && Object.keys(payload.data).length) args.push(payload.data);
    // eslint-disable-next-line no-console
    console[level === "debug" ? "log" : level](...args);
    return;
  }
  // Production: structured single-line JSON.
  // eslint-disable-next-line no-console
  console[level === "debug" ? "log" : level](
    JSON.stringify({ ts, level, ...payload })
  );
}

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

/**
 * Creates a scoped logger. Always prefer `createLogger("auth")` over a
 * generic instance so logs are easy to filter.
 */
export function createLogger(scope: string): Logger {
  return {
    debug: (message, data) => emit("debug", { scope, message, data }),
    info: (message, data) => emit("info", { scope, message, data }),
    warn: (message, data) => emit("warn", { scope, message, data }),
    error: (message, data) => emit("error", { scope, message, data }),
  };
}

export const log = createLogger("app");
