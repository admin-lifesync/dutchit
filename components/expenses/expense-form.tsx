"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CategoryIcon, EXPENSE_CATEGORIES } from "@/components/expenses/category-icon";
import { computeSplit } from "@/lib/splits/compute";
import { getCurrencySymbol } from "@/lib/currency";
import { initials, round2, sum, toDateTimeLocal } from "@/lib/utils";
import { expenseDate } from "@/lib/expense-date";
import { useToast } from "@/hooks/use-toast";
import { handleError } from "@/lib/errors/handle-error";
import { createExpense, updateExpense } from "@/lib/firebase/firestore";
import type {
  ExpenseCategory,
  ExpenseDoc,
  GroupDoc,
  SplitType,
} from "@/lib/firebase/types";
import { useAuth } from "@/components/auth/auth-provider";

interface Props {
  group: GroupDoc;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense?: ExpenseDoc | null;
}

const SPLIT_TABS: { value: SplitType; label: string }[] = [
  { value: "equal", label: "Equal" },
  { value: "exact", label: "Exact" },
  { value: "percent", label: "%" },
  { value: "share", label: "Shares" },
  { value: "personal", label: "Personal" },
];

/** Empty per-uid map. Each editable split type owns its own copy of this so
 *  switching tabs never bleeds values between, say, shares and percent. */
type ValueMap = Record<string, number>;
const EMPTY_VALUES: ValueMap = {};

export function ExpenseForm({ group, open, onOpenChange, expense }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const editing = !!expense;
  const [submitting, setSubmitting] = useState(false);

  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("misc");
  const [paidBy, setPaidBy] = useState<string>(user?.uid || "");
  const [participants, setParticipants] = useState<string[]>([]);
  const [splitType, setSplitType] = useState<SplitType>("equal");
  // One independent value map per editable split type. Switching tabs keeps
  // each one intact so users can experiment without losing what they typed.
  // Default for every uid is 0 (per UX requirement).
  const [exactValues, setExactValues] = useState<ValueMap>(EMPTY_VALUES);
  const [percentValues, setPercentValues] = useState<ValueMap>(EMPTY_VALUES);
  const [shareValues, setShareValues] = useState<ValueMap>(EMPTY_VALUES);
  const [personalUid, setPersonalUid] = useState<string>(user?.uid || "");
  const [notes, setNotes] = useState("");
  // Local-tz YYYY-MM-DDTHH:MM string. Empty means "use server time" (only on
  // first create; we still render today's date as the default in the input).
  const [dateLocal, setDateLocal] = useState<string>("");

  // Reset / hydrate when opened.
  useEffect(() => {
    if (!open) return;
    if (expense) {
      setTitle(expense.title);
      setAmount(String(expense.amount));
      setCategory(expense.category);
      setPaidBy(expense.paidBy);
      setParticipants(expense.participants);
      setSplitType(expense.splitType);
      // Hydrate the matching value map only — leave the others empty so the
      // user can switch tabs and start fresh from 0.
      const vals: ValueMap = {};
      expense.splitValues.forEach((v) => (vals[v.uid] = v.value));
      setExactValues(expense.splitType === "exact" ? vals : EMPTY_VALUES);
      setPercentValues(expense.splitType === "percent" ? vals : EMPTY_VALUES);
      setShareValues(expense.splitType === "share" ? vals : EMPTY_VALUES);
      setPersonalUid(expense.splitType === "personal" ? expense.participants[0] || "" : "");
      setNotes(expense.notes || "");
      setDateLocal(toDateTimeLocal(expenseDate(expense)));
    } else {
      setTitle("");
      setAmount("");
      setCategory("misc");
      setPaidBy(user?.uid || group.members[0]?.uid || "");
      const allIds = group.members.map((m) => m.uid);
      setParticipants(allIds);
      setSplitType("equal");
      setExactValues(EMPTY_VALUES);
      setPercentValues(EMPTY_VALUES);
      setShareValues(EMPTY_VALUES);
      setPersonalUid(user?.uid || "");
      setNotes("");
      setDateLocal(toDateTimeLocal(new Date()));
    }
  }, [open, expense, group, user]);

  const numericAmount = Number(amount);
  const amountValid = Number.isFinite(numericAmount) && numericAmount > 0;

  // Pick the right value map (and setter) for the active split type.
  const activeValues =
    splitType === "exact"
      ? exactValues
      : splitType === "percent"
      ? percentValues
      : splitType === "share"
      ? shareValues
      : EMPTY_VALUES;

  const setActiveValue = useCallback(
    (uid: string, v: number) => {
      const next = (prev: ValueMap) => ({ ...prev, [uid]: v });
      if (splitType === "exact") setExactValues(next);
      else if (splitType === "percent") setPercentValues(next);
      else if (splitType === "share") setShareValues(next);
    },
    [splitType]
  );

  const splitResult = useMemo(() => {
    if (!amountValid) return null;
    return computeSplit({
      amount: numericAmount,
      splitType,
      participants:
        splitType === "personal" ? [personalUid].filter(Boolean) : participants,
      values: activeValues,
      personalUid,
    });
  }, [
    amountValid,
    numericAmount,
    splitType,
    participants,
    activeValues,
    personalUid,
  ]);

  const totalAssigned = useMemo(() => {
    if (!splitResult) return 0;
    return round2(sum(splitResult.splitValues.map((v) => v.owed)));
  }, [splitResult]);

  function toggleParticipant(uid: string) {
    setParticipants((prev) =>
      prev.includes(uid) ? prev.filter((p) => p !== uid) : [...prev, uid]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!title.trim()) {
      toast({ title: "Add a title for this expense", variant: "destructive" });
      return;
    }
    if (!amountValid) {
      toast({ title: "Enter a valid amount", variant: "destructive" });
      return;
    }
    if (!paidBy) {
      toast({ title: "Pick who paid", variant: "destructive" });
      return;
    }
    if (!splitResult || splitResult.error) {
      toast({
        title: "Fix split values",
        description: splitResult?.error || "Split totals don't match.",
        variant: "destructive",
      });
      return;
    }
    try {
      setSubmitting(true);
      const pickedDate = dateLocal ? new Date(dateLocal) : null;
      const payload = {
        groupId: group.id,
        title: title.trim(),
        amount: round2(numericAmount),
        currency: group.currency,
        paidBy,
        participants:
          splitType === "personal"
            ? [personalUid]
            : participants.slice(),
        splitType,
        splitValues: splitResult.splitValues,
        category,
        notes: notes.trim(),
        receiptURL: null,
        createdBy: editing ? expense!.createdBy : user.uid,
        date: pickedDate && !Number.isNaN(pickedDate.getTime()) ? pickedDate : null,
      };
      if (editing && expense) {
        await updateExpense(group.id, expense.id, payload, {
          uid: user.uid,
          name: user.name,
        });
        toast({ title: "Expense updated", variant: "success" });
      } else {
        await createExpense(payload, user.name);
        toast({ title: "Expense added", variant: "success" });
      }
      onOpenChange(false);
    } catch (e) {
      handleError(e, {
        domain: "expense",
        context: { groupId: group.id, expenseId: expense?.id ?? null },
      });
    } finally {
      setSubmitting(false);
    }
  }

  const symbol = getCurrencySymbol(group.currency);
  const splitParticipants =
    splitType === "personal" ? [personalUid].filter(Boolean) : participants;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(100vw-1.5rem,36rem)] overflow-x-hidden sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit expense" : "Add expense"}</DialogTitle>
          <DialogDescription>
            All splits update in real time. We&apos;ll validate before saving.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Dinner at Sea Hut"
                required
                maxLength={64}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount ({symbol})</Label>
              <Input
                id="amount"
                inputMode="decimal"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                required
              />
            </div>
          </div>

          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <div className="min-w-0 space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as ExpenseCategory)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.emoji} {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label>Paid by</Label>
              <Select value={paidBy} onValueChange={setPaidBy}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select payer" />
                </SelectTrigger>
                <SelectContent>
                  {group.members.map((m) => (
                    <SelectItem key={m.uid} value={m.uid}>
                      {m.name} {m.uid === user?.uid ? "(you)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-1.5 sm:col-span-2">
              <Label htmlFor="date">Date & time</Label>
              <p className="text-xs text-muted-foreground">
                When the expense happened (defaults to right now).
              </p>
              <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-stretch">
                <Input
                  id="date"
                  type="datetime-local"
                  value={dateLocal}
                  onChange={(e) => setDateLocal(e.target.value)}
                  max={toDateTimeLocal(new Date(Date.now() + 60 * 60 * 1000))}
                  className="h-10 w-full min-w-0 max-w-full flex-1 font-mono text-sm tabular-nums"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 w-full shrink-0 sm:w-auto sm:px-4"
                  onClick={() => setDateLocal(toDateTimeLocal(new Date()))}
                  title="Reset to now"
                >
                  Now
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Split</Label>
              <span className="text-xs text-muted-foreground">
                {amountValid && splitType !== "personal" ? (
                  <>
                    {symbol}
                    {totalAssigned} of {symbol}
                    {round2(numericAmount)} assigned
                  </>
                ) : null}
              </span>
            </div>
            <Tabs value={splitType} onValueChange={(v) => setSplitType(v as SplitType)}>
              <TabsList className="w-full justify-between">
                {SPLIT_TABS.map((t) => (
                  <TabsTrigger key={t.value} value={t.value} className="flex-1">
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            {splitType === "personal" ? (
              <PersonalSplit
                group={group}
                personalUid={personalUid}
                setPersonalUid={setPersonalUid}
              />
            ) : (
              <GroupSplit
                group={group}
                splitType={splitType}
                participants={participants}
                values={activeValues}
                amount={numericAmount}
                splitValues={splitResult?.splitValues || []}
                onToggle={toggleParticipant}
                onChangeValue={setActiveValue}
                symbol={symbol}
              />
            )}

            {splitResult?.error && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {splitResult.error}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything worth remembering..."
              maxLength={300}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || splitParticipants.length === 0}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "Save changes" : "Add expense"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PersonalSplit({
  group,
  personalUid,
  setPersonalUid,
}: {
  group: GroupDoc;
  personalUid: string;
  setPersonalUid: (u: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs text-muted-foreground">
        Personal expense — only one person carries the full amount.
      </p>
      <Select value={personalUid} onValueChange={setPersonalUid}>
        <SelectTrigger>
          <SelectValue placeholder="Pick a person" />
        </SelectTrigger>
        <SelectContent>
          {group.members.map((m) => (
            <SelectItem key={m.uid} value={m.uid}>
              {m.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function GroupSplit({
  group,
  splitType,
  participants,
  values,
  amount,
  splitValues,
  onToggle,
  onChangeValue,
  symbol,
}: {
  group: GroupDoc;
  splitType: SplitType;
  participants: string[];
  values: Record<string, number>;
  amount: number;
  splitValues: import("@/lib/firebase/types").SplitValue[];
  onToggle: (uid: string) => void;
  onChangeValue: (uid: string, value: number) => void;
  symbol: string;
}) {
  return (
    <div className="space-y-1.5 rounded-xl border p-2">
      {group.members.map((m) => {
        const checked = participants.includes(m.uid);
        const computed = splitValues.find((s) => s.uid === m.uid)?.owed ?? 0;
        return (
          <div
            key={m.uid}
            className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent/40"
          >
            <input
              type="checkbox"
              className="h-4 w-4 cursor-pointer accent-primary"
              checked={checked}
              onChange={() => onToggle(m.uid)}
              aria-label={`Include ${m.name}`}
            />
            <Avatar className="h-7 w-7">
              {m.photoURL && <AvatarImage src={m.photoURL} alt={m.name} />}
              <AvatarFallback className="text-[10px]">
                {initials(m.name)}
              </AvatarFallback>
            </Avatar>
            <span className="flex-1 truncate text-sm">{m.name}</span>

            {!checked ? (
              <span className="text-xs text-muted-foreground">excluded</span>
            ) : splitType === "equal" ? (
              <span className="font-mono text-xs text-muted-foreground">
                {symbol}
                {computed.toFixed(2)}
              </span>
            ) : (
              <SplitValueInput
                splitType={splitType}
                value={values[m.uid] ?? 0}
                onChange={(v) => onChangeValue(m.uid, v)}
                computed={computed}
                amount={amount}
                symbol={symbol}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function SplitValueInput({
  splitType,
  value,
  onChange,
  computed,
  amount,
  symbol,
}: {
  splitType: SplitType;
  value: number;
  onChange: (v: number) => void;
  computed: number;
  amount: number;
  symbol: string;
}) {
  const suffix =
    splitType === "percent" ? "%" : splitType === "share" ? "sh" : symbol;
  return (
    <div className="flex items-center gap-2">
      <div className="relative w-24">
        <Input
          type="number"
          inputMode="decimal"
          step={splitType === "share" ? 1 : 0.01}
          min={0}
          value={value || ""}
          onChange={(e) => onChange(Number(e.target.value || 0))}
          className="h-9 pr-8 text-right text-sm"
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          {suffix}
        </span>
      </div>
      {(splitType === "percent" || splitType === "share") && amount > 0 && (
        <span className="hidden w-16 text-right font-mono text-xs text-muted-foreground sm:inline">
          {symbol}
          {computed.toFixed(2)}
        </span>
      )}
    </div>
  );
}
