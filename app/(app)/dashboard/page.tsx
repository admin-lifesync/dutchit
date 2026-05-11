"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Plus, Plane } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { useUserGroups } from "@/hooks/use-user-groups";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { TripCard } from "@/components/trips/trip-card";
import { formatMoney } from "@/lib/currency";
import { calculateBalances } from "@/lib/balance/calculate";
import { watchExpenses, watchSettlements } from "@/lib/firebase/firestore";
import type { ExpenseDoc, GroupDoc, SettlementDoc } from "@/lib/firebase/types";
import { formatRelativeTime } from "@/lib/utils";
import { expenseDateMillis } from "@/lib/expense-date";

interface AggregateRow {
  group: GroupDoc;
  expenses: ExpenseDoc[];
  settlements: SettlementDoc[];
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { groups, loading } = useUserGroups();
  const [rows, setRows] = useState<Record<string, AggregateRow>>({});

  useEffect(() => {
    const unsubs: Array<() => void> = [];
    setRows((prev) => {
      const next = { ...prev };
      for (const id of Object.keys(next)) {
        if (!groups.find((g) => g.id === id)) delete next[id];
      }
      return next;
    });
    for (const g of groups) {
      const unsubE = watchExpenses(g.id, (expenses) => {
        setRows((prev) => ({
          ...prev,
          [g.id]: {
            group: g,
            expenses,
            settlements: prev[g.id]?.settlements ?? [],
          },
        }));
      });
      const unsubS = watchSettlements(g.id, (settlements) => {
        setRows((prev) => ({
          ...prev,
          [g.id]: {
            group: g,
            expenses: prev[g.id]?.expenses ?? [],
            settlements,
          },
        }));
      });
      unsubs.push(unsubE, unsubS);
    }
    return () => unsubs.forEach((u) => u());
  }, [groups]);

  const totals = useMemo(() => {
    let totalPaid = 0;
    let totalOwed = 0;
    let totalReceivable = 0;
    if (!user) return { totalPaid, totalOwed, totalReceivable };
    for (const id of Object.keys(rows)) {
      const row = rows[id]!;
      const balances = calculateBalances(
        row.group.memberIds,
        row.expenses,
        row.settlements
      );
      const me = balances.find((b) => b.uid === user.uid);
      if (!me) continue;
      totalPaid += me.paid;
      if (me.net < 0) totalOwed += -me.net;
      else totalReceivable += me.net;
    }
    return {
      totalPaid: Math.round(totalPaid * 100) / 100,
      totalOwed: Math.round(totalOwed * 100) / 100,
      totalReceivable: Math.round(totalReceivable * 100) / 100,
    };
  }, [rows, user]);

  const recentExpenses = useMemo(() => {
    const items: { groupId: string; groupName: string; expense: ExpenseDoc }[] = [];
    for (const id of Object.keys(rows)) {
      const row = rows[id]!;
      for (const e of row.expenses) {
        items.push({ groupId: id, groupName: row.group.name, expense: e });
      }
    }
    return items
      .sort(
        (a, b) => expenseDateMillis(b.expense) - expenseDateMillis(a.expense)
      )
      .slice(0, 6);
  }, [rows]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Hey {user?.name?.split(" ")[0] || "there"} 👋
          </h1>
          <p className="text-sm text-muted-foreground">
            Here&apos;s what&apos;s happening across your trips.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/trips/new" aria-label="Create a new trip">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New trip</span>
          </Link>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="You paid"
          value={formatMoney(totals.totalPaid)}
          tone="muted"
        />
        <StatCard
          label="You owe"
          value={formatMoney(totals.totalOwed)}
          tone={totals.totalOwed > 0 ? "down" : "muted"}
          icon={<ArrowDownLeft className="h-4 w-4" />}
        />
        <StatCard
          label="You're owed"
          value={formatMoney(totals.totalReceivable)}
          tone={totals.totalReceivable > 0 ? "up" : "muted"}
          icon={<ArrowUpRight className="h-4 w-4" />}
        />
      </div>

      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold">Active trips</h2>
            <p className="text-sm text-muted-foreground">
              Tap a trip to add expenses or settle up.
            </p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/trips">
              View all <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : groups.length === 0 ? (
          <EmptyTrips />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {groups.slice(0, 4).map((g) => (
              <TripCard key={g.id} group={g} currentUid={user?.uid || ""} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold">Recent expenses</h2>
            <p className="text-sm text-muted-foreground">
              The latest activity across all your trips.
            </p>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            {recentExpenses.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No expenses yet — add one inside any trip.
              </div>
            ) : (
              <ul className="divide-y">
                {recentExpenses.map(({ expense, groupId, groupName }) => (
                  <li
                    key={expense.id}
                    className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-accent/40"
                  >
                    <Link
                      href={`/trips/${groupId}`}
                      className="flex min-w-0 flex-1 items-center gap-3"
                    >
                      <span className="grid h-9 w-9 place-items-center rounded-xl bg-secondary text-base">
                        {emojiFor(expense.category)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {expense.title}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {groupName}
                          {expenseDateMillis(expense) > 0 ? (
                            <>
                              {" · "}
                              {formatRelativeTime(expenseDateMillis(expense))}
                            </>
                          ) : null}
                        </p>
                      </div>
                    </Link>
                    <Badge variant="outline" className="font-mono">
                      {formatMoney(expense.amount, expense.currency)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone: "up" | "down" | "muted";
  icon?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-1.5">
          {icon} {label}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p
          className={
            tone === "up"
              ? "text-2xl font-semibold tracking-tight text-success"
              : tone === "down"
                ? "text-2xl font-semibold tracking-tight text-destructive"
                : "text-2xl font-semibold tracking-tight"
          }
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function EmptyTrips() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary">
          <Plane className="h-6 w-6 text-muted-foreground" />
        </span>
        <div>
          <p className="font-medium">No trips yet</p>
          <p className="text-sm text-muted-foreground">
            Create a trip to start splitting expenses with friends.
          </p>
        </div>
        <Button asChild>
          <Link href="/trips/new">
            <Plus className="h-4 w-4" /> Create trip
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function emojiFor(category: string) {
  switch (category) {
    case "food":
      return "🍔";
    case "fuel":
      return "⛽";
    case "hotel":
      return "🏨";
    case "shopping":
      return "🛍️";
    case "transport":
      return "🚕";
    case "alcohol":
      return "🍻";
    default:
      return "🧾";
  }
}
