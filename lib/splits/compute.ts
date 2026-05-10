import type { SplitType, SplitValue } from "@/lib/firebase/types";
import { round2, sum } from "@/lib/utils";

export interface SplitInput {
  amount: number;
  splitType: SplitType;
  participants: string[];
  /** Raw inputs keyed by uid. Meaning depends on `splitType`. */
  values: Record<string, number>;
  /** For "personal" splits: the single uid the expense is for. */
  personalUid?: string;
}

export interface SplitResult {
  splitValues: SplitValue[];
  /** Validation message, or null if input is valid. */
  error: string | null;
}

/**
 * Compute per-participant owed amounts for a given split configuration.
 *
 * Rounding rule: amounts are rounded to 2 decimals. Any 1-cent rounding
 * residue from equal/percent/share splits is added to the largest share so
 * the sum of `owed` exactly equals `amount`.
 */
export function computeSplit(input: SplitInput): SplitResult {
  const { amount, splitType, participants } = input;

  if (!Number.isFinite(amount) || amount <= 0) {
    return { splitValues: [], error: "Amount must be greater than zero." };
  }

  if (splitType === "personal") {
    const uid = input.personalUid || participants[0];
    if (!uid) {
      return { splitValues: [], error: "Pick a person for this expense." };
    }
    return {
      splitValues: [{ uid, value: amount, owed: round2(amount) }],
      error: null,
    };
  }

  if (participants.length === 0) {
    return { splitValues: [], error: "Select at least one participant." };
  }

  if (splitType === "equal") {
    const per = amount / participants.length;
    const rounded = participants.map((uid) => ({
      uid,
      value: 1,
      owed: round2(per),
    }));
    return { splitValues: distributeResidue(rounded, amount), error: null };
  }

  if (splitType === "exact") {
    const values = participants.map((uid) => ({
      uid,
      value: input.values[uid] ?? 0,
      owed: round2(input.values[uid] ?? 0),
    }));
    const total = round2(sum(values.map((v) => v.owed)));
    if (Math.abs(total - round2(amount)) > 0.01) {
      return {
        splitValues: values,
        error: `Exact amounts must sum to ${round2(amount)} (got ${total}).`,
      };
    }
    return { splitValues: values, error: null };
  }

  if (splitType === "percent") {
    const values = participants.map((uid) => ({
      uid,
      value: input.values[uid] ?? 0,
    }));
    const totalPct = round2(sum(values.map((v) => v.value)));
    if (Math.abs(totalPct - 100) > 0.01) {
      return {
        splitValues: values.map((v) => ({ ...v, owed: 0 })),
        error: `Percentages must sum to 100 (got ${totalPct}).`,
      };
    }
    const owed = values.map((v) => ({
      uid: v.uid,
      value: v.value,
      owed: round2((amount * v.value) / 100),
    }));
    return { splitValues: distributeResidue(owed, amount), error: null };
  }

  if (splitType === "share") {
    const values = participants.map((uid) => ({
      uid,
      value: Math.max(0, input.values[uid] ?? 0),
    }));
    const totalShares = sum(values.map((v) => v.value));
    if (totalShares <= 0) {
      return {
        splitValues: values.map((v) => ({ ...v, owed: 0 })),
        error: "Total shares must be greater than zero.",
      };
    }
    const owed = values.map((v) => ({
      uid: v.uid,
      value: v.value,
      owed: round2((amount * v.value) / totalShares),
    }));
    return { splitValues: distributeResidue(owed, amount), error: null };
  }

  return { splitValues: [], error: "Unsupported split type." };
}

/** Adjust the largest share by the rounding residue so totals match `amount`. */
function distributeResidue(values: SplitValue[], amount: number): SplitValue[] {
  if (values.length === 0) return values;
  const total = round2(sum(values.map((v) => v.owed)));
  const target = round2(amount);
  const residue = round2(target - total);
  if (residue === 0) return values;
  let largestIdx = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i]!.owed > values[largestIdx]!.owed) largestIdx = i;
  }
  const next = values.slice();
  next[largestIdx] = {
    ...next[largestIdx]!,
    owed: round2(next[largestIdx]!.owed + residue),
  };
  return next;
}

export function defaultValuesFor(
  splitType: SplitType,
  participants: string[],
  amount: number
): Record<string, number> {
  const values: Record<string, number> = {};
  if (participants.length === 0) return values;
  if (splitType === "exact") {
    const per = round2(amount / participants.length);
    participants.forEach((uid, i) => {
      values[uid] = i === participants.length - 1 ? round2(amount - per * (participants.length - 1)) : per;
    });
  } else if (splitType === "percent") {
    const per = round2(100 / participants.length);
    participants.forEach((uid, i) => {
      values[uid] = i === participants.length - 1 ? round2(100 - per * (participants.length - 1)) : per;
    });
  } else if (splitType === "share") {
    participants.forEach((uid) => {
      values[uid] = 1;
    });
  } else {
    participants.forEach((uid) => {
      values[uid] = 0;
    });
  }
  return values;
}
