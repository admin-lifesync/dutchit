import { AppShell } from "@/components/layout/app-shell";
import { Protected } from "@/components/auth/protected";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Protected>
      <AppShell>{children}</AppShell>
    </Protected>
  );
}
