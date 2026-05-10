import { FirebaseError } from "firebase/app";
import { AppError, type AppErrorOptions } from "@/lib/errors/app-error";
import { ERROR_CODES, type ErrorCode } from "@/lib/errors/error-codes";

/**
 * Domain hint passed by callers to disambiguate generic Firestore errors
 * (e.g. "permission-denied" means GRP_FORBIDDEN inside a group flow but
 * EXP_FORBIDDEN inside an expense flow).
 */
export type ErrorDomain =
  | "auth"
  | "group"
  | "expense"
  | "settlement"
  | "invitation"
  | "user"
  | "generic";

const FIREBASE_AUTH_MAP: Record<string, ErrorCode> = {
  "auth/popup-blocked": ERROR_CODES.AUTH_POPUP_BLOCKED,
  "auth/popup-closed-by-user": ERROR_CODES.AUTH_POPUP_CLOSED,
  "auth/cancelled-popup-request": ERROR_CODES.AUTH_POPUP_CLOSED,
  "auth/user-cancelled": ERROR_CODES.AUTH_POPUP_CLOSED,
  "auth/unauthorized-domain": ERROR_CODES.AUTH_UNAUTHORIZED_DOMAIN,
  "auth/network-request-failed": ERROR_CODES.AUTH_NETWORK,
  "auth/too-many-requests": ERROR_CODES.AUTH_TOO_MANY_REQUESTS,
  "auth/user-disabled": ERROR_CODES.AUTH_UNAUTHORIZED_DOMAIN,
  "auth/operation-not-allowed": ERROR_CODES.AUTH_UNAUTHORIZED_DOMAIN,
  "auth/internal-error": ERROR_CODES.AUTH_UNKNOWN,
};

const FORBIDDEN_BY_DOMAIN: Record<ErrorDomain, ErrorCode> = {
  auth: ERROR_CODES.AUTH_NOT_SIGNED_IN,
  group: ERROR_CODES.GRP_FORBIDDEN,
  expense: ERROR_CODES.EXP_FORBIDDEN,
  settlement: ERROR_CODES.STL_FORBIDDEN,
  invitation: ERROR_CODES.INV_FORBIDDEN,
  user: ERROR_CODES.AUTH_NOT_SIGNED_IN,
  generic: ERROR_CODES.APP_UNKNOWN,
};

const NOT_FOUND_BY_DOMAIN: Record<ErrorDomain, ErrorCode> = {
  auth: ERROR_CODES.AUTH_UNKNOWN,
  group: ERROR_CODES.GRP_NOT_FOUND,
  expense: ERROR_CODES.EXP_NOT_FOUND,
  settlement: ERROR_CODES.STL_SAVE_FAILED,
  invitation: ERROR_CODES.INV_NOT_FOUND,
  user: ERROR_CODES.USR_PROFILE_SYNC_FAILED,
  generic: ERROR_CODES.APP_UNKNOWN,
};

const SAVE_FAILED_BY_DOMAIN: Record<ErrorDomain, ErrorCode> = {
  auth: ERROR_CODES.AUTH_UNKNOWN,
  group: ERROR_CODES.GRP_DELETE_FAILED,
  expense: ERROR_CODES.EXP_SAVE_FAILED,
  settlement: ERROR_CODES.STL_SAVE_FAILED,
  invitation: ERROR_CODES.INV_SAVE_FAILED,
  user: ERROR_CODES.USR_PROFILE_SYNC_FAILED,
  generic: ERROR_CODES.APP_UNKNOWN,
};

/**
 * Converts any thrown value into a typed AppError that's safe to surface
 * to the user. Strips raw Firebase / SDK messages.
 */
export function toAppError(
  cause: unknown,
  domain: ErrorDomain = "generic",
  options: AppErrorOptions = {}
): AppError {
  // Already mapped — pass through.
  if (cause instanceof AppError) return cause;

  // Browser-level offline detection.
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return new AppError(ERROR_CODES.NET_OFFLINE, { ...options, cause });
  }

  if (cause instanceof FirebaseError) {
    const code = mapFirebaseError(cause, domain);
    return new AppError(code, { ...options, cause });
  }

  // Plain Error or unknown: expose generic + remember cause for logs.
  return new AppError(SAVE_FAILED_BY_DOMAIN[domain], { ...options, cause });
}

function mapFirebaseError(err: FirebaseError, domain: ErrorDomain): ErrorCode {
  const raw = err.code || "";

  if (raw.startsWith("auth/")) {
    return FIREBASE_AUTH_MAP[raw] ?? ERROR_CODES.AUTH_UNKNOWN;
  }

  // Firestore + Functions share these codes.
  switch (raw) {
    case "permission-denied":
    case "unauthenticated":
      return raw === "unauthenticated"
        ? ERROR_CODES.AUTH_NOT_SIGNED_IN
        : FORBIDDEN_BY_DOMAIN[domain];
    case "not-found":
      return NOT_FOUND_BY_DOMAIN[domain];
    case "already-exists":
      return ERROR_CODES.INV_ALREADY_ACCEPTED;
    case "deadline-exceeded":
      return ERROR_CODES.NET_TIMEOUT;
    case "unavailable":
      return ERROR_CODES.NET_UNAVAILABLE;
    case "resource-exhausted":
      return ERROR_CODES.AUTH_TOO_MANY_REQUESTS;
    case "failed-precondition":
    case "invalid-argument":
    case "out-of-range":
      return SAVE_FAILED_BY_DOMAIN[domain];
    case "cancelled":
      return ERROR_CODES.NET_TIMEOUT;
    case "aborted":
      return SAVE_FAILED_BY_DOMAIN[domain];
    case "internal":
    case "data-loss":
    case "unknown":
    default:
      return SAVE_FAILED_BY_DOMAIN[domain];
  }
}
