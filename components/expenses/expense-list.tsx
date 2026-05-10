"use client";

import { useMemo, useState } from "react";
import { MoreHorizontal, Pencil, Trash2, Eye, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CategoryIcon, EXPENSE_CATEGORIES, categoryLabel } from "@/components/expenses/category-icon";
import { formatMoney } from "@/lib/currency";
import { formatRelativeTime } from "@/lib/utils";
import type { ExpenseDoc, GroupDoc } from "@/lib/firebase/types";

interface Props {
  group: GroupDoc;
  expenses: ExpenseDoc[];
  currentUid: string;
  onEdit: (e: ExpenseDoc) => void;
  onDelete: (e: ExpenseDoc) => void;
  onView: (e: ExpenseDoc) => void;
}

type Sort = "date-desc" | "date-asc" | "amount-desc" | "amount-asc";

export function ExpenseList({
  group,
  expenses,
  currentUid,
  onEdit,
  onDelete,
  onView,
}: Props) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [member, setMember] = useState<string>("all");
  const [sort, setSort] = useState<Sort>("date-desc");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = expenses.filter((e) => {
      if (q && !e.title.toLowerCase().includes(q) && !e.notes.toLowerCase().includes(q))
        return false;
      if (category !== "all" && e.category !== category) return false;
      if (
        member !== "all" &&
        e.paidBy !== member &&
        !e.participants.includes(member)
      )
        return false;
      return true;
    });
    out = out.slice().sort((a, b) => {
      switch (sort) {
        case "date-asc":
          return (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0);
        case "amount-desc":
          return b.amount - a.amount;
        case "amount-asc":
          return a.amount - b.amount;
        case "date-desc":
        default:
          return (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0);
      }
    });
    return out;
  }, [expenses, search, category, member, sort]);

  const isAdmin = group.members.find((m) => m.uid === currentUid)?.role === "admin";

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search expenses..."
            className="pl-9"
          />
        </div>
        <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-row sm:gap-2">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-full sm:w-[140px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {EXPENSE_CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.emoji} {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={member} onValueChange={setMember}>
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder="Member" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All members</SelectItem>
              {group.members.map((m) => (
                <SelectItem key={m.uid} value={m.uid}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
            <SelectTrigger className="w-full sm:w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date-desc">Newest first</SelectItem>
              <SelectItem value="date-asc">Oldest first</SelectItem>
              <SelectItem value="amount-desc">Amount: high → low</SelectItem>
              <SelectItem value="amount-asc">Amount: low → high</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No expenses match these filters yet.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {filtered.map((e) => {
            const payer = group.members.find((m) => m.uid === e.paidBy);
            const yourShare =
              e.splitValues.find((s) => s.uid === currentUid)?.owed ?? 0;
            const youPaid = e.paidBy === currentUid;
            const canModify = isAdmin || e.createdBy === currentUid;
            return (
              <li key={e.id}>
                <Card className="overflow-hidden transition-colors hover:bg-accent/30">
                  <CardContent className="flex items-center gap-3 p-3 sm:p-4">
                    <CategoryIcon category={e.category} />
                    <button
                      onClick={() => onView(e)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium">{e.title}</p>
                        <Badge variant="outline" className="hidden sm:inline-flex">
                          {categoryLabel(e.category)}
                        </Badge>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {payer ? `${payer.name} paid` : "Paid"}
                        {" · "}
                        {e.participants.length} {e.participants.length === 1 ? "person" : "people"}
                        {e.createdAt?.toMillis ? (
                          <>
                            {" · "}
                            {formatRelativeTime(e.createdAt.toMillis())}
                          </>
                        ) : null}
                      </p>
                    </button>
                    <div className="text-right">
                      <p className="text-sm font-semibold">
                        {formatMoney(e.amount, e.currency)}
                      </p>
                      <p
                        className={
                          youPaid
                            ? "text-xs text-success"
                            : yourShare > 0
                              ? "text-xs text-destructive"
                              : "text-xs text-muted-foreground"
                        }
                      >
                        {youPaid
                          ? `you paid ${formatMoney(e.amount, e.currency)}`
                          : yourShare > 0
                            ? `you owe ${formatMoney(yourShare, e.currency)}`
                            : "not in split"}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onView(e)}>
                          <Eye className="h-4 w-4" /> View details
                        </DropdownMenuItem>
                        {canModify && (
                          <>
                            <DropdownMenuItem onClick={() => onEdit(e)}>
                              <Pencil className="h-4 w-4" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => onDelete(e)}
                            >
                              <Trash2 className="h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
