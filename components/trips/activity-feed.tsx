"use client";

import {
  CircleDot,
  LogIn,
  Pencil,
  Plus,
  Trash2,
  UserMinus,
  UserPlus,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/utils";
import type { ActivityLogDoc, ActivityType } from "@/lib/firebase/types";

const ICONS: Record<ActivityType, React.ComponentType<{ className?: string }>> = {
  "group.created": CircleDot,
  "member.joined": LogIn,
  "member.removed": UserMinus,
  "member.requested": UserPlus,
  "expense.created": Plus,
  "expense.updated": Pencil,
  "expense.deleted": Trash2,
  "settlement.created": Wallet,
};

export function ActivityFeed({ activity }: { activity: ActivityLogDoc[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
        <CardDescription>Latest 30 events in this trip.</CardDescription>
      </CardHeader>
      <CardContent>
        {activity.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        ) : (
          <ol className="relative space-y-4 border-l border-border pl-5">
            {activity.map((a) => {
              const Icon = ICONS[a.type] || CircleDot;
              return (
                <li key={a.id} className="relative">
                  <span className="absolute -left-[27px] top-0 grid h-5 w-5 place-items-center rounded-full bg-secondary text-muted-foreground">
                    <Icon className="h-3 w-3" />
                  </span>
                  <p className="text-sm">{a.message}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.createdAt?.toMillis ? formatRelativeTime(a.createdAt.toMillis()) : ""}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
