"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeft,
  Loader2,
  MoreVertical,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { useTrip } from "@/hooks/use-trip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ExpenseList } from "@/components/expenses/expense-list";
import { ExpenseForm } from "@/components/expenses/expense-form";
import { ExpenseDetails } from "@/components/expenses/expense-details";
import { SettlementPanel } from "@/components/settlements/settlement-panel";
import { MembersPanel } from "@/components/trips/members-panel";
import { ActivityFeed } from "@/components/trips/activity-feed";
import { ReportPanel } from "@/components/trips/report-panel";
import { formatMoney } from "@/lib/currency";
import { balanceFor } from "@/lib/balance/calculate";
import { deleteExpense, deleteGroup, leaveGroup } from "@/lib/firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { handleError } from "@/lib/errors/handle-error";
import type { ExpenseDoc } from "@/lib/firebase/types";

type ConfirmKind =
  | { kind: "deleteExpense"; expense: ExpenseDoc }
  | { kind: "deleteGroup" }
  | { kind: "leaveGroup" }
  | null;

export default function TripDetailPage() {
  const params = useParams<{ id: string }>();
  const groupId = params.id;
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const { group, expenses, settlements, balances, activity, loading } =
    useTrip(groupId);

  const [tab, setTab] = useState("expenses");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseDoc | null>(null);
  const [viewing, setViewing] = useState<ExpenseDoc | null>(null);
  const [confirm, setConfirm] = useState<ConfirmKind>(null);
  const [actionPending, setActionPending] = useState(false);

  if (loading) {
    return (
      <div className="grid min-h-[40dvh] place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!group) {
    return (
      <Card>
        <CardContent className="space-y-3 p-8 text-center">
          <p className="font-medium">This trip is no longer available</p>
          <p className="text-sm text-muted-foreground">
            It may have been deleted, or you no longer have access. Ask a trip
            admin for a fresh invite link.
          </p>
          <p className="text-xs text-muted-foreground">
            Code: <code className="font-mono">ERR-GRP-404</code>
          </p>
          <Button onClick={() => router.replace("/trips")}>Back to trips</Button>
        </CardContent>
      </Card>
    );
  }

  const me = balanceFor(user?.uid || "", balances);
  const isAdmin =
    group.members.find((m) => m.uid === user?.uid)?.role === "admin";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">
              {group.name}
            </h1>
            <p className="truncate text-sm text-muted-foreground">
              <Users className="mr-1 inline h-3 w-3" />
              {group.members.length} members ·{" "}
              {formatMoney(group.totalSpent || 0, group.currency)} total ·{" "}
              {group.expenseCount || 0} expenses
            </p>
            {group.description && (
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                {group.description}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setAddOpen(true)} className="hidden sm:inline-flex">
            <Plus className="h-4 w-4" /> Add expense
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!isAdmin && (
                <DropdownMenuItem
                  onClick={() => setConfirm({ kind: "leaveGroup" })}
                >
                  Leave trip
                </DropdownMenuItem>
              )}
              {isAdmin && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => setConfirm({ kind: "deleteGroup" })}
                  >
                    <Trash2 className="h-4 w-4" /> Delete trip
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryStat label="Your share" value={formatMoney(me.owed, group.currency)} />
        <SummaryStat label="You paid" value={formatMoney(me.paid, group.currency)} />
        <SummaryStat
          label={me.net >= 0 ? "You're owed" : "You owe"}
          value={formatMoney(Math.abs(me.net), group.currency)}
          tone={me.net > 0.01 ? "up" : me.net < -0.01 ? "down" : "muted"}
        />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-5 sm:inline-flex sm:w-auto">
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="settle">Settle</TabsTrigger>
          <TabsTrigger value="report">Report</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="expenses" className="space-y-3">
          <ExpenseList
            group={group}
            expenses={expenses}
            currentUid={user?.uid || ""}
            onEdit={(e) => setEditing(e)}
            onView={(e) => setViewing(e)}
            onDelete={(e) => setConfirm({ kind: "deleteExpense", expense: e })}
          />
        </TabsContent>
        <TabsContent value="settle">
          <SettlementPanel
            group={group}
            expenses={expenses}
            balances={balances}
            settlements={settlements}
          />
        </TabsContent>
        <TabsContent value="report">
          <ReportPanel
            group={group}
            expenses={expenses}
            settlements={settlements}
            currentUid={user?.uid || ""}
          />
        </TabsContent>
        <TabsContent value="members">
          <MembersPanel group={group} />
        </TabsContent>
        <TabsContent value="activity">
          <ActivityFeed activity={activity} />
        </TabsContent>
      </Tabs>

      <Button
        size="lg"
        aria-label="Add expense"
        className="fixed right-4 z-20 h-14 rounded-full px-5 shadow-lg sm:hidden bottom-[calc(env(safe-area-inset-bottom)+5rem)]"
        onClick={() => setAddOpen(true)}
      >
        <Plus className="h-5 w-5" /> Add expense
      </Button>

      <ExpenseForm
        group={group}
        open={addOpen || !!editing}
        expense={editing}
        onOpenChange={(o) => {
          if (!o) {
            setAddOpen(false);
            setEditing(null);
          }
        }}
      />

      <ExpenseDetails
        group={group}
        expense={viewing}
        open={!!viewing}
        onOpenChange={(o) => !o && setViewing(null)}
      />

      <Dialog
        open={!!confirm}
        onOpenChange={(o) => !o && !actionPending && setConfirm(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirm?.kind === "deleteGroup" && "Delete this trip?"}
              {confirm?.kind === "leaveGroup" && "Leave this trip?"}
              {confirm?.kind === "deleteExpense" && "Delete this expense?"}
            </DialogTitle>
            <DialogDescription>
              {confirm?.kind === "deleteGroup" &&
                "This permanently removes all expenses, settlements, and history. This can't be undone."}
              {confirm?.kind === "leaveGroup" &&
                "You won't be able to see expenses or balances for this trip until someone re-invites you."}
              {confirm?.kind === "deleteExpense" &&
                "Balances will be recalculated automatically."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirm(null)}
              disabled={actionPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={actionPending}
              onClick={async () => {
                if (!confirm || !user) return;
                setActionPending(true);
                try {
                  if (confirm.kind === "deleteExpense") {
                    await deleteExpense(group.id, confirm.expense.id, {
                      uid: user.uid,
                      name: user.name,
                    });
                    toast({ title: "Expense deleted", variant: "success" });
                  } else if (confirm.kind === "deleteGroup") {
                    await deleteGroup(group.id);
                    toast({ title: "Trip deleted", variant: "success" });
                    router.replace("/trips");
                  } else if (confirm.kind === "leaveGroup") {
                    await leaveGroup(group.id, {
                      uid: user.uid,
                      name: user.name,
                    });
                    toast({ title: "You left the trip", variant: "success" });
                    router.replace("/trips");
                  }
                  setConfirm(null);
                } catch (e) {
                  const domain =
                    confirm.kind === "deleteExpense"
                      ? "expense"
                      : "group";
                  handleError(e, {
                    domain,
                    context: { groupId: group.id, action: confirm.kind },
                  });
                } finally {
                  setActionPending(false);
                }
              }}
            >
              {actionPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string;
  tone?: "up" | "down" | "muted";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p
          className={
            tone === "up"
              ? "mt-1 text-xl font-semibold text-success"
              : tone === "down"
                ? "mt-1 text-xl font-semibold text-destructive"
                : "mt-1 text-xl font-semibold"
          }
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
