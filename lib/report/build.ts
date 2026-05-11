import type {
  ExpenseCategory,
  ExpenseDoc,
  GroupDoc,
  SettlementDoc,
} from "@/lib/firebase/types";
import { round2 } from "@/lib/utils";

export interface PerCategorySpend {
  category: ExpenseCategory;
  amount: number;
}

export interface PerExpenseLine {
  expenseId: string;
  title: string;
  category: ExpenseCategory;
  date: number; // millis, or 0 for unknown
  amount: number; // total expense amount
  share: number; // this person's owed share
  paid: boolean; // true => this person paid the expense
}

export interface PersonReport {
  uid: string;
  name: string;
  photoURL: string | null;
  /** Sum of expense amounts they paid for. */
  totalPaid: number;
  /** Sum of their `owed` shares across all expenses (their cost of the trip). */
  totalShare: number;
  /** totalPaid - totalShare. Positive => they should receive money. */
  net: number;
  /** Settlements they paid out (counts toward "settled-out"). */
  settledOut: number;
  /** Settlements paid to them. */
  settledIn: number;
  /** Per-category share breakdown. Sum equals `totalShare`. */
  byCategory: PerCategorySpend[];
  /** Every expense they participated in or paid for, newest-first. */
  expenses: PerExpenseLine[];
}

export interface TripReport {
  totalSpent: number;
  expenseCount: number;
  totalSettlements: number;
  byCategory: PerCategorySpend[];
  largestExpense: PerExpenseLine | null;
  people: PersonReport[];
}

/**
 * Build a comprehensive per-person + trip-level report from the raw expense
 * and settlement log. Pure / deterministic — safe to memoize on the client
 * and to unit-test in isolation.
 */
export function buildTripReport(
  group: GroupDoc,
  expenses: ExpenseDoc[],
  settlements: SettlementDoc[] = []
): TripReport {
  const byUid = new Map<string, PersonReport>();
  for (const m of group.members) {
    byUid.set(m.uid, {
      uid: m.uid,
      name: m.name,
      photoURL: m.photoURL ?? null,
      totalPaid: 0,
      totalShare: 0,
      net: 0,
      settledOut: 0,
      settledIn: 0,
      byCategory: [],
      expenses: [],
    });
  }

  // Helper that lazily creates a category bucket on a person.
  const bumpCategory = (p: PersonReport, cat: ExpenseCategory, amt: number) => {
    const existing = p.byCategory.find((c) => c.category === cat);
    if (existing) existing.amount = round2(existing.amount + amt);
    else p.byCategory.push({ category: cat, amount: round2(amt) });
  };

  const tripByCategory = new Map<ExpenseCategory, number>();
  let largest: PerExpenseLine | null = null;

  for (const e of expenses) {
    tripByCategory.set(
      e.category,
      round2((tripByCategory.get(e.category) ?? 0) + e.amount)
    );
    const dateMs = e.date?.toMillis?.() ?? e.createdAt?.toMillis?.() ?? 0;

    // Payer bookkeeping.
    const payer = byUid.get(e.paidBy);
    if (payer) payer.totalPaid = round2(payer.totalPaid + e.amount);

    // Each participant's share.
    for (const sv of e.splitValues) {
      const p = byUid.get(sv.uid);
      if (!p) continue;
      p.totalShare = round2(p.totalShare + sv.owed);
      bumpCategory(p, e.category, sv.owed);
      p.expenses.push({
        expenseId: e.id,
        title: e.title,
        category: e.category,
        date: dateMs,
        amount: e.amount,
        share: round2(sv.owed),
        paid: e.paidBy === sv.uid,
      });
    }
    // If the payer wasn't in splitValues (rare for personal/edge cases),
    // still record the line so the report shows what they paid for.
    if (payer && !e.splitValues.some((sv) => sv.uid === e.paidBy)) {
      payer.expenses.push({
        expenseId: e.id,
        title: e.title,
        category: e.category,
        date: dateMs,
        amount: e.amount,
        share: 0,
        paid: true,
      });
    }

    const lineForLargest: PerExpenseLine = {
      expenseId: e.id,
      title: e.title,
      category: e.category,
      date: dateMs,
      amount: e.amount,
      share: e.amount,
      paid: true,
    };
    if (!largest || lineForLargest.amount > largest.amount) {
      largest = lineForLargest;
    }
  }

  let totalSettlements = 0;
  for (const s of settlements) {
    totalSettlements = round2(totalSettlements + s.amount);
    const from = byUid.get(s.fromUid);
    const to = byUid.get(s.toUid);
    if (from) {
      from.settledOut = round2(from.settledOut + s.amount);
      // Treat outbound settlement like an extra "paid" entry — it shifts net.
      from.totalPaid = round2(from.totalPaid + s.amount);
    }
    if (to) {
      to.settledIn = round2(to.settledIn + s.amount);
      to.totalShare = round2(to.totalShare + s.amount);
    }
  }

  for (const p of byUid.values()) {
    p.net = round2(p.totalPaid - p.totalShare);
    p.byCategory.sort((a, b) => b.amount - a.amount);
    p.expenses.sort((a, b) => b.date - a.date);
  }

  const tripBy: PerCategorySpend[] = Array.from(tripByCategory.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  const totalSpent = round2(
    expenses.reduce((acc, e) => acc + e.amount, 0)
  );

  return {
    totalSpent,
    expenseCount: expenses.length,
    totalSettlements,
    byCategory: tripBy,
    largestExpense: largest,
    people: Array.from(byUid.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    ),
  };
}
