import { AppError, isAppError } from "@/lib/errors/app-error";
import { ERROR_CODES } from "@/lib/errors/error-codes";
import { toAppError, type ErrorDomain } from "@/lib/errors/firebase-error-map";
import { createLogger } from "@/lib/logger";
import { toast } from "@/hooks/use-toast";

const errorLog = createLogger("error");

interface HandleOptions {
  /** Domain hint to translate raw Firebase errors. */
  domain?: ErrorDomain;
  /** Free-form context for logs (groupId, expenseId, etc). */
  context?: Record<string, unknown>;
  /** When true, do NOT show a toast (caller will render their own UI). */
  silent?: boolean;
  /** Override the toast title. Description always falls back to the code's message. */
  toastTitle?: string;
}

/**
 * Single entry point for any caught error in the app.
 *
 * - Translates raw / Firebase errors into a typed AppError.
 * - Logs structured details so developers can debug quickly.
 * - Shows a friendly toast (unless `silent`) with the user-facing message.
 * - Returns the typed AppError so callers can branch on `.code` if they want.
 */
export function handleError(cause: unknown, options: HandleOptions = {}): AppError {
  const appError = isAppError(cause)
    ? cause
    : toAppError(cause, options.domain ?? "generic", { context: options.context });

  errorLog.error(appError.userMessage.title, {
    code: appError.code,
    retryable: appError.retryable,
    context: { ...appError.context, ...options.context },
    cause: serialiseCause((appError as { cause?: unknown }).cause ?? cause),
  });

  if (!options.silent) {
    toast({
      variant: appError.code === ERROR_CODES.NET_OFFLINE ? "default" : "destructive",
      title: options.toastTitle ?? appError.userMessage.title,
      description: `${appError.userMessage.description}\nCode: ${appError.code}`,
    });
  }

  return appError;
}

/** Reduce errors / unknown values to a JSON-safe object for logs. */
function serialiseCause(cause: unknown): Record<string, unknown> | string | null {
  if (cause == null) return null;
  if (typeof cause === "string") return cause;
  if (cause instanceof Error) {
    const out: Record<string, unknown> = {
      name: cause.name,
      message: cause.message,
    };
    const code = (cause as { code?: unknown }).code;
    if (code !== undefined) out.firebaseCode = code;
    return out;
  }
  try {
    return JSON.parse(JSON.stringify(cause));
  } catch {
    return String(cause);
  }
}
