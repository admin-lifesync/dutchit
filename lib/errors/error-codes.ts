/**
 * Canonical error codes for the entire app.
 *
 * Naming: ERR-<DOMAIN>-<HTTP-LIKE NUMBER>
 *
 *   AUTH   = authentication / session
 *   GRP    = groups / trips
 *   EXP    = expenses
 *   STL    = settlements
 *   INV    = invitations
 *   USR    = user profiles
 *   ACT    = activity feed
 *   NET    = network / offline
 *   CFG    = misconfiguration (env vars, project setup)
 *   APP    = generic / unknown
 *
 * The HTTP-like number maps roughly to:
 *   400 = bad input
 *   401 = unauthenticated
 *   403 = forbidden / permission denied
 *   404 = not found
 *   409 = conflict (e.g. invite already accepted)
 *   429 = rate-limited
 *   500 = unexpected server / SDK failure
 *   503 = unavailable / offline
 *
 * Add new codes here, then add the matching message in `user-messages.ts`
 * and a section in `ERROR_HANDBOOK.md`.
 */

export const ERROR_CODES = {
  // -------- Authentication --------
  AUTH_NOT_SIGNED_IN: "ERR-AUTH-401",
  AUTH_POPUP_BLOCKED: "ERR-AUTH-409",
  AUTH_POPUP_CLOSED: "ERR-AUTH-499",
  AUTH_UNAUTHORIZED_DOMAIN: "ERR-AUTH-403",
  AUTH_NETWORK: "ERR-AUTH-503",
  AUTH_TOO_MANY_REQUESTS: "ERR-AUTH-429",
  AUTH_UNKNOWN: "ERR-AUTH-500",

  // -------- Groups / trips --------
  GRP_NOT_FOUND: "ERR-GRP-404",
  GRP_FORBIDDEN: "ERR-GRP-403",
  GRP_VALIDATION: "ERR-GRP-400",
  GRP_DELETE_FAILED: "ERR-GRP-500",

  // -------- Expenses --------
  EXP_VALIDATION: "ERR-EXP-400",
  EXP_FORBIDDEN: "ERR-EXP-403",
  EXP_NOT_FOUND: "ERR-EXP-404",
  EXP_SAVE_FAILED: "ERR-EXP-500",

  // -------- Settlements --------
  STL_VALIDATION: "ERR-STL-400",
  STL_FORBIDDEN: "ERR-STL-403",
  STL_SAVE_FAILED: "ERR-STL-500",

  // -------- Invitations --------
  INV_NOT_FOUND: "ERR-INV-404",
  INV_REVOKED: "ERR-INV-410",
  INV_EXPIRED: "ERR-INV-419",
  INV_ALREADY_ACCEPTED: "ERR-INV-409",
  INV_FORBIDDEN: "ERR-INV-403",
  INV_SAVE_FAILED: "ERR-INV-500",

  // -------- Users --------
  USR_PROFILE_SYNC_FAILED: "ERR-USR-500",

  // -------- Network / infra --------
  NET_OFFLINE: "ERR-NET-503",
  NET_TIMEOUT: "ERR-NET-504",
  NET_UNAVAILABLE: "ERR-NET-500",

  // -------- Configuration --------
  CFG_FIREBASE_MISSING: "ERR-CFG-001",

  // -------- Generic --------
  APP_UNKNOWN: "ERR-APP-500",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Stable list of all known codes — used for handbook validation. */
export const ALL_ERROR_CODES: ReadonlyArray<ErrorCode> = Object.freeze(
  Object.values(ERROR_CODES) as ErrorCode[]
);
