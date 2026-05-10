"use client";

import { useEffect, useMemo, useState } from "react";
import {
  watchActivity,
  watchExpenses,
  watchGroup,
  watchSettlements,
} from "@/lib/firebase/firestore";
import { calculateBalances, simplifyDebts } from "@/lib/balance/calculate";
import type {
  ActivityLogDoc,
  ExpenseDoc,
  GroupDoc,
  SettlementDoc,
} from "@/lib/firebase/types";

export function useTrip(groupId: string) {
  const [group, setGroup] = useState<GroupDoc | null>(null);
  const [expenses, setExpenses] = useState<ExpenseDoc[]>([]);
  const [settlements, setSettlements] = useState<SettlementDoc[]>([]);
  const [activity, setActivity] = useState<ActivityLogDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!groupId) return;
    setLoading(true);
    const unsubs: Array<() => void> = [];

    let groupReady = false;
    let expensesReady = false;
    let settlementsReady = false;
    const maybeDone = () => {
      if (groupReady && expensesReady && settlementsReady) setLoading(false);
    };

    unsubs.push(
      watchGroup(groupId, (g) => {
        setGroup(g);
        groupReady = true;
        maybeDone();
      })
    );
    unsubs.push(
      watchExpenses(groupId, (e) => {
        setExpenses(e);
        expensesReady = true;
        maybeDone();
      })
    );
    unsubs.push(
      watchSettlements(groupId, (s) => {
        setSettlements(s);
        settlementsReady = true;
        maybeDone();
      })
    );
    unsubs.push(watchActivity(groupId, 30, setActivity));

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [groupId]);

  const balances = useMemo(() => {
    if (!group) return [];
    return calculateBalances(group.memberIds, expenses, settlements);
  }, [group, expenses, settlements]);

  const transfers = useMemo(() => simplifyDebts(balances), [balances]);

  return { group, expenses, settlements, activity, balances, transfers, loading };
}
