"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ArrowRight, Calculator, Sparkles, Users, Wallet } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/layout/logo";

export default function LandingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [user, loading, router]);

  return (
    <div className="min-h-dvh">
      <header className="container flex items-center justify-between py-5">
        <Logo />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button asChild size="sm">
            <Link href="/signin">Sign in</Link>
          </Button>
        </div>
      </header>

      <main className="container">
        <section className="mx-auto max-w-3xl py-16 text-center sm:py-24">
          <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" /> Split smarter, not
            louder
          </span>
          <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-6xl">
            Split trip expenses
            <br />
            <span className="text-primary">without the math.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-balance text-base text-muted-foreground sm:text-lg">
            Dutch It keeps every group trip honest. Add expenses as they happen,
            split them however you like, and settle up in one tap.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/signin">
                Get started — it&apos;s free <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="#features">See features</Link>
            </Button>
          </div>
        </section>

        <section
          id="features"
          className="mx-auto grid max-w-5xl gap-4 pb-20 sm:grid-cols-3"
        >
          {[
            {
              icon: Users,
              title: "Built for groups",
              body:
                "Create a trip, invite friends with a link, and let everyone log expenses in real time.",
            },
            {
              icon: Calculator,
              title: "Any kind of split",
              body:
                "Equal, exact, percentage, shares, or personal. Validation built in so totals always add up.",
            },
            {
              icon: Wallet,
              title: "Smart settlements",
              body:
                "We minimize the number of payments needed so settling up is one quick transfer.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-2xl border bg-card p-6 transition-shadow hover:shadow-md"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="container border-t py-6 text-center text-xs text-muted-foreground">
        Made with care · {new Date().getFullYear()} Dutch It
      </footer>
    </div>
  );
}
