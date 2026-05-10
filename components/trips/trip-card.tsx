import Link from "next/link";
import { ArrowRight, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatMoney } from "@/lib/currency";
import { cn, initials } from "@/lib/utils";
import type { GroupDoc } from "@/lib/firebase/types";

export function TripCard({
  group,
  currentUid,
  className,
}: {
  group: GroupDoc;
  currentUid: string;
  className?: string;
}) {
  const otherMembers = group.members.filter((m) => m.uid !== currentUid);
  const visibleMembers = group.members.slice(0, 4);
  return (
    <Link href={`/trips/${group.id}`} className="block">
      <Card
        className={cn(
          "group relative overflow-hidden transition-all hover:shadow-md hover:-translate-y-0.5",
          className
        )}
      >
        <CardContent className="flex items-center gap-4 p-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-2xl">
            {group.imageURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={group.imageURL}
                alt={group.name}
                className="h-full w-full rounded-2xl object-cover"
              />
            ) : (
              "🌴"
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{group.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              <Users className="mr-1 inline h-3 w-3" />
              {group.members.length} member
              {group.members.length === 1 ? "" : "s"}
              {otherMembers.length > 0 ? ` · with ${otherMembers
                .slice(0, 2)
                .map((m) => m.name.split(" ")[0])
                .join(", ")}${otherMembers.length > 2 ? "…" : ""}` : ""}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <div className="flex -space-x-2">
                {visibleMembers.map((m) => (
                  <Avatar key={m.uid} className="h-6 w-6 border border-background">
                    {m.photoURL && <AvatarImage src={m.photoURL} alt={m.name} />}
                    <AvatarFallback className="text-[10px]">
                      {initials(m.name)}
                    </AvatarFallback>
                  </Avatar>
                ))}
              </div>
              <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
                {formatMoney(group.totalSpent || 0, group.currency)}
              </span>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
        </CardContent>
      </Card>
    </Link>
  );
}
