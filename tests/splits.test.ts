import { describe, expect, it } from "vitest";
import { computeSplit, defaultValuesFor } from "@/lib/splits/compute";
import { round2, sum } from "@/lib/utils";

describe("computeSplit — equal", () => {
  it("splits evenly across all participants", () => {
    const r = computeSplit({
      amount: 100,
      splitType: "equal",
      participants: ["a", "b", "c", "d"],
      values: {},
    });
    expect(r.error).toBeNull();
    expect(r.splitValues.map((s) => s.owed)).toEqual([25, 25, 25, 25]);
  });

  it("absorbs rounding residue into the largest share", () => {
    const r = computeSplit({
      amount: 100,
      splitType: "equal",
      participants: ["a", "b", "c"],
      values: {},
    });
    expect(r.error).toBeNull();
    const total = round2(sum(r.splitValues.map((s) => s.owed)));
    expect(total).toBe(100);
    // All shares are within 1 cent of each other.
    const max = Math.max(...r.splitValues.map((s) => s.owed));
    const min = Math.min(...r.splitValues.map((s) => s.owed));
    expect(round2(max - min)).toBeLessThanOrEqual(0.01);
  });

  it("rejects amounts <= 0", () => {
    const r = computeSplit({
      amount: 0,
      splitType: "equal",
      participants: ["a"],
      values: {},
    });
    expect(r.error).not.toBeNull();
  });
});

describe("computeSplit — exact", () => {
  it("accepts when exacts sum to amount", () => {
    const r = computeSplit({
      amount: 90,
      splitType: "exact",
      participants: ["a", "b"],
      values: { a: 60, b: 30 },
    });
    expect(r.error).toBeNull();
    expect(r.splitValues.find((s) => s.uid === "a")!.owed).toBe(60);
  });

  it("rejects when exacts don't sum to amount", () => {
    const r = computeSplit({
      amount: 90,
      splitType: "exact",
      participants: ["a", "b"],
      values: { a: 50, b: 30 },
    });
    expect(r.error).toMatch(/sum to 90/);
  });
});

describe("computeSplit — percent", () => {
  it("computes owed amounts from percentages", () => {
    const r = computeSplit({
      amount: 100,
      splitType: "percent",
      participants: ["a", "b"],
      values: { a: 70, b: 30 },
    });
    expect(r.error).toBeNull();
    expect(r.splitValues.find((s) => s.uid === "a")!.owed).toBe(70);
    expect(r.splitValues.find((s) => s.uid === "b")!.owed).toBe(30);
  });

  it("rejects when percentages don't total 100", () => {
    const r = computeSplit({
      amount: 100,
      splitType: "percent",
      participants: ["a", "b"],
      values: { a: 50, b: 30 },
    });
    expect(r.error).toMatch(/100/);
  });
});

describe("computeSplit — share", () => {
  it("scales by share weight", () => {
    const r = computeSplit({
      amount: 60,
      splitType: "share",
      participants: ["a", "b", "c"],
      values: { a: 1, b: 1, c: 4 },
    });
    expect(r.error).toBeNull();
    const owed = Object.fromEntries(r.splitValues.map((s) => [s.uid, s.owed]));
    expect(owed.a).toBe(10);
    expect(owed.b).toBe(10);
    expect(owed.c).toBe(40);
  });

  it("rejects when shares are all zero", () => {
    const r = computeSplit({
      amount: 60,
      splitType: "share",
      participants: ["a", "b"],
      values: { a: 0, b: 0 },
    });
    expect(r.error).not.toBeNull();
  });
});

describe("computeSplit — personal", () => {
  it("assigns full amount to one user", () => {
    const r = computeSplit({
      amount: 200,
      splitType: "personal",
      participants: [],
      values: {},
      personalUid: "z",
    });
    expect(r.error).toBeNull();
    expect(r.splitValues).toEqual([
      { uid: "z", value: 200, owed: 200 },
    ]);
  });
});

describe("defaultValuesFor", () => {
  it("creates non-zero defaults for percent", () => {
    const v = defaultValuesFor("percent", ["a", "b", "c"], 100);
    const total = round2(sum(Object.values(v)));
    expect(total).toBe(100);
  });

  it("creates non-zero defaults for exact", () => {
    const v = defaultValuesFor("exact", ["a", "b", "c"], 100);
    const total = round2(sum(Object.values(v)));
    expect(total).toBe(100);
  });
});
