"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Download, Receipt, TrendingUp, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { categoryLabel } from "@/components/expenses/category-icon";
import { formatMoney } from "@/lib/currency";
import { formatDate, initials } from "@/lib/utils";
import { handleError } from "@/lib/errors/handle-error";
import { useToast } from "@/hooks/use-toast";
import { buildTripReport, type PersonReport, type TripReport } from "@/lib/report/build";
import type { ExpenseDoc, GroupDoc, SettlementDoc } from "@/lib/firebase/types";

interface Props {
  group: GroupDoc;
  expenses: ExpenseDoc[];
  settlements: SettlementDoc[];
  currentUid: string;
}

export function ReportPanel({ group, expenses, settlements, currentUid }: Props) {
  const report = useMemo(
    () => buildTripReport(group, expenses, settlements),
    [group, expenses, settlements]
  );
  const { toast } = useToast();

  if (expenses.length === 0) {
    return (
      <Card>
        <CardContent className="space-y-2 p-8 text-center text-sm text-muted-foreground">
          <p className="font-medium text-foreground">No data to report yet</p>
          <p>
            Add a few expenses and the breakdown by person and category will
            show up here.
          </p>
        </CardContent>
      </Card>
    );
  }

  const handleExport = () => {
    try {
      const csv = reportToCsv(report, group.currency);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slug(group.name)}-report.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Report exported", variant: "success" });
    } catch (e) {
      handleError(e, { domain: "generic", context: { action: "report.export" } });
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="space-y-3 p-4 text-sm leading-relaxed">
          <p className="text-muted-foreground">
            Together you logged{" "}
            <span className="font-semibold text-foreground">
              {report.expenseCount} expense
              {report.expenseCount === 1 ? "" : "s"}
            </span>{" "}
            for a combined{" "}
            <span className="font-semibold text-foreground">
              {formatMoney(report.totalSpent, group.currency)}
            </span>
            . Below is who actually paid from their pocket, what the trip
            cost each person after splits, and who is still up or down.
          </p>
          <ul className="space-y-2 border-t border-primary/10 pt-3">
            {report.people.map((p) => (
              <li key={p.uid} className="text-sm">
                <span className="font-medium text-foreground">{p.name}</span>
                {p.uid === currentUid ? (
                  <Badge variant="secondary" className="ml-1.5 align-middle text-[10px]">
                    you
                  </Badge>
                ) : null}
                {" — "}
                <span className="text-muted-foreground">
                  paid{" "}
                  <span className="font-semibold text-foreground">
                    {formatMoney(p.totalPaid, group.currency)}
                  </span>{" "}
                  for the group on this trip. After splits,{" "}
                  <span className="font-semibold text-foreground">
                    this trip cost them {formatMoney(p.totalShare, group.currency)}
                  </span>{" "}
                  in total
                  {p.net > 0.01 && (
                    <>
                      ; they should get back about{" "}
                      <span className="font-semibold text-success">
                        {formatMoney(p.net, group.currency)}
                      </span>
                    </>
                  )}
                  {p.net < -0.01 && (
                    <>
                      ; they still owe about{" "}
                      <span className="font-semibold text-destructive">
                        {formatMoney(-p.net, group.currency)}
                      </span>
                    </>
                  )}
                  {Math.abs(p.net) <= 0.01 && " (balanced for now)"}
                  .
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          icon={<Wallet className="h-4 w-4" />}
          label="Everyone spent"
          value={formatMoney(report.totalSpent, group.currency)}
          sub={`That is the full trip bill across ${report.expenseCount} expense${report.expenseCount === 1 ? "" : "s"}.`}
        />
        <SummaryCard
          icon={<Receipt className="h-4 w-4" />}
          label="Paid back so far"
          value={formatMoney(report.totalSettlements, group.currency)}
          sub={
            report.totalSettlements > 0
              ? "Recorded in Settle up — money that already changed hands."
              : "No settlement transfers logged yet."
          }
        />
        <SummaryCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Largest single expense"
          value={
            report.largestExpense
              ? formatMoney(report.largestExpense.amount, group.currency)
              : "—"
          }
          sub={report.largestExpense?.title || "—"}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <div>
            <CardTitle className="text-base">Where the money went</CardTitle>
            <p className="text-xs text-muted-foreground">
              Categories as a share of the total trip cost.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {report.byCategory.map((c) => {
            const pct = report.totalSpent > 0
              ? (c.amount / report.totalSpent) * 100
              : 0;
            return (
              <div key={c.category} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span>{categoryLabel(c.category)}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatMoney(c.amount, group.currency)} · {pct.toFixed(1)}%
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(2, pct)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Each person, line by line</CardTitle>
          <p className="text-xs text-muted-foreground">
            Open someone to see every expense that affected their totals.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y">
            {report.people.map((p) => (
              <PersonRow
                key={p.uid}
                person={p}
                currency={group.currency}
                isMe={p.uid === currentUid}
              />
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          {icon}
          {label}
        </div>
        <p className="mt-1 text-xl font-semibold">{value}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

function PersonRow({
  person,
  currency,
  isMe,
}: {
  person: PersonReport;
  currency: string;
  isMe: boolean;
}) {
  const [open, setOpen] = useState(false);
  const netTone =
    person.net > 0.01 ? "text-success" : person.net < -0.01 ? "text-destructive" : "text-muted-foreground";
  const netHuman =
    person.net > 0.01
      ? "Should get back"
      : person.net < -0.01
        ? "Still owes"
        : "Balanced";

  return (
    <li>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/30"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <Avatar className="h-9 w-9 shrink-0">
          {person.photoURL && <AvatarImage src={person.photoURL} alt={person.name} />}
          <AvatarFallback className="text-xs">
            {initials(person.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground">
              {person.name}
              {isMe && (
                <Badge variant="secondary" className="ml-1 align-middle text-[10px]">
                  you
                </Badge>
              )}
            </p>
          </div>
          <p className="mt-1 text-sm leading-snug text-muted-foreground">
            <span className="font-medium text-foreground">{person.name}</span> put{" "}
            <span className="font-semibold text-foreground">
              {formatMoney(person.totalPaid, currency)}
            </span>{" "}
            on the tab for this trip.
          </p>
          <p className="mt-1 text-sm leading-snug text-muted-foreground">
            After everyone&apos;s share is counted,{" "}
            <span className="font-semibold text-foreground">
              this trip cost them {formatMoney(person.totalShare, currency)}
            </span>{" "}
            in total — that is their full &quot;fair share&quot; of the bill.
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-sm font-semibold ${netTone}`}>
            {formatMoney(Math.abs(person.net), currency)}
          </p>
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {netHuman}
          </p>
        </div>
      </button>

      {open && (
        <div className="space-y-3 border-t bg-muted/20 px-4 py-3">
          {person.byCategory.length > 0 && (
            <div>
              <p className="mb-1 text-sm font-medium text-foreground">
                How their {formatMoney(person.totalShare, currency)} share breaks down
              </p>
              <p className="mb-2 text-xs text-muted-foreground">
                By category — what portion of their total trip cost went where.
              </p>
              <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {person.byCategory.map((c) => (
                  <li
                    key={c.category}
                    className="flex items-center justify-between rounded-md bg-background px-2 py-1 text-xs"
                  >
                    <span className="truncate">{categoryLabel(c.category)}</span>
                    <span className="ml-2 font-mono text-muted-foreground">
                      {formatMoney(c.amount, currency)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <p className="mb-1 text-sm font-medium text-foreground">
              Every expense that involves {person.name}
            </p>
            <p className="mb-2 text-xs text-muted-foreground">
              {person.expenses.length} line
              {person.expenses.length === 1 ? "" : "s"} — what they paid vs. their slice.
            </p>
            {person.expenses.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No expenses involve this person yet.
              </p>
            ) : (
              <ul className="divide-y rounded-lg border bg-background">
                {person.expenses.map((e) => (
                  <li
                    key={e.expenseId + (e.paid ? "-paid" : "-share")}
                    className="flex items-center gap-3 px-3 py-2 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{e.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {categoryLabel(e.category)}
                        {e.date > 0 ? <> · {formatDate(e.date)}</> : null}
                      </p>
                    </div>
                    <div className="text-right">
                      {e.paid && (
                        <p className="font-mono text-success">
                          paid {formatMoney(e.amount, currency)}
                        </p>
                      )}
                      {e.share > 0 && (
                        <p className="font-mono text-muted-foreground">
                          their share {formatMoney(e.share, currency)}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {(person.settledOut > 0 || person.settledIn > 0) && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">Settlements: </span>
              {person.settledOut > 0 && (
                <>
                  they sent{" "}
                  <span className="font-semibold text-foreground">
                    {formatMoney(person.settledOut, currency)}
                  </span>
                </>
              )}
              {person.settledOut > 0 && person.settledIn > 0 && " and "}
              {person.settledIn > 0 && (
                <>
                  they received{" "}
                  <span className="font-semibold text-foreground">
                    {formatMoney(person.settledIn, currency)}
                  </span>
                </>
              )}
              {" "}through recorded transfers.
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function reportToCsv(report: TripReport, currency: string): string {
  const escape = (s: unknown) => {
    const str = String(s ?? "");
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const lines: string[] = [];
  lines.push("Section,Field,Value");
  lines.push(`Trip,Currency,${escape(currency)}`);
  lines.push(`Trip,Total spent,${escape(report.totalSpent)}`);
  lines.push(`Trip,Expense count,${escape(report.expenseCount)}`);
  lines.push(`Trip,Total settlements,${escape(report.totalSettlements)}`);
  lines.push("");
  lines.push("Category breakdown");
  lines.push("Category,Amount");
  for (const c of report.byCategory) {
    lines.push(`${escape(categoryLabel(c.category))},${escape(c.amount)}`);
  }
  lines.push("");
  lines.push("Per person summary");
  lines.push("Person,Paid,Share,Net,Settled out,Settled in");
  for (const p of report.people) {
    lines.push(
      [p.name, p.totalPaid, p.totalShare, p.net, p.settledOut, p.settledIn]
        .map(escape)
        .join(",")
    );
  }
  lines.push("");
  lines.push("Per person ledger");
  lines.push("Person,Date,Title,Category,Amount,Share,Paid?");
  for (const p of report.people) {
    for (const e of p.expenses) {
      lines.push(
        [
          p.name,
          e.date > 0 ? new Date(e.date).toISOString() : "",
          e.title,
          categoryLabel(e.category),
          e.amount,
          e.share,
          e.paid ? "yes" : "no",
        ]
          .map(escape)
          .join(",")
      );
    }
  }
  return lines.join("\n");
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32) || "report";
}
