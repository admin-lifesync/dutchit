"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { watchUserGroups } from "@/lib/firebase/firestore";
import type { GroupDoc } from "@/lib/firebase/types";

export function useUserGroups() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<GroupDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setGroups([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = watchUserGroups(user.uid, (gs) => {
      setGroups(gs);
      setLoading(false);
    });
    return () => unsub();
  }, [user]);

  return { groups, loading };
}
