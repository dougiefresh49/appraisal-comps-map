"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { createClient } from "~/utils/supabase/client";
import { useAuth } from "./useAuth";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  acquirePageLock,
  releasePageLock,
  getPageLock,
} from "~/lib/supabase-queries";

export interface PresenceUser {
  userId: string;
  userName: string;
  pageKey: string;
  timestamp: number;
}

interface UsePresenceReturn {
  activeUsers: PresenceUser[];
  isOtherUserEditing: boolean;
  otherUserName: string | null;
  /** Try to acquire the edit lock. Returns true if successful. */
  requestEditLock: () => Promise<boolean>;
  /** Release the edit lock when done. */
  releaseEditLock: () => Promise<void>;
  /** Whether the current user holds the lock. */
  hasLock: boolean;
}

const LOCK_EXPIRY_MS = 5 * 60 * 1000;

export function usePresence(
  projectId: string,
  pageKey: string,
): UsePresenceReturn {
  const { user } = useAuth();
  const [activeUsers, setActiveUsers] = useState<PresenceUser[]>([]);
  const [hasLock, setHasLock] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    if (!user || !projectId || !pageKey) return;

    const channelName = `presence:${projectId}:${pageKey}`;
    const channel = supabase.channel(channelName);

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<PresenceUser>();
        const users: PresenceUser[] = [];
        for (const key of Object.keys(state)) {
          const presences = state[key];
          if (presences) {
            for (const p of presences) {
              users.push({
                userId: p.userId,
                userName: p.userName,
                pageKey: p.pageKey,
                timestamp: p.timestamp,
              });
            }
          }
        }
        setActiveUsers(users);
      })
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") {
          void channel.track({
            userId: user.id,
            userName:
              (user.user_metadata?.full_name as string | undefined) ??
              user.email ??
              "Unknown",
            pageKey,
            timestamp: Date.now(),
          });
        }
      });

    channelRef.current = channel;

    return () => {
      void channel.untrack();
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [supabase, user, projectId, pageKey]);

  // Check for existing lock on mount
  useEffect(() => {
    if (!user || !projectId || !pageKey) return;

    async function checkLock() {
      const lock = await getPageLock(projectId, pageKey);
      if (lock && lock.lockedBy === user!.id) {
        const lockAge = Date.now() - new Date(lock.lockedAt).getTime();
        if (lockAge < LOCK_EXPIRY_MS) {
          setHasLock(true);
        }
      }
    }

    void checkLock();
  }, [user, projectId, pageKey]);

  // Release lock on unmount
  useEffect(() => {
    return () => {
      if (hasLock && user) {
        void releasePageLock(projectId, pageKey, user.id);
      }
    };
  }, [hasLock, user, projectId, pageKey]);

  const requestEditLock = useCallback(async () => {
    if (!user) return false;
    const acquired = await acquirePageLock(projectId, pageKey, user.id);
    setHasLock(acquired);
    return acquired;
  }, [user, projectId, pageKey]);

  const releaseEditLockCb = useCallback(async () => {
    if (!user) return;
    await releasePageLock(projectId, pageKey, user.id);
    setHasLock(false);
  }, [user, projectId, pageKey]);

  const isOtherUserEditing = activeUsers.some(
    (u) => u.userId !== user?.id,
  );

  const otherUserName =
    activeUsers.find((u) => u.userId !== user?.id)?.userName ?? null;

  return {
    activeUsers,
    isOtherUserEditing,
    otherUserName,
    requestEditLock,
    releaseEditLock: releaseEditLockCb,
    hasLock,
  };
}
