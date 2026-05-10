"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { handleError } from "@/lib/errors/handle-error";
import { isAppError } from "@/lib/errors/app-error";
import { ERROR_CODES } from "@/lib/errors/error-codes";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    handleError(error, { silent: true, context: { digest: error.digest } });
  }, [error]);

  const friendly = isAppError(error)
    ? error.userMessage
    : {
        title: "Something went wrong",
        description: "An unexpected issue interrupted this page. Try refreshing.",
      };
  const code = isAppError(error) ? error.code : ERROR_CODES.APP_UNKNOWN;

  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-destructive/10 text-destructive">
            <AlertTriangle className="h-6 w-6" />
          </span>
          <CardTitle className="mt-3">{friendly.title}</CardTitle>
          <CardDescription>{friendly.description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button onClick={() => reset()}>
            <RefreshCw className="h-4 w-4" /> Try again
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Error code: <code className="font-mono">{code}</code>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
