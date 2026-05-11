import { describe, expect, it } from "vitest";
import { buildTripReport } from "@/lib/report/build";
import type {
  ExpenseDoc,
  GroupDoc,
  GroupMemberSummary,
  SettlementDoc,
} from "@/lib/firebase/types";

function ts(ms: number) {
  // Tests don't need a real Timestamp instance.
  return { toMillis: () => ms } as unknown as ExpenseDoc["createdAt"];
}

function member(uid: string, name: string): GroupMemberSummary {
  return { uid, name, email: `${uid}@test`, photoURL: null, role: "member" };
}

function makeGroup(memberIds: string[]): GroupDoc {
  return {
    id: "g1",
    name: "Trip",
    description: "",
    imageURL: null,
    currency: "INR",
    createdBy: memberIds[0]!,
    memberIds,
    adminIds: [memberIds[0]!],
    members: memberIds.map((u) => member(u, u.toUpperCase())),
    createdAt: ts(0),
    updatedAt: ts(0),
    expenseCount: 0,
    totalSpent: 0,
    inviteCode: "abc",
    joinPolicy: "open",
  } as GroupDoc;
}

function exp(
  id: string,
  paidBy: string,
  amount: number,
  splits: Array<[string, number]>,
  opts: { dateMs?: number; category?: ExpenseDoc["category"] } = {}
): ExpenseDoc {
  return {
    id,
    groupId: "g1",
    title: `expense-${id}`,
    amount,
    currency: "INR",
    paidBy,
    participants: splits.map(([u]) => u),
    splitType: "exact",
    splitValues: splits.map(([uid, owed]) => ({ uid, value: owed, owed })),
    category: opts.category ?? "food",
    notes: "",
    receiptURL: null,
    createdBy: paidBy,
    createdAt: ts(opts.dateMs ?? 1_000),
    updatedAt: ts(opts.dateMs ?? 1_000),
    date: opts.dateMs !== undefined ? ts(opts.dateMs) : undefined,
  } as ExpenseDoc;
}

describe("buildTripReport", () => {
  it("returns a clean zero-state report when no expenses", () => {
    const r = buildTripReport(makeGroup(["a", "b"]), [], []);
    expect(r.totalSpent).toBe(0);
    expect(r.expenseCount).toBe(0);
    expect(r.byCategory).toEqual([]);
    expect(r.largestExpense).toBeNull();
    expect(r.people).toHaveLength(2);
    expect(r.people.every((p) => p.totalPaid === 0 && p.totalShare === 0 && p.net === 0)).toBe(true);
  });

  it("aggregates per-person paid, share, and net correctly", () => {
    const group = makeGroup(["a", "b"]);
    const r = buildTripReport(
      group,
      [
        // a paid 100, split 50/50 → a owed +50, b owes 50
        exp("e1", "a", 100, [["a", 50], ["b", 50]]),
        // b paid 60, split 30/30 → b owed +30, a owes 30
        exp("e2", "b", 60, [["a", 30], ["b", 30]]),
      ],
      []
    );
    const a = r.people.find((p) => p.uid === "a")!;
    const b = r.people.find((p) => p.uid === "b")!;
    expect(a.totalPaid).toBe(100);
    expect(a.totalShare).toBe(80);
    expect(a.net).toBe(20);
    expect(b.totalPaid).toBe(60);
    expect(b.totalShare).toBe(80);
    expect(b.net).toBe(-20);
    expect(r.totalSpent).toBe(160);
    expect(r.expenseCount).toBe(2);
    expect(r.largestExpense?.expenseId).toBe("e1");
  });

  it("rolls category totals across the trip and per person", () => {
    const r = buildTripReport(
      makeGroup(["a", "b"]),
      [
        exp("e1", "a", 100, [["a", 50], ["b", 50]], { category: "food" }),
        exp("e2", "a", 40, [["a", 20], ["b", 20]], { category: "transport" }),
      ],
      []
    );
    expect(r.byCategory).toEqual([
      { category: "food", amount: 100 },
      { category: "transport", amount: 40 },
    ]);
    const a = r.people.find((p) => p.uid === "a")!;
    expect(a.byCategory).toEqual([
      { category: "food", amount: 50 },
      { category: "transport", amount: 20 },
    ]);
  });

  it("sorts a person's expense ledger newest-first by date", () => {
    const r = buildTripReport(
      makeGroup(["a"]),
      [
        exp("old", "a", 10, [["a", 10]], { dateMs: 1_000 }),
        exp("new", "a", 10, [["a", 10]], { dateMs: 5_000 }),
      ],
      []
    );
    const a = r.people[0]!;
    expect(a.expenses.map((e) => e.expenseId)).toEqual(["new", "old"]);
  });

  it("counts settlements as paid/share so net stays consistent", () => {
    const group = makeGroup(["a", "b"]);
    const expenses: ExpenseDoc[] = [
      exp("e1", "a", 100, [["a", 50], ["b", 50]]),
    ];
    // b pays a 50 → cancels out the debt.
    const settlements: SettlementDoc[] = [
      {
        id: "s1",
        groupId: "g1",
        fromUid: "b",
        toUid: "a",
        amount: 50,
        currency: "INR",
        note: "",
        createdAt: ts(2_000),
        createdBy: "b",
      },
    ];
    const r = buildTripReport(group, expenses, settlements);
    const a = r.people.find((p) => p.uid === "a")!;
    const b = r.people.find((p) => p.uid === "b")!;
    expect(a.net).toBe(0);
    expect(b.net).toBe(0);
    expect(r.totalSettlements).toBe(50);
  });
});
