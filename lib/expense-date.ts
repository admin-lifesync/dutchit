import type { Timestamp } from "firebase/firestore";
import type { ExpenseDoc } from "@/lib/firebase/types";

/**
 * Returns the millisecond timestamp that represents *when the expense
 * actually happened*. Falls back to `createdAt` for legacy expenses that
 * were saved before the user-editable `date` field existed. Returns 0 if
 * neither is present yet (e.g. an optimistic local doc that hasn't synced).
 */
export function expenseDateMillis(expense: ExpenseDoc): number {
  return (
    expense.date?.toMillis?.() ??
    expense.createdAt?.toMillis?.() ??
    0
  );
}

/** The same value, surfaced as a Date instance for formatters. */
export function expenseDate(expense: ExpenseDoc): Date {
  return new Date(expenseDateMillis(expense));
}

/**
 * For writers — the Firestore Timestamp class isn't available here without
 * importing the SDK, so callers should pass us the constructor when they
 * have it. Returns either the explicit user-picked timestamp or null when
 * we should let `serverTimestamp()` win.
 */
export function buildExpenseDateField(
  isoOrLocal: string | null | undefined,
  TimestampCtor: typeof Timestamp
): Timestamp | null {
  if (!isoOrLocal) return null;
  const d = new Date(isoOrLocal);
  if (Number.isNaN(d.getTime())) return null;
  return TimestampCtor.fromDate(d);
}
