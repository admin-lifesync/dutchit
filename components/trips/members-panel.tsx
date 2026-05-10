"use client";

import { useState } from "react";
import { Check, Copy, Loader2, MoreHorizontal, Trash2, UserPlus } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createInvitation,
  removeMember,
} from "@/lib/firebase/firestore";
import { initials } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { handleError } from "@/lib/errors/handle-error";
import { useAuth } from "@/components/auth/auth-provider";
import type { GroupDoc } from "@/lib/firebase/types";

export function MembersPanel({ group }: { group: GroupDoc }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin =
    group.members.find((m) => m.uid === user?.uid)?.role === "admin";
  const [inviteOpen, setInviteOpen] = useState(false);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Members</CardTitle>
            <CardDescription>
              Everyone here can add expenses to this trip.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <UserPlus className="h-4 w-4" /> Invite
          </Button>
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
        open={inviteOpen}
        onOpenChange={setInviteOpen}
      />
    </div>
  );
}

function InviteDialog({
  group,
  open,
  onOpenChange,
}: {
  group: GroupDoc;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    if (!user) return;
    try {
      setCreating(true);
      const inv = await createInvitation({
        groupId: group.id,
        groupName: group.name,
        invitedBy: user.uid,
        email: email.trim() || null,
      });
      const base =
        process.env.NEXT_PUBLIC_APP_URL ||
        (typeof window !== "undefined" ? window.location.origin : "");
      setLink(`${base}/invite/${inv.code}`);
    } catch (e) {
      handleError(e, {
        domain: "invitation",
        context: { groupId: group.id },
        toastTitle: "Couldn't create invite link",
      });
    } finally {
      setCreating(false);
    }
  }

  async function copyLink() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast({ title: "Link copied", variant: "success" });
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setLink(null);
          setEmail("");
          setCopied(false);
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite to {group.name}</DialogTitle>
          <DialogDescription>
            Share a single-use link with friends. They sign in once and join.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">Email (optional)</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="friend@example.com"
            />
            <p className="text-xs text-muted-foreground">
              We don&apos;t send the email — share the link below however you
              like.
            </p>
          </div>

          {link ? (
            <div className="flex items-center gap-2 rounded-lg border bg-card p-2">
              <code className="flex-1 truncate font-mono text-xs">{link}</code>
              <Button size="sm" variant="outline" onClick={copyLink}>
                {copied ? (
                  <Check className="h-4 w-4 text-success" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={generate} disabled={creating}>
            {creating && <Loader2 className="h-4 w-4 animate-spin" />}
            {link ? "Generate new link" : "Create invite link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
