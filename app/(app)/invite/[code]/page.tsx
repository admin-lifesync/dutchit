"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, Users } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  acceptInvitation,
  getInvitation,
} from "@/lib/firebase/firestore";
import type { InvitationDoc } from "@/lib/firebase/types";
import { useToast } from "@/hooks/use-toast";
import { handleError } from "@/lib/errors/handle-error";
import { ERROR_CODES } from "@/lib/errors/error-codes";
import { isAppError } from "@/lib/errors/app-error";
import { messageFor } from "@/lib/errors/user-messages";

export default function InvitePage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const [invite, setInvite] = useState<InvitationDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [loadError, setLoadError] = useState<{
    code: string;
    title: string;
    description: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const inv = await getInvitation(params.code);
        if (cancelled) return;
        if (!inv) {
          const m = messageFor(ERROR_CODES.INV_NOT_FOUND);
          setLoadError({ code: ERROR_CODES.INV_NOT_FOUND, ...m });
        } else if (inv.status === "revoked") {
          const m = messageFor(ERROR_CODES.INV_REVOKED);
          setLoadError({ code: ERROR_CODES.INV_REVOKED, ...m });
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

  async function handleAccept() {
    if (!user || !invite) return;
    try {
      setAccepting(true);
      const { groupId, alreadyMember } = await acceptInvitation(invite.code, {
        uid: user.uid,
        name: user.name,
        email: user.email,
        photoURL: user.photoURL,
        role: "member",
      });
      toast({
        title: alreadyMember ? "Already a member" : "You joined the trip!",
        variant: "success",
      });
      router.replace(`/trips/${groupId}`);
    } catch (e) {
      const appErr = handleError(e, {
        domain: "invitation",
        context: { code: invite.code, uid: user.uid },
        silent: true,
      });
      // Already-accepted is a happy redirect, not an error.
      if (
        isAppError(appErr) &&
        appErr.code === ERROR_CODES.INV_ALREADY_ACCEPTED
      ) {
        router.replace(`/trips/${invite.groupId}`);
        return;
      }
      toast({
        title: appErr.userMessage.title,
        description: `${appErr.userMessage.description}\nCode: ${appErr.code}`,
        variant: "destructive",
      });
    } finally {
      setAccepting(false);
    }
  }

  if (loading) {
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
        <CardTitle className="mt-3">Join “{invite.groupName}”</CardTitle>
        <CardDescription>
          You&apos;ve been invited to track shared expenses on this trip.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Button onClick={handleAccept} disabled={accepting} size="lg">
          {accepting && <Loader2 className="h-4 w-4 animate-spin" />}
          Accept invite
        </Button>
        <Button
          variant="outline"
          onClick={() => router.replace("/dashboard")}
          disabled={accepting}
        >
          Maybe later
        </Button>
      </CardContent>
    </Card>
  );
}
