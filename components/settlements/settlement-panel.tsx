"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  CircleHelp,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/currency";
import { initials, formatRelativeTime } from "@/lib/utils";
import { createSettlement } from "@/lib/firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { handleError } from "@/lib/errors/handle-error";
import { AppError } from "@/lib/errors/app-error";
import { ERROR_CODES } from "@/lib/errors/error-codes";
import { useAuth } from "@/components/auth/auth-provider";
import {
  directDebtTransfers,
  simplifyDebts,
  type MemberBalance,
  type Transfer,
} from "@/lib/balance/calculate";
import {
  SettlementTransferCard,
  settlementTransferKey,
} from "@/components/settlements/settlement-transfer-card";
import type { GroupDoc, SettlementDoc } from "@/lib/firebase/types";

export type SettlementViewMode = "direct" | "minimized";

interface Props {
  group: GroupDoc;
  balances: MemberBalance[];
  settlements: SettlementDoc[];
}

export function SettlementPanel({ group, balances, settlements }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [mode, setMode] = useState<SettlementViewMode>("direct");
  const [pending, setPending] = useState<Transfer | null>(null);
  const [recordingKey, setRecordingKey] = useState<string | null>(null);

  const isAdmin =
    group.members.find((m) => m.uid === user?.uid)?.role === "admin";

  const nameByUid = useMemo(() => {
    const o: Record<string, string> = {};
    for (const m of group.members) o[m.uid] = m.name;
    return o;
  }, [group.members]);

  const directTransfers = useMemo(
    () => directDebtTransfers(balances, nameByUid),
    [balances, nameByUid]
  );
  const minimizedTransfers = useMemo(
    () => simplifyDebts(balances),
    [balances]
  );

  const activeTransfers =
    mode === "direct" ? directTransfers : minimizedTransfers;

  const tryMarkPaid = useCallback(
    (t: Transfer) => {
      if (mode === "minimized" && !isAdmin) {
        handleError(
          new AppError(ERROR_CODES.STL_MINIMIZED_ADMIN_ONLY, {
            context: { groupId: group.id, mode },
          }),
          { domain: "settlement", context: { groupId: group.id } }
        );
        return;
      }
      setPending(t);
    },
    [group.id, isAdmin, mode]
  );

  return (
    <div className="space-y-6">
      {/* Sticky mode switch + context */}
      <div className="sticky top-0 z-20 -mx-1 space-y-3 border-b border-border/80 bg-background/95 px-1 pb-3 pt-1 backdrop-blur-md supports-[backdrop-filter]:bg-background/85">
        <div
          className="relative flex rounded-xl bg-muted p-1"
          role="tablist"
          aria-label="Settlement view"
        >
          <motion.div
            className="pointer-events-none absolute bottom-1 top-1 rounded-lg bg-background shadow-sm"
            initial={false}
            animate={{
              left: mode === "direct" ? 4 : "calc(50% + 2px)",
              width: "calc(50% - 6px)",
            }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
          />
          <button
            type="button"
            role="tab"
            aria-selected={mode === "direct"}
            className={`relative z-10 flex-1 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              mode === "direct"
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setMode("direct")}
          >
            Direct
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "minimized"}
            className={`relative z-10 flex-1 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              mode === "minimized"
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setMode("minimized")}
          >
            Minimized
          </button>
        </div>

        <div className="flex gap-2 rounded-xl border border-dashed bg-muted/30 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          <CircleHelp
            className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <div className="min-w-0 space-y-1">
            {mode === "direct" ? (
              <>
                <p className="font-medium text-foreground">
                  Direct settlements (default)
                </p>
                <p>
                  Uses everyone&apos;s real balances — who paid what vs. their
                  share — and lists pay-downs in a fixed name order. No
                  cross-group optimization; best when you want the clearest
                  picture of who owes whom.
                </p>
              </>
            ) : (
              <>
                <p className="font-medium text-foreground">
                  Minimized settlements
                </p>
                <p>
                  Fewer transfers by pairing the largest debts and credits
                  first. Great for closing a trip quickly, but the lines can
                  look different from Direct.{" "}
                  <span className="font-medium text-foreground">
                    Only group admins can record these as paid
                  </span>{" "}
                  so the simplified plan stays authoritative.
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Raw balances first */}
      <Card>
        <CardHeader>
          <CardTitle>Where everyone stands</CardTitle>
          <CardDescription>
            Original balances from expenses and any settlements already logged.
            Net = paid − owed (positive means the group still owes them).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {balances.map((b) => {
              const m = group.members.find((mm) => mm.uid === b.uid);
              const label =
                b.net > 0.01
                  ? "Should receive"
                  : b.net < -0.01
                    ? "Should pay in"
                    : "Even";
              return (
                <li
                  key={b.uid}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:gap-4"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <Avatar className="h-10 w-10 shrink-0">
                      {m?.photoURL && (
                        <AvatarImage src={m.photoURL} alt={m.name} />
                      )}
                      <AvatarFallback className="text-xs">
                        {initials(m?.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-semibold leading-snug">
                        {m?.name || "Removed member"}
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                        Paid {formatMoney(b.paid, group.currency)} out of pocket
                        · Owed {formatMoney(b.owed, group.currency)} as their
                        share of all expenses
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-start gap-0.5 pl-[3.25rem] sm:items-end sm:pl-0">
                    <span
                      className={
                        b.net > 0.01
                          ? "font-mono text-base font-semibold tabular-nums text-success"
                          : b.net < -0.01
                            ? "font-mono text-base font-semibold tabular-nums text-destructive"
                            : "font-mono text-base font-semibold tabular-nums text-muted-foreground"
                      }
                    >
                      {b.net > 0 ? "+" : ""}
                      {formatMoney(b.net, group.currency)}
                    </span>
                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {label}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {/* Suggested transfers for selected mode */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>
            {mode === "direct"
              ? "Direct payment lines"
              : "Minimized payment plan"}
          </CardTitle>
          <CardDescription>
            {mode === "direct"
              ? "Pay these amounts to move balances toward zero — no optimization across the group."
              : "Optimized list — usually fewer payments. Ask an admin to mark these paid."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {mode === "minimized" && !isAdmin && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-foreground">
              You can review minimized suggestions, but only a group admin can
              record them. Use{" "}
              <button
                type="button"
                className="font-semibold underline underline-offset-2"
                onClick={() => setMode("direct")}
              >
                Direct
              </button>{" "}
              to log a payment you made yourself.
            </p>
          )}

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="space-y-3"
            >
              {activeTransfers.length === 0 ? (
                <div className="flex items-center gap-3 rounded-xl border border-dashed bg-card/50 p-4 text-sm">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
                  <p className="min-w-0 leading-relaxed text-muted-foreground">
                    All settled up in this view — nothing left to pay.
                  </p>
                </div>
              ) : (
                activeTransfers.map((t, i) => {
                  const key = settlementTransferKey(t);
                  const involvesYou =
                    user?.uid === t.fromUid || user?.uid === t.toUid;
                  return (
                    <SettlementTransferCard
                      key={`${mode}-${i}-${key}`}
                      group={group}
                      transfer={t}
                      currency={group.currency}
                      involvesYou={!!involvesYou}
                      isRecording={recordingKey === key}
                      onMarkPaid={() => tryMarkPaid(t)}
                    />
                  );
                })
              )}
            </motion.div>
          </AnimatePresence>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Settlement history</CardTitle>
          <CardDescription>
            Cash or transfers you have already recorded for this trip.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {settlements.length === 0 ? (
            <p className="text-sm text-muted-foreground">No settlements yet.</p>
          ) : (
            <ul className="divide-y">
              {settlements.map((s) => {
                const from = group.members.find((m) => m.uid === s.fromUid);
                const to = group.members.find((m) => m.uid === s.toUid);
                return (
                  <li
                    key={s.id}
                    className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:gap-3"
                  >
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-sm leading-snug">
                        <span className="break-words font-medium">
                          {from?.name}
                        </span>{" "}
                        <span className="text-muted-foreground">paid</span>{" "}
                        <span className="break-words font-medium">
                          {to?.name}
                        </span>
                      </p>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {s.createdAt?.toMillis
                          ? formatRelativeTime(s.createdAt.toMillis())
                          : ""}
                        {s.note ? ` · ${s.note}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">
                      {formatMoney(s.amount, s.currency)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <RecordSettlementDialog
        group={group}
        transfer={pending}
        onClose={() => setPending(null)}
        onConfirm={async (amount, note) => {
          if (!pending || !user) return;
          if (mode === "minimized" && !isAdmin) {
            handleError(
              new AppError(ERROR_CODES.STL_MINIMIZED_ADMIN_ONLY, {
                context: { groupId: group.id },
              }),
              { domain: "settlement", context: { groupId: group.id } }
            );
            setPending(null);
            return;
          }
          const key = settlementTransferKey(pending);
          setRecordingKey(key);
          try {
            await createSettlement(
              {
                groupId: group.id,
                fromUid: pending.fromUid,
                toUid: pending.toUid,
                amount,
                currency: group.currency,
                note,
                createdBy: user.uid,
              },
              user.name
            );
            toast({ title: "Settlement recorded", variant: "success" });
            setPending(null);
          } catch (e) {
            handleError(e, {
              domain: "settlement",
              context: {
                groupId: group.id,
                fromUid: pending.fromUid,
                toUid: pending.toUid,
                amount,
              },
            });
          } finally {
            setRecordingKey(null);
          }
        }}
      />
    </div>
  );
}

function RecordSettlementDialog({
  group,
  transfer,
  onClose,
  onConfirm,
}: {
  group: GroupDoc;
  transfer: Transfer | null;
  onClose: () => void;
  onConfirm: (amount: number, note: string) => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("Cash settlement");
  const [submitting, setSubmitting] = useState(false);

  const open = !!transfer;

  useEffect(() => {
    if (transfer) {
      setAmount(String(transfer.amount));
      setNote("Cash settlement");
    } else {
      setAmount("");
    }
  }, [transfer]);

  const from = transfer
    ? group.members.find((m) => m.uid === transfer.fromUid)
    : null;
  const to = transfer
    ? group.members.find((m) => m.uid === transfer.toUid)
    : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !submitting) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-[min(100vw-1.5rem,28rem)] overflow-x-hidden sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record settlement</DialogTitle>
          <DialogDescription>
            Confirm that{" "}
            <span className="break-words font-medium text-foreground">
              {from?.name}
            </span>{" "}
            paid{" "}
            <span className="break-words font-medium text-foreground">
              {to?.name}
            </span>
            .
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="settlement-amount">
              Amount ({group.currency})
            </Label>
            <Input
              id="settlement-amount"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="settlement-note">Note</Label>
            <Input
              id="settlement-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={120}
            />
          </div>
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            disabled={submitting}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            className="w-full sm:w-auto"
            disabled={submitting || !Number(amount)}
            onClick={async () => {
              setSubmitting(true);
              try {
                await onConfirm(Number(amount), note.trim());
              } finally {
                setSubmitting(false);
              }
            }}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Mark as paid
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
