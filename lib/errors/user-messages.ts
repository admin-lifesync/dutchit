import { ERROR_CODES, type ErrorCode } from "@/lib/errors/error-codes";

export interface UserMessage {
  /** Short toast/dialog title. Keep < 40 chars. */
  title: string;
  /** Friendly description sentence. No jargon. */
  description: string;
}

/**
 * Friendly, human messages for every error code.
 *
 * Rules of writing:
 *  - Speak like a helpful concierge, not a server log.
 *  - Never say "Firestore", "Firebase", "permission-denied", "rules", etc.
 *  - Always offer one concrete next step where possible.
 */
export const USER_MESSAGES: Record<ErrorCode, UserMessage> = {
  // -------- Authentication --------
  [ERROR_CODES.AUTH_NOT_SIGNED_IN]: {
    title: "Please sign in to continue",
    description: "Your session has expired. Sign in again to pick up where you left off.",
  },
  [ERROR_CODES.AUTH_POPUP_BLOCKED]: {
    title: "Sign-in popup was blocked",
    description: "Allow popups for this site, then try signing in again.",
  },
  [ERROR_CODES.AUTH_POPUP_CLOSED]: {
    title: "Sign-in cancelled",
    description: "The Google sign-in window was closed before finishing.",
  },
  [ERROR_CODES.AUTH_UNAUTHORIZED_DOMAIN]: {
    title: "This site isn't approved for sign-in yet",
    description: "An admin needs to add this domain to the project's authorized list.",
  },
  [ERROR_CODES.AUTH_NETWORK]: {
    title: "We couldn't reach our sign-in service",
    description: "Check your internet connection and try again in a moment.",
  },
  [ERROR_CODES.AUTH_TOO_MANY_REQUESTS]: {
    title: "Too many sign-in attempts",
    description: "Wait a minute before trying to sign in again.",
  },
  [ERROR_CODES.AUTH_UNKNOWN]: {
    title: "We couldn't sign you in",
    description: "Something went wrong on our end. Please try again in a moment.",
  },

  // -------- Groups --------
  [ERROR_CODES.GRP_NOT_FOUND]: {
    title: "Trip not found",
    description: "This trip may have been deleted or the link might be wrong.",
  },
  [ERROR_CODES.GRP_FORBIDDEN]: {
    title: "You don't have access to this trip",
    description: "Ask a trip admin to invite you again with a fresh link.",
  },
  [ERROR_CODES.GRP_VALIDATION]: {
    title: "Please check the trip details",
    description: "Some required fields look incomplete or invalid.",
  },
  [ERROR_CODES.GRP_DELETE_FAILED]: {
    title: "Couldn't delete this trip",
    description: "Please try again in a moment. Only admins can delete trips.",
  },

  // -------- Expenses --------
  [ERROR_CODES.EXP_VALIDATION]: {
    title: "Please check the expense details",
    description: "Make sure the amount and split values add up correctly.",
  },
  [ERROR_CODES.EXP_FORBIDDEN]: {
    title: "You can't change this expense",
    description: "Only the person who added it or a trip admin can edit or delete it.",
  },
  [ERROR_CODES.EXP_NOT_FOUND]: {
    title: "Expense no longer exists",
    description: "Someone may have just removed it. Refresh to see the latest list.",
  },
  [ERROR_CODES.EXP_SAVE_FAILED]: {
    title: "Couldn't save this expense",
    description: "Please try again in a moment.",
  },

  // -------- Settlements --------
  [ERROR_CODES.STL_VALIDATION]: {
    title: "Please check the settlement amount",
    description: "Enter a valid amount greater than zero.",
  },
  [ERROR_CODES.STL_FORBIDDEN]: {
    title: "You can't record this settlement",
    description: "Only members of this trip can mark settlements as paid.",
  },
  [ERROR_CODES.STL_MINIMIZED_ADMIN_ONLY]: {
    title: "Only group admins can finalize minimized settlements",
    description:
      "Minimized transfers change how debts are grouped across the whole trip. Ask an admin to record them, or use Direct to log a payment along a specific path.",
  },
  [ERROR_CODES.STL_SAVE_FAILED]: {
    title: "Couldn't record this settlement",
    description: "Please try again in a moment.",
  },

  // -------- Invitations --------
  [ERROR_CODES.INV_NOT_FOUND]: {
    title: "Invite not found",
    description: "This invite link looks invalid. Ask the sender for a new one.",
  },
  [ERROR_CODES.INV_REVOKED]: {
    title: "This invite was revoked",
    description: "Ask the trip admin for a fresh invite link.",
  },
  [ERROR_CODES.INV_EXPIRED]: {
    title: "This invite has expired",
    description: "Ask the trip admin to send you a new invite link.",
  },
  [ERROR_CODES.INV_ALREADY_ACCEPTED]: {
    title: "Invite already used",
    description: "You're already a member of this trip — opening it now.",
  },
  [ERROR_CODES.INV_FORBIDDEN]: {
    title: "You can't create invites for this trip",
    description: "Only existing members can invite new people.",
  },
  [ERROR_CODES.INV_SAVE_FAILED]: {
    title: "Couldn't create the invite link",
    description: "Please try again in a moment.",
  },

  // -------- Users --------
  [ERROR_CODES.USR_PROFILE_SYNC_FAILED]: {
    title: "Couldn't sync your profile",
    description: "We'll retry automatically. You can keep using the app in the meantime.",
  },

  // -------- Network --------
  [ERROR_CODES.NET_OFFLINE]: {
    title: "You're offline",
    description: "Reconnect to the internet to keep using Dutch It.",
  },
  [ERROR_CODES.NET_TIMEOUT]: {
    title: "That took too long",
    description: "Check your connection and try again.",
  },
  [ERROR_CODES.NET_UNAVAILABLE]: {
    title: "Service temporarily unavailable",
    description: "We're having trouble reaching our servers. Please try again shortly.",
  },

  // -------- Configuration --------
  [ERROR_CODES.CFG_FIREBASE_MISSING]: {
    title: "App isn't configured yet",
    description: "Missing connection settings. If you're the developer, see the README to set up environment variables.",
  },

  // -------- Generic --------
  [ERROR_CODES.APP_UNKNOWN]: {
    title: "Something went wrong",
    description: "An unexpected issue occurred. Please try again in a moment.",
  },
};

export function messageFor(code: ErrorCode): UserMessage {
  return USER_MESSAGES[code] ?? USER_MESSAGES[ERROR_CODES.APP_UNKNOWN];
}
