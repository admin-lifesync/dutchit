"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  CheckCircle2,
  Clock,
  Loader2,
  Users,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  cancelJoinRequest,
  finalizeApprovedJoin,
  getPublicInvite,
  joinOpenGroup,
  requestToJoin,
  watchMyJoinRequest,
  type PublicInvite,
} from "@/lib/firebase/firestore";
import type { JoinRequestDoc } from "@/lib/firebase/types";
import { useToast } from "@/hooks/use-toast";
import { handleError } from "@/lib/errors/handle-error";
import { ERROR_CODES } from "@/lib/errors/error-codes";
import { messageFor } from "@/lib/errors/user-messages";

export default function InvitePage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [invite, setInvite] = useState<PublicInvite | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [request, setRequest] = useState<JoinRequestDoc | null>(null);
  const [loadError, setLoadError] = useState<{
    code: string;
    title: string;
    description: string;
  } | null>(null);

  // 1. Look up the invite metadata.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const inv = await getPublicInvite(params.code);
        if (cancelled) return;
        if (!inv) {
          const m = messageFor(ERROR_CODES.INV_NOT_FOUND);
          setLoadError({ code: ERROR_CODES.INV_NOT_FOUND, ...m });
        } else {
          setInvite(inv);
        }
      } catch (e) {
        if (cancelled) return;
        const appErr = handleError(e, {
          domain: "invitation",
          context: { code: params.code },
          silent: true,
        });
        setLoadError({
          code: appErr.code,
          title: appErr.userMessage.title,
          description: appErr.userMessage.description,
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.code]);

  // 2. If signed in + this trip needs approval, watch our own request status.
  useEffect(() => {
    if (!invite || !user) return;
    if (invite.joinPolicy === "open") return;
    return watchMyJoinRequest(invite.groupId, user.uid, setRequest);
  }, [invite, user]);

  // 3. As soon as our request flips to approved, finalize the join automatically.
  useEffect(() => {
    if (!invite || !user || !request) return;
    if (request.status !== "approved") return;
    let cancelled = false;
    (async () => {
      try {
        setBusy(true);
        await finalizeApprovedJoin(invite.groupId, {
          uid: user.uid,
          name: user.name,
          email: user.email,
          photoURL: user.photoURL,
          role: "member",
        });
        if (cancelled) return;
        toast({ title: "You're in! Opening the trip…", variant: "success" });
        router.replace(`/trips/${invite.groupId}`);
      } catch (e) {
        if (cancelled) return;
        handleError(e, {
          domain: "invitation",
          context: { groupId: invite.groupId, uid: user.uid },
          toastTitle: "Couldn't finish joining",
        });
      } finally {
        setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [invite, user, request, router, toast]);

  async function handleOpenJoin() {
    if (!invite || !user) return;
    try {
      setBusy(true);
      const { alreadyMember } = await joinOpenGroup(invite, {
        uid: user.uid,
        name: user.name,
        email: user.email,
        photoURL: user.photoURL,
        role: "member",
      });
      toast({
        title: alreadyMember ? "You're already in this trip" : "Welcome aboard!",
        variant: "success",
      });
      router.replace(`/trips/${invite.groupId}`);
    } catch (e) {
      handleError(e, {
        domain: "invitation",
        context: { groupId: invite.groupId, uid: user.uid },
        toastTitle: "Couldn't join the trip",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleRequest() {
    if (!invite || !user) return;
    try {
      setBusy(true);
      await requestToJoin(invite, {
        uid: user.uid,
        name: user.name,
        email: user.email,
        photoURL: user.photoURL,
        role: "member",
      });
      toast({
        title: "Request sent",
        description:
          invite.joinPolicy === "admin-approval"
            ? "An admin will review your request."
            : "Any existing member can approve.",
        variant: "success",
      });
    } catch (e) {
      handleError(e, {
        domain: "invitation",
        context: { groupId: invite.groupId, uid: user.uid },
        toastTitle: "Couldn't send request",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleCancelRequest() {
    if (!invite || !user) return;
    try {
      setBusy(true);
      await cancelJoinRequest(invite.groupId, user.uid);
      toast({ title: "Request withdrawn", variant: "success" });
    } catch (e) {
      handleError(e, { domain: "invitation", toastTitle: "Couldn't cancel request" });
    } finally {
      setBusy(false);
    }
  }

  function handleSignIn() {
    const target = `/invite/${params.code}`;
    router.push(`/signin?next=${encodeURIComponent(target)}`);
  }

  // ---- render -----------------------------------------------------------

  if (loading || authLoading) {
    return (
      <div className="grid min-h-[40dvh] place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loadError || !invite) {
    const err =
      loadError || {
        code: ERROR_CODES.INV_NOT_FOUND,
        ...messageFor(ERROR_CODES.INV_NOT_FOUND),
      };
    return (
      <Card className="mx-auto max-w-md">
        <CardContent className="space-y-3 p-8 text-center">
          <p className="font-medium">{err.title}</p>
          <p className="text-sm text-muted-foreground">{err.description}</p>
          <p className="text-xs text-muted-foreground">
            Code: <code className="font-mono">{err.code}</code>
          </p>
          <Button onClick={() => router.replace("/dashboard")}>
            Back to dashboard
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader className="text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Users className="h-6 w-6" />
        </span>
        <CardTitle className="mt-3">Join &ldquo;{invite.groupName}&rdquo;</CardTitle>
        <CardDescription>
          <PolicyBlurb policy={invite.joinPolicy} />
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!user ? (
          <>
            <Button onClick={handleSignIn} size="lg">
              Sign in to continue
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              You&apos;ll come right back here after signing in.
            </p>
          </>
        ) : invite.joinPolicy === "open" ? (
          <Button onClick={handleOpenJoin} disabled={busy} size="lg">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Join trip
          </Button>
        ) : (
          <RequestState
            request={request}
            busy={busy}
            onRequest={handleRequest}
            onCancel={handleCancelRequest}
          />
        )}

        <Button
          variant="ghost"
          onClick={() => router.replace("/dashboard")}
          disabled={busy}
        >
          Maybe later
        </Button>
      </CardContent>
    </Card>
  );
}

function PolicyBlurb({ policy }: { policy: PublicInvite["joinPolicy"] }) {
  switch (policy) {
    case "open":
      return <>Anyone with this link can join immediately.</>;
    case "admin-approval":
      return <>Trip admins approve every new member.</>;
    case "member-approval":
      return <>Any existing member of this trip can let you in.</>;
  }
}

function RequestState({
  request,
  busy,
  onRequest,
  onCancel,
}: {
  request: JoinRequestDoc | null;
  busy: boolean;
  onRequest: () => void;
  onCancel: () => void;
}) {
  if (!request) {
    return (
      <Button onClick={onRequest} disabled={busy} size="lg">
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        Request to join
      </Button>
    );
  }
  if (request.status === "pending") {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-2 rounded-xl bg-secondary/60 p-3 text-sm">
          <Clock className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <div className="flex-1">
            <p className="font-medium">Waiting for approval</p>
            <p className="text-xs text-muted-foreground">
              We&apos;ll let you in automatically the moment someone approves.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={busy}
          className="w-full"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Withdraw request
        </Button>
      </div>
    );
  }
  if (request.status === "rejected") {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
          <XCircle className="mt-0.5 h-4 w-4" />
          <div className="flex-1">
            <p className="font-medium">Request declined</p>
            <p className="text-xs">
              The trip owner declined your request. You can try asking again.
            </p>
          </div>
        </div>
        <Button onClick={onRequest} disabled={busy} className="w-full">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Request again
        </Button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-xl bg-success/10 p-3 text-sm text-success">
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <CheckCircle2 className="h-4 w-4" />
      )}
      <span>Approved — finalising your access&hellip;</span>
    </div>
  );
}
