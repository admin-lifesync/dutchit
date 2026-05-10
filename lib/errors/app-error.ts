import { ERROR_CODES, type ErrorCode } from "@/lib/errors/error-codes";
import { messageFor, type UserMessage } from "@/lib/errors/user-messages";

export interface AppErrorOptions {
  /** Optional override for the user-facing title. */
  title?: string;
  /** Optional override for the user-facing description. */
  description?: string;
  /** Whether this error should be retryable in UI surfaces that support it. */
  retryable?: boolean;
  /** Original error for debugging — never shown to the user. */
  cause?: unknown;
  /** Free-form context for logs (e.g. { groupId, expenseId }). */
  context?: Record<string, unknown>;
}

/**
 * The single error type we throw inside the app.
 *
 * Only AppError instances should reach UI layers. Anything else (raw Error,
 * FirebaseError, string) must be funneled through `toAppError()` first so the
 * user never sees raw technical messages.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly userMessage: UserMessage;
  readonly retryable: boolean;
  readonly context: Record<string, unknown>;

  constructor(code: ErrorCode, options: AppErrorOptions = {}) {
    const fallback = messageFor(code);
    const userMessage: UserMessage = {
      title: options.title ?? fallback.title,
      description: options.description ?? fallback.description,
    };
    super(`[${code}] ${userMessage.title}`);
    this.name = "AppError";
    this.code = code;
    this.userMessage = userMessage;
    this.retryable = options.retryable ?? defaultRetryable(code);
    this.context = options.context ?? {};
    if (options.cause !== undefined) {
      // Preserve the cause without leaking it to the user-facing message.
      (this as { cause?: unknown }).cause = options.cause;
    }
  }

  /** Plain-object form for safe logging / serialization. */
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      title: this.userMessage.title,
      description: this.userMessage.description,
      retryable: this.retryable,
      context: this.context,
    };
  }
}

function defaultRetryable(code: ErrorCode): boolean {
  switch (code) {
    case ERROR_CODES.NET_OFFLINE:
    case ERROR_CODES.NET_TIMEOUT:
    case ERROR_CODES.NET_UNAVAILABLE:
    case ERROR_CODES.AUTH_NETWORK:
    case ERROR_CODES.AUTH_UNKNOWN:
    case ERROR_CODES.GRP_DELETE_FAILED:
    case ERROR_CODES.EXP_SAVE_FAILED:
    case ERROR_CODES.STL_SAVE_FAILED:
    case ERROR_CODES.INV_SAVE_FAILED:
    case ERROR_CODES.USR_PROFILE_SYNC_FAILED:
      return true;
    default:
      return false;
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
