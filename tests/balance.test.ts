import { describe, expect, it } from "vitest";
import {
  balanceFor,
  calculateBalances,
  directDebtTransfers,
  grossDirectedOwingFromExpenses,
  simplifyDebts,
} from "@/lib/balance/calculate";
import type { ExpenseDoc, SettlementDoc } from "@/lib/firebase/types";

function exp(
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
    // Cast: tests don't need real Timestamp values.
    createdAt: { toMillis: () => 0 } as any,
    updatedAt: { toMillis: () => 0 } as any,
  };
}

describe("calculateBalances", () => {
  it("returns zero balances when no expenses", () => {
    const b = calculateBalances(["a", "b"], []);
    expect(balanceFor("a", b).net).toBe(0);
    expect(balanceFor("b", b).net).toBe(0);
  });

  it("computes net = paid - owed", () => {
    // Alice pays 100, split equally between Alice + Bob.
    const e = exp("a", 100, [
      ["a", 50],
      ["b", 50],
    ]);
    const b = calculateBalances(["a", "b"], [e]);
    expect(balanceFor("a", b).net).toBe(50);
    expect(balanceFor("b", b).net).toBe(-50);
  });

  it("handles partial participants and personal expenses", () => {
    // Personal expense: Bob spent 30 on himself, Alice paid.
    const personal = exp("a", 30, [["b", 30]]);
    const b = calculateBalances(["a", "b", "c"], [personal]);
    expect(balanceFor("a", b).net).toBe(30);
    expect(balanceFor("b", b).net).toBe(-30);
    expect(balanceFor("c", b).net).toBe(0);
  });

  it("applies recorded settlements", () => {
    const e = exp("a", 100, [
      ["a", 50],
      ["b", 50],
    ]);
    const settlement: SettlementDoc = {
      id: "s1",
      groupId: "g",
      fromUid: "b",
      toUid: "a",
      amount: 50,
      currency: "INR",
      note: "",
      createdAt: { toMillis: () => 0 } as any,
      createdBy: "b",
    };
    const b = calculateBalances(["a", "b"], [e], [settlement]);
    // Both should now be even.
    expect(balanceFor("a", b).net).toBe(0);
    expect(balanceFor("b", b).net).toBe(0);
  });
});

describe("simplifyDebts", () => {
  it("returns no transfers when everyone is even", () => {
    const transfers = simplifyDebts([
      { uid: "a", paid: 0, owed: 0, net: 0 },
      { uid: "b", paid: 0, owed: 0, net: 0 },
    ]);
    expect(transfers).toEqual([]);
  });

  it("produces a single transfer for a 2-person debt", () => {
    const transfers = simplifyDebts([
      { uid: "a", paid: 50, owed: 0, net: 50 },
      { uid: "b", paid: 0, owed: 50, net: -50 },
    ]);
    expect(transfers).toHaveLength(1);
    expect(transfers[0]).toEqual({ fromUid: "b", toUid: "a", amount: 50 });
  });

  it("minimizes transfers across multiple members", () => {
    // Net: a=+60, b=+40, c=-30, d=-70. Total balanced.
    const transfers = simplifyDebts([
      { uid: "a", paid: 0, owed: 0, net: 60 },
      { uid: "b", paid: 0, owed: 0, net: 40 },
      { uid: "c", paid: 0, owed: 0, net: -30 },
      { uid: "d", paid: 0, owed: 0, net: -70 },
    ]);
    expect(transfers.length).toBeLessThanOrEqual(3);
    const totalIn: Record<string, number> = {};
    const totalOut: Record<string, number> = {};
    for (const t of transfers) {
      totalOut[t.fromUid] = (totalOut[t.fromUid] ?? 0) + t.amount;
      totalIn[t.toUid] = (totalIn[t.toUid] ?? 0) + t.amount;
    }
    expect(totalIn.a ?? 0).toBe(60);
    expect(totalIn.b ?? 0).toBe(40);
    expect(totalOut.c ?? 0).toBe(30);
    expect(totalOut.d ?? 0).toBe(70);
  });
});

describe("grossDirectedOwingFromExpenses", () => {
  it("aggregates all shares a participant owes the payer", () => {
    const e1 = exp("a", 100, [
      ["a", 40],
      ["b", 60],
    ]);
    const e2 = exp("a", 50, [
      ["a", 10],
      ["b", 40],
    ]);
    expect(grossDirectedOwingFromExpenses([e1, e2])).toEqual([
      { fromUid: "b", toUid: "a", amount: 100 },
    ]);
  });

  it("keeps opposite directions as separate rows (unlike net minimization)", () => {
    const e1 = exp("a", 100, [
      ["a", 50],
      ["b", 50],
    ]);
    const e2 = exp("b", 100, [
      ["b", 50],
      ["a", 50],
    ]);
    const gross = grossDirectedOwingFromExpenses([e1, e2]);
    expect(gross).toHaveLength(2);
    expect(gross.find((t) => t.fromUid === "b" && t.toUid === "a")?.amount).toBe(
      50
    );
    expect(gross.find((t) => t.fromUid === "a" && t.toUid === "b")?.amount).toBe(
      50
    );
    const nets = [
      { uid: "a", paid: 0, owed: 0, net: 0 },
      { uid: "b", paid: 0, owed: 0, net: 0 },
    ];
    // a paid 100+0 on e1? exp a paid 100, owed 50 on e1; e2 b paid, a owed 50
    nets[0] = { uid: "a", paid: 100, owed: 100, net: 0 };
    nets[1] = { uid: "b", paid: 100, owed: 100, net: 0 };
    expect(simplifyDebts(nets)).toHaveLength(0);
  });
});

describe("directDebtTransfers", () => {
  it("returns empty when no debtors or creditors", () => {
    expect(
      directDebtTransfers(
        [
          { uid: "a", paid: 0, owed: 0, net: 0 },
          { uid: "b", paid: 0, owed: 0, net: 0 },
        ],
        { a: "Ann", b: "Bob" }
      )
    ).toEqual([]);
  });

  it("pairs debtor to creditor for a simple two-person debt", () => {
    const balances = [
      { uid: "a", paid: 0, owed: 0, net: 50 },
      { uid: "b", paid: 0, owed: 0, net: -50 },
    ];
    expect(directDebtTransfers(balances, { a: "Zara", b: "Mia" })).toEqual([
      { fromUid: "b", toUid: "a", amount: 50 },
    ]);
  });

  it("uses name-ordered pairing and can differ from amount-greedy minimization", () => {
    const balances = [
      { uid: "a", paid: 0, owed: 0, net: 60 },
      { uid: "b", paid: 0, owed: 0, net: 40 },
      { uid: "c", paid: 0, owed: 0, net: -30 },
      { uid: "d", paid: 0, owed: 0, net: -70 },
    ];
    const names = { a: "ann", b: "bob", c: "cam", d: "dan" };
    const direct = directDebtTransfers(balances, names);
    const min = simplifyDebts(balances);
    const sumOut = (list: typeof direct, uid: string) =>
      list.filter((t) => t.fromUid === uid).reduce((s, t) => s + t.amount, 0);
    expect(sumOut(direct, "c")).toBe(30);
    expect(sumOut(direct, "d")).toBe(70);
    expect(sumOut(min, "c")).toBe(30);
    expect(sumOut(min, "d")).toBe(70);
    expect(direct).not.toEqual(min);
  });
});
