"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CategoryIcon, categoryLabel } from "@/components/expenses/category-icon";
import { formatMoney } from "@/lib/currency";
import { formatDateTime, initials } from "@/lib/utils";
import { expenseDateMillis } from "@/lib/expense-date";
import type { ExpenseDoc, GroupDoc, SplitType } from "@/lib/firebase/types";

const SPLIT_LABEL: Record<SplitType, string> = {
  equal: "Split equally",
  exact: "Exact amounts",
  percent: "Percentage split",
  share: "Shares-based",
  personal: "Personal expense",
};

export function ExpenseDetails({
  group,
  expense,
  open,
  onOpenChange,
}: {
  group: GroupDoc;
  expense: ExpenseDoc | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  if (!expense) return null;
  const payer = group.members.find((m) => m.uid === expense.paidBy);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <CategoryIcon category={expense.category} size="lg" />
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate">{expense.title}</DialogTitle>
              <DialogDescription>
                {categoryLabel(expense.category)}
                {expenseDateMillis(expense) > 0 ? (
                  <> · {formatDateTime(expenseDateMillis(expense))}</>
                ) : null}
              </DialogDescription>
            </div>
            <div className="text-right">
              <p className="text-xl font-semibold">
                {formatMoney(expense.amount, expense.currency)}
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
            <Avatar className="h-9 w-9">
              {payer?.photoURL && (
                <AvatarImage src={payer.photoURL} alt={payer.name} />
              )}
              <AvatarFallback className="text-xs">
                {initials(payer?.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm">
                <span className="font-medium">{payer?.name || "Someone"}</span>{" "}
                paid
              </p>
              <p className="text-xs text-muted-foreground">
                {SPLIT_LABEL[expense.splitType]}
              </p>
            </div>
            <Badge variant="outline" className="ml-auto">
              {expense.participants.length}{" "}
              {expense.participants.length === 1 ? "person" : "people"}
            </Badge>
          </div>

          <div className="rounded-xl border">
            <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
              Split breakdown
            </div>
            <ul className="divide-y">
              {expense.splitValues.map((sv) => {
                const m = group.members.find((mm) => mm.uid === sv.uid);
                return (
                  <li
                    key={sv.uid}
                    className="flex items-center gap-3 px-3 py-2"
                  >
                    <Avatar className="h-7 w-7">
                      {m?.photoURL && (
                        <AvatarImage src={m.photoURL} alt={m.name} />
                      )}
                      <AvatarFallback className="text-[10px]">
                        {initials(m?.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="flex-1 truncate text-sm">
                      {m?.name || "Removed member"}
                    </span>
                    {expense.splitType === "percent" && (
                      <span className="text-xs text-muted-foreground">
                        {sv.value}%
                      </span>
                    )}
                    {expense.splitType === "share" && (
                      <span className="text-xs text-muted-foreground">
                        {sv.value}{" "}
                        {sv.value === 1 ? "share" : "shares"}
                      </span>
                    )}
                    <span className="font-mono text-sm">
                      {formatMoney(sv.owed, expense.currency)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          {expense.notes && (
            <div className="rounded-xl border p-3 text-sm">
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                Notes
              </p>
              <p className="whitespace-pre-wrap">{expense.notes}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
