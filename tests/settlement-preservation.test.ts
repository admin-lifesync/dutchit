/**
 * Task 2 — Preservation Property Tests
 *
 * These tests verify behaviors that MUST remain unchanged after the fix.
 * They are expected to PASS on unfixed code — passing confirms baseline behavior.
 *
 * Property 2: Preservation — Accepted Settlements and Engine Wrapper Identity
 *
 * Validates: Requirements 3.1, 3.2, 3.5
 */

import { describe, expect, it } from "vitest";
import {
  calculateBalances,
  grossDirectedOwingFromExpenses,
  simplifyDebts,
} from "@/lib/balance/calculate";
import type { ExpenseDoc, SettlementDoc } from "@/lib/firebase/types";
import type { MemberBalance } from "@/lib/balance/calculate";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeExpense(
  paidBy: string,
  amount: number,
  splits: Array<[string, number]>
): ExpenseDoc {
  return {
    id: Math.random().toString(36).slice(2),
    groupId: "g",
    title: "test",
    amount,
    currency: "INR",
    paidBy,
    participants: splits.map(([u]) => u),
    splitType: "exact",
    splitValues: splits.map(([uid, owed]) => ({ uid, value: owed, owed })),
    category: "misc",
    notes: "",
    receiptURL: null,
    createdBy: paidBy,
    createdAt: { toMillis: () => 0 } as any,
    updatedAt: { toMillis: () => 0 } as any,
  };
}

function makeAcceptedSettlement(
  fromUid: string,
  toUid: string,
  amount: number
): SettlementDoc {
  return {
    id: Math.random().toString(36).slice(2),
    groupId: "g",
    fromUid,
    toUid,
    amount,
    currency: "INR",
    note: "",
    createdAt: { toMillis: () => 0 } as any,
    createdBy: fromUid,
    // status: "accepted" — cast since type doesn't have it yet on unfixed code
    status: "accepted",
  } as SettlementDoc;
}

function makeLegacySettlement(
  fromUid: string,
  toUid: string,
  amount: number
): SettlementDoc {
  // Legacy doc: no status field at all (written before the fix)
  return {
    id: Math.random().toString(36).slice(2),
    groupId: "g",
    fromUid,
    toUid,
    amount,
    currency: "INR",
    note: "",
    createdAt: { toMillis: () => 0 } as any,
    createdBy: fromUid,
    // Intentionally no status field
  } as SettlementDoc;
}

// ---------------------------------------------------------------------------
// Property-based test helpers: generate random inputs
// ---------------------------------------------------------------------------

function randomExpenses(count: number, members: string[]): ExpenseDoc[] {
  const expenses: ExpenseDoc[] = [];
  for (let i = 0; i < count; i++) {
    const payer = members[i % members.length]!;
    const amount = Math.round((Math.random() * 200 + 10) * 100) / 100;
    const numParticipants = Math.max(2, Math.floor(Math.random() * members.length) + 1);
    const participants = members.slice(0, numParticipants);
    const share = Math.round((amount / numParticipants) * 100) / 100;
    const splits: Array<[string, number]> = participants.map((uid) => [uid, share]);
    expenses.push(makeExpense(payer, amount, splits));
  }
  return expenses;
}

function randomBalances(members: string[]): MemberBalance[] {
  const balances: MemberBalance[] = members.map((uid) => {
    const paid = Math.round(Math.random() * 500 * 100) / 100;
    const owed = Math.round(Math.random() * 500 * 100) / 100;
    return { uid, paid, owed, net: Math.round((paid - owed) * 100) / 100 };
  });
  return balances;
}

// ---------------------------------------------------------------------------
// Property-based test A: Accepted settlements shift balances identically
//
// For any settlement with status === "accepted", calculateBalances with the fix
// produces identical paid/owed/net values as the original calculateBalances.
//
// On UNFIXED code: this PASSES because unfixed code applies ALL settlements
// (including "accepted" ones) — the behavior for accepted settlements is preserved.
// ---------------------------------------------------------------------------
describe("Preservation Property A — Accepted settlements shift balances identically", () => {
  it("accepted settlement shifts sender net up and receiver net down (basic case)", () => {
    const expense = makeExpense("alice", 100, [
      ["alice", 50],
      ["bob", 50],
    ]);
    const memberIds = ["alice", "bob"];

    // Observe baseline: alice net=50, bob net=-50
    const baseBalances = calculateBalances(memberIds, [expense], []);
    expect(baseBalances.find((b) => b.uid === "alice")?.net).toBe(50);
    expect(baseBalances.find((b) => b.uid === "bob")?.net).toBe(-50);

    // With accepted settlement: bob pays alice 50
    const acceptedSettlement = makeAcceptedSettlement("bob", "alice", 50);
    const settledBalances = calculateBalances(memberIds, [expense], [acceptedSettlement]);

    // Both should be even after accepted settlement
    expect(settledBalances.find((b) => b.uid === "alice")?.net).toBe(0);
    expect(settledBalances.find((b) => b.uid === "bob")?.net).toBe(0);
  });

  it("accepted settlement: sender net increases, receiver net decreases by amount", () => {
    const members = ["alice", "bob", "carol"];
    const expenses = [
      makeExpense("alice", 300, [
        ["alice", 100],
        ["bob", 100],
        ["carol", 100],
      ]),
    ];

    const baseBalances = calculateBalances(members, expenses, []);
    const aliceBase = baseBalances.find((b) => b.uid === "alice")!;
    const bobBase = baseBalances.find((b) => b.uid === "bob")!;

    const settlement = makeAcceptedSettlement("bob", "alice", 100);
    const settledBalances = calculateBalances(members, expenses, [settlement]);

    const aliceSettled = settledBalances.find((b) => b.uid === "alice")!;
    const bobSettled = settledBalances.find((b) => b.uid === "bob")!;

    // Sender (bob) net increases by settlement amount
    expect(Math.round((bobSettled.net - bobBase.net) * 100) / 100).toBe(100);
    // Receiver (alice) net decreases by settlement amount
    expect(Math.round((aliceSettled.net - aliceBase.net) * 100) / 100).toBe(-100);
  });

  it("property: accepted settlement preservation holds for multiple random inputs", () => {
    const members = ["a", "b", "c", "d"];

    // Run 20 random scenarios
    for (let i = 0; i < 20; i++) {
      const expenses = randomExpenses(3, members);
      const baseBalances = calculateBalances(members, expenses, []);

      // Pick a random debtor and creditor
      const debtors = baseBalances.filter((b) => b.net < -0.01);
      const creditors = baseBalances.filter((b) => b.net > 0.01);
      if (debtors.length === 0 || creditors.length === 0) continue;

      const debtor = debtors[0]!;
      const creditor = creditors[0]!;
      const amount = Math.min(Math.abs(debtor.net), creditor.net);

      const settlement = makeAcceptedSettlement(debtor.uid, creditor.uid, amount);
      const settledBalances = calculateBalances(members, expenses, [settlement]);

      const debtorSettled = settledBalances.find((b) => b.uid === debtor.uid)!;
      const creditorSettled = settledBalances.find((b) => b.uid === creditor.uid)!;

      // Sender net increases by amount
      expect(Math.round((debtorSettled.net - debtor.net) * 100) / 100).toBeCloseTo(amount, 1);
      // Receiver net decreases by amount
      expect(Math.round((creditorSettled.net - creditor.net) * 100) / 100).toBeCloseTo(-amount, 1);
    }
  });
});

// ---------------------------------------------------------------------------
// Property-based test B: calculateDirectSettlements identity
//
// For any expense array, calculateDirectSettlements(expenses) deep-equals
// grossDirectedOwingFromExpenses(expenses).
//
// NOTE: calculateDirectSettlements doesn't exist yet on unfixed code.
// We test the underlying function directly to establish the baseline.
// After the fix, we'll verify the wrapper produces identical output.
// ---------------------------------------------------------------------------
describe("Preservation Property B — Direct engine baseline (grossDirectedOwingFromExpenses)", () => {
  it("grossDirectedOwingFromExpenses produces correct direct transfers", () => {
    const expenses = [
      makeExpense("alice", 100, [
        ["alice", 50],
        ["bob", 50],
      ]),
      makeExpense("bob", 60, [
        ["bob", 30],
        ["carol", 30],
      ]),
    ];

    const transfers = grossDirectedOwingFromExpenses(expenses);

    // bob owes alice 50, carol owes bob 30
    expect(transfers.find((t) => t.fromUid === "bob" && t.toUid === "alice")?.amount).toBe(50);
    expect(transfers.find((t) => t.fromUid === "carol" && t.toUid === "bob")?.amount).toBe(30);
  });

  it("property: grossDirectedOwingFromExpenses is deterministic for same input", () => {
    const members = ["a", "b", "c"];
    for (let i = 0; i < 10; i++) {
      const expenses = randomExpenses(4, members);
      const result1 = grossDirectedOwingFromExpenses(expenses);
      const result2 = grossDirectedOwingFromExpenses(expenses);
      expect(result1).toEqual(result2);
    }
  });

  it("property: every transfer in grossDirectedOwingFromExpenses has a direct expense relationship", () => {
    const members = ["a", "b", "c", "d"];
    for (let i = 0; i < 15; i++) {
      const expenses = randomExpenses(5, members);
      const transfers = grossDirectedOwingFromExpenses(expenses);

      for (const transfer of transfers) {
        // Every transfer must correspond to a non-payer/payer relationship in expenses
        const hasDirectRelationship = expenses.some(
          (e) =>
            e.paidBy === transfer.toUid &&
            e.splitValues.some(
              (sv) => sv.uid === transfer.fromUid && sv.uid !== e.paidBy && sv.owed > 0.01
            )
        );
        expect(hasDirectRelationship).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Property-based test C: calculateMinimizedSettlements identity
//
// For any balance array, calculateMinimizedSettlements(balances) deep-equals
// simplifyDebts(balances).
//
// NOTE: calculateMinimizedSettlements doesn't exist yet on unfixed code.
// We test simplifyDebts directly to establish the baseline.
// ---------------------------------------------------------------------------
describe("Preservation Property C — Minimized engine baseline (simplifyDebts)", () => {
  it("simplifyDebts produces at most N-1 transfers for N members with non-zero balances", () => {
    const members = ["a", "b", "c", "d", "e"];
    for (let i = 0; i < 20; i++) {
      const balances = randomBalances(members);
      // Normalize so total net = 0 (required for valid balance set)
      const totalNet = balances.reduce((s, b) => s + b.net, 0);
      if (Math.abs(totalNet) > 0.01) {
        balances[0]!.net -= totalNet;
      }

      const nonZeroCount = balances.filter((b) => Math.abs(b.net) > 0.01).length;
      const transfers = simplifyDebts(balances);

      expect(transfers.length).toBeLessThanOrEqual(Math.max(0, nonZeroCount - 1));
    }
  });

  it("simplifyDebts: sum of transfer amounts equals total positive net balances", () => {
    const balances: MemberBalance[] = [
      { uid: "a", paid: 0, owed: 0, net: 60 },
      { uid: "b", paid: 0, owed: 0, net: 40 },
      { uid: "c", paid: 0, owed: 0, net: -30 },
      { uid: "d", paid: 0, owed: 0, net: -70 },
    ];

    const transfers = simplifyDebts(balances);
    const totalTransferred = transfers.reduce((s, t) => s + t.amount, 0);
    const totalPositiveNet = balances.filter((b) => b.net > 0).reduce((s, b) => s + b.net, 0);

    expect(Math.round(totalTransferred * 100) / 100).toBeCloseTo(totalPositiveNet, 1);
  });

  it("property: simplifyDebts is deterministic for same input", () => {
    const members = ["a", "b", "c", "d"];
    for (let i = 0; i < 10; i++) {
      const balances = randomBalances(members);
      const result1 = simplifyDebts(balances);
      const result2 = simplifyDebts(balances);
      expect(result1).toEqual(result2);
    }
  });
});

// ---------------------------------------------------------------------------
// Property-based test D: Legacy docs (no status field) treated as accepted
//
// For any settlement with no status field (legacy doc), calculateBalances
// should treat it as accepted — backward compatibility.
//
// On UNFIXED code: this PASSES because unfixed code applies ALL settlements
// (no status check at all), which is equivalent to treating them as accepted.
// ---------------------------------------------------------------------------
describe("Preservation Property D — Legacy docs without status treated as accepted", () => {
  it("legacy settlement (no status field) shifts balances like an accepted settlement", () => {
    const expense = makeExpense("alice", 100, [
      ["alice", 50],
      ["bob", 50],
    ]);
    const memberIds = ["alice", "bob"];

    const legacySettlement = makeLegacySettlement("bob", "alice", 50);
    const acceptedSettlement = makeAcceptedSettlement("bob", "alice", 50);

    const balancesWithLegacy = calculateBalances(memberIds, [expense], [legacySettlement]);
    const balancesWithAccepted = calculateBalances(memberIds, [expense], [acceptedSettlement]);

    // Legacy doc should behave identically to accepted doc
    // (On unfixed code: both are applied; on fixed code: legacy ?? "accepted" fallback)
    expect(balancesWithLegacy).toEqual(balancesWithAccepted);
  });

  it("property: legacy docs produce same result as accepted docs across random inputs", () => {
    const members = ["a", "b", "c"];
    for (let i = 0; i < 15; i++) {
      const expenses = randomExpenses(3, members);
      const baseBalances = calculateBalances(members, expenses, []);

      const debtors = baseBalances.filter((b) => b.net < -0.01);
      const creditors = baseBalances.filter((b) => b.net > 0.01);
      if (debtors.length === 0 || creditors.length === 0) continue;

      const debtor = debtors[0]!;
      const creditor = creditors[0]!;
      const amount = Math.min(Math.abs(debtor.net), creditor.net);

      const legacy = makeLegacySettlement(debtor.uid, creditor.uid, amount);
      const accepted = makeAcceptedSettlement(debtor.uid, creditor.uid, amount);

      const withLegacy = calculateBalances(members, expenses, [legacy]);
      const withAccepted = calculateBalances(members, expenses, [accepted]);

      expect(withLegacy).toEqual(withAccepted);
    }
  });
});
