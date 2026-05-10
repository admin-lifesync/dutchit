"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/theme-toggle";

export default function SignInPage() {
  return (
    <div className="min-h-dvh">
      <header className="container flex items-center justify-between py-5">
        <Logo />
        <ThemeToggle />
      </header>

      <main className="container grid min-h-[80dvh] place-items-center">
        <Suspense fallback={<SignInSkeleton />}>
          <SignInCard />
        </Suspense>
      </main>
    </div>
  );
}

function SignInSkeleton() {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Welcome back</CardTitle>
        <CardDescription>Loading sign in…</CardDescription>
      </CardHeader>
      <CardContent>
        <Button size="lg" variant="outline" className="w-full" disabled>
          <Loader2 className="h-4 w-4 animate-spin" />
          Continue with Google
        </Button>
      </CardContent>
    </Card>
  );
}

function SignInCard() {
  const { user, loading, signInWithGoogle } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.replace(next || "/dashboard");
    }
  }, [user, loading, router, next]);

  async function handleSignIn() {
    try {
      setSubmitting(true);
      await signInWithGoogle();
    } catch {
      // The auth provider already routed this through handleError() and
      // surfaced a friendly toast — nothing more to do here.
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Welcome back</CardTitle>
        <CardDescription>
          Sign in to manage your trips and split expenses.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Button
          size="lg"
          variant="outline"
          className="w-full"
          onClick={handleSignIn}
          disabled={submitting || loading}
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <GoogleIcon />
          )}
          Continue with Google
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          By continuing you agree to our friendly{" "}
          <Link href="/" className="underline underline-offset-2">
            terms
          </Link>{" "}
          and to keep splits fair.
        </p>
      </CardContent>
    </Card>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 10.2v3.83h5.36c-.23 1.4-1.65 4.1-5.36 4.1-3.23 0-5.86-2.67-5.86-5.96 0-3.29 2.63-5.96 5.86-5.96 1.84 0 3.07.78 3.78 1.46l2.58-2.5C16.86 3.6 14.66 2.6 12 2.6 6.93 2.6 2.83 6.7 2.83 11.77S6.93 20.94 12 20.94c6.93 0 9.18-4.86 9.18-7.4 0-.5-.05-.88-.12-1.34H12z"
      />
    </svg>
  );
}
