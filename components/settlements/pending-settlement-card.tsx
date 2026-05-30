"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatMoney } from "@/lib/currency";
import { initials } from "@/lib/utils";
import type { GroupDoc, SettlementDoc } from "@/lib/firebase/types";

interface Props {
  settlement: SettlementDoc;
  group: GroupDoc;
  onAccept: () => void;
  onReject: () => void;
  isActing: boolean;
}

/**
 * Card shown to the receiver of a pending settlement request.
 * Amber left-border accent signals the pending state.
 */
export function PendingSettlementCard({
  settlement,
  group,
  onAccept,
  onReject,
  isActing,
}: Props) {
  const sender = group.members.find((m) => m.uid === settlement.fromUid);
  const senderName = sender?.name ?? "Member";

  return (
    <div className="flex min-w-0 flex-col gap-4 rounded-2xl border border-l-4 border-amber-500 bg-card p-4 shadow-sm">
      {/* Sender info */}
      <div className="flex min-w-0 items-start gap-3">
        <Avatar className="mt-0.5 h-10 w-10 shrink-0">
          {sender?.photoURL && (
            <AvatarImage src={sender.photoURL} alt={senderName} />
          )}
          <AvatarFallback className="text-xs">{initials(senderName)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="break-words text-sm font-semibold leading-snug text-foreground">
              {senderName}
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
              <ArrowRight className="size-3.5" aria-hidden />
              sent you a payment request
            </span>
          </div>
          {settlement.note ? (
            <p className="text-xs text-muted-foreground">{settlement.note}</p>
          ) : null}
        </div>
      </div>

      {/* Amount + actions */}
      <div className="flex min-w-0 flex-col gap-3 border-t pt-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Amount
          </p>
          <p className="font-mono text-xl font-semibold tabular-nums tracking-tight">
            {formatMoney(settlement.amount, settlement.currency)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11 flex-1 touch-manipulation text-destructive hover:text-destructive sm:h-10 sm:flex-none sm:w-28"
            disabled={isActing}
            aria-busy={isActing}
            aria-label={`Reject payment from ${senderName}`}
            onClick={onReject}
          >
            {isActing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Reject"
            )}
          </Button>
          <Button
            type="button"
            variant="default"
            className="h-11 flex-1 touch-manipulation sm:h-10 sm:flex-none sm:w-28"
            disabled={isActing}
            aria-busy={isActing}
            aria-label={`Accept payment from ${senderName}`}
            onClick={onAccept}
          >
            {isActing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Accept"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
