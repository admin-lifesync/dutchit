"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Trash2,
  UserCheck,
  UserPlus,
  UserX,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  approveJoinRequest,
  ensureInviteCode,
  rejectJoinRequest,
  removeMember,
  rotateInviteCode,
  setJoinPolicy,
  watchJoinRequests,
} from "@/lib/firebase/firestore";
import { initials, formatRelativeTime } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { handleError } from "@/lib/errors/handle-error";
import { useAuth } from "@/components/auth/auth-provider";
import type { GroupDoc, JoinPolicy, JoinRequestDoc } from "@/lib/firebase/types";

const POLICY_LABELS: Record<JoinPolicy, { label: string; help: string }> = {
  open: {
    label: "Anyone with the link",
    help: "Joins immediately. Best for trips with friends you trust.",
  },
  "admin-approval": {
    label: "Admins approve requests",
    help: "Only trip admins can let new people in.",
  },
  "member-approval": {
    label: "Any member approves",
    help: "Anyone already in the trip can let new people in.",
  },
};

export function MembersPanel({ group }: { group: GroupDoc }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = useMemo(
    () => !!user && group.adminIds?.includes(user.uid),
    [group.adminIds, user]
  );
  const isMember = useMemo(
    () => !!user && group.memberIds.includes(user.uid),
    [group.memberIds, user]
  );

  const [inviteOpen, setInviteOpen] = useState(false);
  const [requests, setRequests] = useState<JoinRequestDoc[]>([]);

  // Watch pending requests so admins / members can review them.
  useEffect(() => {
    if (!isMember) return;
    return watchJoinRequests(group.id, setRequests);
  }, [group.id, isMember]);

  const pendingRequests = requests.filter((r) => r.status === "pending");
  const canApprove =
    isAdmin || (group.joinPolicy === "member-approval" && isMember);

  return (
    <div className="space-y-4">
      {pendingRequests.length > 0 && canApprove && (
        <PendingRequestsCard
          group={group}
          requests={pendingRequests}
          actor={user ? { uid: user.uid, name: user.name } : null}
        />
      )}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Members</CardTitle>
            <CardDescription>
              Everyone here can add expenses to this trip.
            </CardDescription>
          </div>
          {isMember && (
            <Button size="sm" onClick={() => setInviteOpen(true)}>
              <UserPlus className="h-4 w-4" /> Share link
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {group.members.map((m) => (
              <li key={m.uid} className="flex items-center gap-3 py-2.5">
                <Avatar className="h-9 w-9">
                  {m.photoURL && <AvatarImage src={m.photoURL} alt={m.name} />}
                  <AvatarFallback className="text-xs">
                    {initials(m.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {m.name}{" "}
                    {m.uid === user?.uid && (
                      <span className="text-xs text-muted-foreground">(you)</span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {m.email}
                  </p>
                </div>
                {m.role === "admin" && <Badge variant="secondary">Admin</Badge>}
                {isAdmin && m.uid !== user?.uid && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={async () => {
                          if (!user) return;
                          try {
                            await removeMember(group.id, m.uid, {
                              uid: user.uid,
                              name: user.name,
                            });
                            toast({
                              title: "Member removed",
                              variant: "success",
                            });
                          } catch (e) {
                            handleError(e, {
                              domain: "group",
                              context: { groupId: group.id, removedUid: m.uid },
                              toastTitle: "Couldn't remove member",
                            });
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" /> Remove from trip
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <InviteDialog
        group={group}
        isAdmin={isAdmin}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
      />
    </div>
  );
}

function PendingRequestsCard({
  group,
  requests,
  actor,
}: {
  group: GroupDoc;
  requests: JoinRequestDoc[];
  actor: { uid: string; name: string } | null;
}) {
  const { toast } = useToast();
  const [pendingUid, setPendingUid] = useState<string | null>(null);

  async function approve(uid: string) {
    if (!actor) return;
    try {
      setPendingUid(uid);
      await approveJoinRequest(group.id, uid, actor);
      toast({ title: "Approved — they can join now", variant: "success" });
    } catch (e) {
      handleError(e, {
        domain: "invitation",
        context: { groupId: group.id, requesterUid: uid },
        toastTitle: "Couldn't approve request",
      });
    } finally {
      setPendingUid(null);
    }
  }

  async function reject(uid: string) {
    if (!actor) return;
    try {
      setPendingUid(uid);
      await rejectJoinRequest(group.id, uid, actor);
      toast({ title: "Request declined", variant: "success" });
    } catch (e) {
      handleError(e, {
        domain: "invitation",
        context: { groupId: group.id, requesterUid: uid },
        toastTitle: "Couldn't decline request",
      });
    } finally {
      setPendingUid(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending join requests</CardTitle>
        <CardDescription>
          {requests.length} {requests.length === 1 ? "person" : "people"} waiting
          for access.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {requests.map((r) => {
            const busy = pendingUid === r.uid;
            return (
              <li
                key={r.uid}
                className="flex items-center gap-3 py-2.5"
              >
                <Avatar className="h-9 w-9">
                  {r.photoURL && <AvatarImage src={r.photoURL} alt={r.name} />}
                  <AvatarFallback className="text-xs">
                    {initials(r.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.email}
                    {r.requestedAt?.toMillis ? (
                      <>
                        {" · "}
                        {formatRelativeTime(r.requestedAt.toMillis())}
                      </>
                    ) : null}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => reject(r.uid)}
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <UserX className="h-4 w-4" />
                    )}
                    <span className="hidden sm:inline">Decline</span>
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => approve(r.uid)}
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <UserCheck className="h-4 w-4" />
                    )}
                    <span className="hidden sm:inline">Approve</span>
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function InviteDialog({
  group,
  isAdmin,
  open,
  onOpenChange,
}: {
  group: GroupDoc;
  isAdmin: boolean;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { toast } = useToast();
  const [code, setCode] = useState<string | null>(group.inviteCode || null);
  const [working, setWorking] = useState<"ensure" | "rotate" | "policy" | null>(
    null
  );
  const [copied, setCopied] = useState(false);
  const [policy, setPolicy] = useState<JoinPolicy>(group.joinPolicy ?? "open");

  // Keep state in sync if the group doc updates underneath us.
  useEffect(() => {
    setCode(group.inviteCode || null);
    setPolicy(group.joinPolicy ?? "open");
  }, [group.inviteCode, group.joinPolicy]);

  // Legacy groups (created before per-trip-link redesign) won't have a code.
  // The first time an admin opens this dialog, generate one quietly.
  useEffect(() => {
    if (!open || !isAdmin || code) return;
    let cancelled = false;
    (async () => {
      try {
        setWorking("ensure");
        const next = await ensureInviteCode(group);
        if (!cancelled) setCode(next);
      } catch (e) {
        handleError(e, {
          domain: "invitation",
          context: { groupId: group.id },
          toastTitle: "Couldn't generate share link",
        });
      } finally {
        if (!cancelled) setWorking(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, isAdmin, code, group]);

  const link = useMemo(() => {
    if (!code) return null;
    const base =
      process.env.NEXT_PUBLIC_APP_URL ||
      (typeof window !== "undefined" ? window.location.origin : "");
    if (!base) return null;
    // Make sure the URL is fully-qualified so messaging apps will linkify it.
    const normalized = base.startsWith("http") ? base : `https://${base}`;
    return `${normalized.replace(/\/$/, "")}/invite/${code}`;
  }, [code]);

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast({ title: "Link copied", variant: "success" });
      setTimeout(() => setCopied(false), 1800);
    } catch (e) {
      handleError(e, { domain: "generic", toastTitle: "Couldn't copy link" });
    }
  }

  async function shareLink() {
    if (!link) return;
    if (typeof navigator === "undefined" || !navigator.share) {
      copyLink();
      return;
    }
    try {
      await navigator.share({
        title: `Join "${group.name}" on Dutch It`,
        text: `Track shared expenses for "${group.name}" on Dutch It.`,
        url: link,
      });
    } catch {
      // User cancelled the system share sheet — silently ignored.
    }
  }

  async function handleRotate() {
    try {
      setWorking("rotate");
      const next = await rotateInviteCode(group);
      setCode(next);
      setCopied(false);
      toast({ title: "Old link disabled — new one ready", variant: "success" });
    } catch (e) {
      handleError(e, {
        domain: "invitation",
        context: { groupId: group.id },
        toastTitle: "Couldn't rotate link",
      });
    } finally {
      setWorking(null);
    }
  }

  async function handlePolicyChange(next: JoinPolicy) {
    if (next === policy) return;
    const previous = policy;
    setPolicy(next);
    try {
      setWorking("policy");
      await setJoinPolicy(group, next);
      toast({ title: "Join policy updated", variant: "success" });
    } catch (e) {
      setPolicy(previous);
      handleError(e, {
        domain: "group",
        context: { groupId: group.id, policy: next },
        toastTitle: "Couldn't update join policy",
      });
    } finally {
      setWorking(null);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setCopied(false);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share &ldquo;{group.name}&rdquo;</DialogTitle>
          <DialogDescription>
            One link per trip. Anyone you send it to opens the same page.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isAdmin && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Who can join with this link?
              </label>
              <Select
                value={policy}
                onValueChange={(v) => handlePolicyChange(v as JoinPolicy)}
                disabled={working === "policy"}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(POLICY_LABELS) as JoinPolicy[]).map((p) => (
                    <SelectItem key={p} value={p}>
                      {POLICY_LABELS[p].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {POLICY_LABELS[policy].help}
              </p>
            </div>
          )}

          {!isAdmin && (
            <p className="rounded-lg bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
              {POLICY_LABELS[policy].help} Only trip admins can change this.
            </p>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Shareable link
            </label>
            {link ? (
              <div className="flex items-center gap-2 rounded-lg border bg-card p-2">
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 flex-1 truncate font-mono text-xs text-primary underline-offset-2 hover:underline"
                  title={link}
                >
                  {link}
                </a>
                <Button size="sm" variant="ghost" asChild>
                  <a href={link} target="_blank" rel="noopener noreferrer" aria-label="Open link in new tab">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
                <Button size="sm" variant="outline" onClick={copyLink}>
                  {copied ? (
                    <Check className="h-4 w-4 text-success" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  <span className="hidden sm:inline">
                    {copied ? "Copied" : "Copy"}
                  </span>
                </Button>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
                {working === "ensure"
                  ? "Generating link…"
                  : "Only trip admins can generate a link."}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {isAdmin && link && (
            <Button
              variant="outline"
              onClick={handleRotate}
              disabled={working === "rotate"}
            >
              {working === "rotate" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Rotate link
            </Button>
          )}
          {link && (
            <Button onClick={shareLink}>Share</Button>
          )}
          {!link && (
            <Button onClick={() => onOpenChange(false)} variant="outline">
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
