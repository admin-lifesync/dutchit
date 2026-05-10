import { describe, expect, it } from "vitest";
import { FirebaseError } from "firebase/app";
import { AppError, isAppError } from "@/lib/errors/app-error";
import { ERROR_CODES } from "@/lib/errors/error-codes";
import { toAppError } from "@/lib/errors/firebase-error-map";
import { messageFor, USER_MESSAGES } from "@/lib/errors/user-messages";

describe("AppError", () => {
  it("uses the registered user message by default", () => {
    const err = new AppError(ERROR_CODES.GRP_FORBIDDEN);
    expect(err.userMessage.title).toBe(
      USER_MESSAGES[ERROR_CODES.GRP_FORBIDDEN].title
    );
    expect(err.code).toBe("ERR-GRP-403");
  });

  it("supports overrides without leaking the cause", () => {
    const cause = new Error("Missing or insufficient permissions");
    const err = new AppError(ERROR_CODES.GRP_FORBIDDEN, {
      title: "No access here",
      cause,
    });
    expect(err.userMessage.title).toBe("No access here");
    expect(err.message).not.toContain("Missing or insufficient permissions");
  });

  it("toJSON omits raw causes for safe logging", () => {
    const err = new AppError(ERROR_CODES.EXP_SAVE_FAILED, {
      cause: new Error("internal"),
    });
    const json = err.toJSON();
    expect(json).toEqual(
      expect.objectContaining({
        name: "AppError",
        code: "ERR-EXP-500",
        retryable: true,
      })
    );
    expect(JSON.stringify(json)).not.toContain("internal");
  });
});

describe("toAppError", () => {
  it("passes AppError instances through unchanged", () => {
    const original = new AppError(ERROR_CODES.GRP_NOT_FOUND);
    expect(toAppError(original)).toBe(original);
  });

  it("maps Firestore permission-denied by domain", () => {
    const err = new FirebaseError("permission-denied", "Missing or insufficient permissions");
    expect(toAppError(err, "group").code).toBe(ERROR_CODES.GRP_FORBIDDEN);
    expect(toAppError(err, "expense").code).toBe(ERROR_CODES.EXP_FORBIDDEN);
    expect(toAppError(err, "settlement").code).toBe(ERROR_CODES.STL_FORBIDDEN);
  });

  it("maps Firebase auth errors", () => {
    expect(
      toAppError(new FirebaseError("auth/popup-blocked", "blocked"), "auth").code
    ).toBe(ERROR_CODES.AUTH_POPUP_BLOCKED);
    expect(
      toAppError(new FirebaseError("auth/network-request-failed", "x"), "auth")
        .code
    ).toBe(ERROR_CODES.AUTH_NETWORK);
    expect(
      toAppError(new FirebaseError("auth/internal-error", "x"), "auth").code
    ).toBe(ERROR_CODES.AUTH_UNKNOWN);
  });

  it("maps Firestore not-found by domain", () => {
    const err = new FirebaseError("not-found", "no doc");
    expect(toAppError(err, "group").code).toBe(ERROR_CODES.GRP_NOT_FOUND);
    expect(toAppError(err, "expense").code).toBe(ERROR_CODES.EXP_NOT_FOUND);
    expect(toAppError(err, "invitation").code).toBe(ERROR_CODES.INV_NOT_FOUND);
  });

  it("falls back to the unknown app error for unknown causes", () => {
    expect(toAppError("string error").code).toBe(ERROR_CODES.APP_UNKNOWN);
    expect(toAppError(undefined).code).toBe(ERROR_CODES.APP_UNKNOWN);
  });
});

describe("user messages", () => {
  it("never contains raw Firebase jargon in any message", () => {
    const banned = [
      /firebase/i,
      /firestore/i,
      /permission-denied/i,
      /auth\//i,
      /missing or insufficient/i,
    ];
    for (const code of Object.values(ERROR_CODES)) {
      const m = messageFor(code);
      const text = `${m.title} ${m.description}`;
      for (const pattern of banned) {
        expect(
          pattern.test(text),
          `Code ${code} leaks "${pattern}" in text: ${text}`
        ).toBe(false);
      }
    }
  });

  it("isAppError narrows the type correctly", () => {
    const err: unknown = new AppError(ERROR_CODES.APP_UNKNOWN);
    expect(isAppError(err)).toBe(true);
    expect(isAppError(new Error("x"))).toBe(false);
    expect(isAppError("string")).toBe(false);
  });
});
