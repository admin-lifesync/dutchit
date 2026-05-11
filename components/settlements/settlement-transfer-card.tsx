"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatMoney } from "@/lib/currency";
import { initials } from "@/lib/utils";
import type { GroupDoc } from "@/lib/firebase/types";
import type { Transfer } from "@/lib/balance/calculate";

export function settlementTransferKey(t: Transfer): string {
  return `${t.fromUid}:${t.toUid}:${t.amount}`;
}

interface Props {
  group: GroupDoc;
  transfer: Transfer;
  currency: string;
  involvesYou: boolean;
  isRecording: boolean;
  onMarkPaid: () => void;
}

export function SettlementTransferCard({
  group,
  transfer,
  currency,
  involvesYou,
  isRecording,
  onMarkPaid,
}: Props) {
  const from = group.members.find((m) => m.uid === transfer.fromUid);
  const to = group.members.find((m) => m.uid === transfer.toUid);
  const fromName = from?.name ?? "Member";
  const toName = to?.name ?? "Member";

  return (
    <div className="flex min-w-0 flex-col gap-4 rounded-2xl border bg-card p-4 shadow-sm">
      {/* Row 1: payer → payee (readable names, wrap) */}
      <div className="flex min-w-0 items-start gap-3">
        <Avatar className="mt-0.5 h-10 w-10 shrink-0">
          {from?.photoURL && (
            <AvatarImage src={from.photoURL} alt={fromName} />
          )}
          <AvatarFallback className="text-xs">{initials(fromName)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="break-words text-sm font-semibold leading-snug text-foreground">
              {fromName}
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
              <ArrowRight className="size-3.5" aria-hidden />
              owes
            </span>
            <span className="break-words text-sm font-semibold leading-snug text-foreground">
              {toName}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Avatar className="h-7 w-7 shrink-0">
              {to?.photoURL && (
                <AvatarImage src={to.photoURL} alt={toName} />
              )}
              <AvatarFallback className="text-[10px]">{initials(toName)}</AvatarFallback>
            </Avatar>
            <p className="min-w-0 text-xs leading-relaxed text-muted-foreground">
              Pay <span className="font-medium text-foreground">{toName}</span> so
              your group balances move toward even.
              {involvesYou ? " This line involves you." : ""}
            </p>
          </div>
        </div>
      </div>

      {/* Row 2: amount + action */}
      <div className="flex min-w-0 flex-col gap-3 border-t pt-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Amount
          </p>
          <p className="font-mono text-xl font-semibold tabular-nums tracking-tight">
            {formatMoney(transfer.amount, currency)}
          </p>
        </div>
        <Button
          type="button"
          variant="default"
          className="h-11 w-full min-w-[9.5rem] shrink-0 touch-manipulation sm:h-10 sm:w-auto sm:min-w-[10rem]"
          disabled={isRecording}
          aria-busy={isRecording}
          onClick={onMarkPaid}
        >
          {isRecording ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            "Mark paid"
          )}
        </Button>
      </div>
    </div>
  );
}
