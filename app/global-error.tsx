"use client";

import { useEffect } from "react";
import { handleError } from "@/lib/errors/handle-error";

/**
 * Last-resort fallback when the root layout itself crashes. Must include
 * its own <html>/<body> per Next.js docs.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    handleError(error, { silent: true, context: { digest: error.digest, root: true } });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "#0c1116",
          color: "#f3f4f6",
          padding: "1.5rem",
          margin: 0,
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: "1.4rem", marginBottom: 8 }}>
            Something went wrong
          </h1>
          <p style={{ color: "#9ca3af", marginBottom: 20 }}>
            The app hit an unexpected issue. Please reload to continue.
          </p>
          <button
            onClick={() => reset()}
            style={{
              background: "#10b981",
              color: "#fff",
              border: 0,
              padding: "0.6rem 1.1rem",
              borderRadius: 10,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
