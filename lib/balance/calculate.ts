import type { ExpenseDoc, SettlementDoc } from "@/lib/firebase/types";
import { round2 } from "@/lib/utils";

export interface MemberBalance {
  uid: string;
  paid: number;
  owed: number;
  /** net = paid - owed; positive => is owed money, negative => owes money. */
  net: number;
}

export interface Transfer {
  fromUid: string;
  toUid: string;
  amount: number;
}

/**
 * Compute every member's net balance from the raw expense + settlement log.
 *
 * - `paid` = sum of expense amounts they paid for.
 * - `owed` = sum of their per-expense `owed` shares from splitValues.
 * - Recorded settlements shift balance: payer's net goes up, receiver's down.
 */
export function calculateBalances(
  memberIds: string[],
  expenses: ExpenseDoc[],
  settlements: SettlementDoc[] = []
): MemberBalance[] {
  const map = new Map<string, MemberBalance>();
  for (const uid of memberIds) {
    map.set(uid, { uid, paid: 0, owed: 0, net: 0 });
  }

  for (const expense of expenses) {
    const payer = map.get(expense.paidBy);
    if (payer) payer.paid += expense.amount;

    for (const sv of expense.splitValues) {
      const m = map.get(sv.uid);
      if (m) m.owed += sv.owed;
    }
  }

  // Settlement: `from` paid `to`. This reduces `from`'s debt and `to`'s credit.
  for (const s of settlements) {
    const from = map.get(s.fromUid);
    const to = map.get(s.toUid);
    if (from) from.paid += s.amount;
    if (to) to.owed += s.amount;
  }

  for (const m of map.values()) {
    m.paid = round2(m.paid);
    m.owed = round2(m.owed);
    m.net = round2(m.paid - m.owed);
  }
  return Array.from(map.values());
}

/**
 * Greedy debt-simplification: repeatedly settle the largest creditor against
 * the largest debtor until everyone is within 1 cent of zero. This produces
 * at most N-1 transfers and is the standard Splitwise-style algorithm.
 */
export function simplifyDebts(balances: MemberBalance[]): Transfer[] {
  const creditors = balances
    .filter((b) => b.net > 0.01)
    .map((b) => ({ uid: b.uid, amount: round2(b.net) }))
    .sort((a, b) => b.amount - a.amount);
  const debtors = balances
    .filter((b) => b.net < -0.01)
    .map((b) => ({ uid: b.uid, amount: round2(-b.net) }))
    .sort((a, b) => b.amount - a.amount);

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i]!;
    const creditor = creditors[j]!;
    const pay = round2(Math.min(debtor.amount, creditor.amount));
    if (pay > 0) {
      transfers.push({ fromUid: debtor.uid, toUid: creditor.uid, amount: pay });
    }
    debtor.amount = round2(debtor.amount - pay);
    creditor.amount = round2(creditor.amount - pay);
    if (debtor.amount <= 0.01) i++;
    if (creditor.amount <= 0.01) j++;
  }
  return transfers;
}

/**
 * Pairwise settlements **without** the amount-based greedy used by
 * {@link simplifyDebts}. Creditors and debtors are ordered alphabetically by
 * display name (falling back to uid), then each debtor pays down creditors in
 * that fixed order. This reflects the same underlying net balances but often
 * produces a different (sometimes longer) list of transfers — useful when you
 * want a deterministic "who pays whom" story before turning on optimization.
 */
export function directDebtTransfers(
  balances: MemberBalance[],
  memberNames: Record<string, string>
): Transfer[] {
  const sortKey = (uid: string) =>
    (memberNames[uid] ?? uid).toLowerCase().trim();

  const creditors = balances
    .filter((b) => b.net > 0.01)
    .map((b) => ({ uid: b.uid, remaining: round2(b.net) }))
    .sort((a, b) => sortKey(a.uid).localeCompare(sortKey(b.uid)));

  const debtors = balances
    .filter((b) => b.net < -0.01)
    .map((b) => ({ uid: b.uid, remaining: round2(-b.net) }))
    .sort((a, b) => sortKey(a.uid).localeCompare(sortKey(b.uid)));

  const transfers: Transfer[] = [];
  for (const d of debtors) {
    let left = d.remaining;
    for (const c of creditors) {
      if (left <= 0.01) break;
      if (c.remaining <= 0.01) continue;
      const pay = round2(Math.min(left, c.remaining));
      if (pay > 0.01) {
        transfers.push({ fromUid: d.uid, toUid: c.uid, amount: pay });
        left = round2(left - pay);
        c.remaining = round2(c.remaining - pay);
      }
    }
  }
  return transfers;
}

/** Convenience: balances for one user, including paid/owed/net. */
export function balanceFor(
  uid: string,
  balances: MemberBalance[]
): MemberBalance {
  return (
    balances.find((b) => b.uid === uid) ?? {
      uid,
      paid: 0,
      owed: 0,
      net: 0,
    }
  );
}
