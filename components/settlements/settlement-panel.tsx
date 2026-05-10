"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useAuth } from "@/components/auth/auth-provider";
import type {
  GroupDoc,
  SettlementDoc,
} from "@/lib/firebase/types";
import type { MemberBalance, Transfer } from "@/lib/balance/calculate";

interface Props {
  group: GroupDoc;
  balances: MemberBalance[];
  transfers: Transfer[];
  settlements: SettlementDoc[];
}

export function SettlementPanel({
  group,
  balances,
  transfers,
  settlements,
}: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [pending, setPending] = useState<Transfer | null>(null);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Suggested settlements</CardTitle>
          <CardDescription>
            We minimize transfers — settle these and everyone&apos;s even.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {transfers.length === 0 ? (
            <div className="flex items-center gap-3 rounded-xl border border-dashed bg-card/50 p-4 text-sm">
              <CheckCircle2 className="h-5 w-5 text-success" />
              <p className="text-muted-foreground">
                All settled up. Nothing to pay.
              </p>
            </div>
          ) : (
            transfers.map((t, i) => {
              const from = group.members.find((m) => m.uid === t.fromUid);
              const to = group.members.find((m) => m.uid === t.toUid);
              const involvesMe = user?.uid === t.fromUid || user?.uid === t.toUid;
              return (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-xl border bg-card p-3"
                >
                  <MemberCircle name={from?.name} photoURL={from?.photoURL} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      <span className="font-medium">{from?.name}</span>{" "}
                      <ArrowRight className="mx-1 inline h-3 w-3 text-muted-foreground" />{" "}
                      <span className="font-medium">{to?.name}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {involvesMe ? "Involves you" : "Suggested transfer"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm font-semibold">
                      {formatMoney(t.amount, group.currency)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPending(t)}
                  >
                    Mark paid
                  </Button>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Member balances</CardTitle>
          <CardDescription>
            Net = total paid minus total owed across this trip.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {balances.map((b) => {
              const m = group.members.find((mm) => mm.uid === b.uid);
              return (
                <li key={b.uid} className="flex items-center gap-3 py-2.5">
                  <MemberCircle name={m?.name} photoURL={m?.photoURL} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {m?.name || "Removed member"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      paid {formatMoney(b.paid, group.currency)} · owes{" "}
                      {formatMoney(b.owed, group.currency)}
                    </p>
                  </div>
                  <span
                    className={
                      b.net > 0.01
                        ? "font-mono text-sm font-semibold text-success"
                        : b.net < -0.01
                          ? "font-mono text-sm font-semibold text-destructive"
                          : "font-mono text-sm font-semibold text-muted-foreground"
                    }
                  >
                    {b.net > 0 ? "+" : ""}
                    {formatMoney(b.net, group.currency)}
                  </span>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Settlement history</CardTitle>
          <CardDescription>
            Cash transfers logged in this trip.
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
                  <li key={s.id} className="flex items-center gap-3 py-2.5">
                    <CheckCircle2 className="h-5 w-5 text-success" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">
                        <span className="font-medium">{from?.name}</span> paid{" "}
                        <span className="font-medium">{to?.name}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {s.createdAt?.toMillis ? formatRelativeTime(s.createdAt.toMillis()) : ""}
                        {s.note ? ` · ${s.note}` : ""}
                      </p>
                    </div>
                    <span className="font-mono text-sm font-semibold">
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
          }
        }}
      />
    </div>
  );
}

function MemberCircle({
  name,
  photoURL,
}: {
  name?: string | null;
  photoURL?: string | null;
}) {
  return (
    <Avatar className="h-9 w-9">
      {photoURL && <AvatarImage src={photoURL} alt={name || ""} />}
      <AvatarFallback className="text-xs">{initials(name)}</AvatarFallback>
    </Avatar>
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

  // Reset values whenever a new transfer is requested.
  if (open && amount === "") setAmount(String(transfer!.amount));

  const from = transfer ? group.members.find((m) => m.uid === transfer.fromUid) : null;
  const to = transfer ? group.members.find((m) => m.uid === transfer.toUid) : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          setAmount("");
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record settlement</DialogTitle>
          <DialogDescription>
            Confirm that {from?.name} paid {to?.name}.
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
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={submitting || !Number(amount)}
            onClick={async () => {
              setSubmitting(true);
              try {
                await onConfirm(Number(amount), note.trim());
              } finally {
                setSubmitting(false);
                setAmount("");
              }
            }}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Mark as paid
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
