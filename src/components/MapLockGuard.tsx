"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { createClient } from "~/utils/supabase/client";

export interface PageLockRow {
  project_id: string;
  page_key: string;
  locked_by: string;
  locked_at: string;
}

function formatLockerLabel(userId: string): string {
  if (!userId) return "another user";
  const tail = userId.replace(/-/g, "").slice(-8);
  return `user …${tail}`;
}

export interface MapLockGuardProps {
  projectId: string;
  pageKey: string;
  /** Fires when map edit lock state changes (view-only vs editing). */
  onReadOnlyChange?: (readOnly: boolean) => void;
  className?: string;
  /** Applied to the wrapper around `children` (default: min-h-0 flex-1). */
  bodyClassName?: string;
  /** Called synchronously after the lock is acquired — use to snapshot state. */
  onEditStart?: () => void;
  /** Called synchronously before releasing the lock on "Save Edits". */
  onSaveEdits?: () => void;
  /** Called synchronously before releasing the lock on "Cancel Edits" — use to restore snapshot. */
  onCancelEdits?: () => void;
  children:
    | React.ReactNode
    | ((ctx: { readOnly: boolean }) => React.ReactNode);
}

export function MapLockGuard({
  projectId,
  pageKey,
  onReadOnlyChange,
  className,
  bodyClassName,
  onEditStart,
  onSaveEdits,
  onCancelEdits,
  children,
}: MapLockGuardProps) {
  const [lock, setLock] = useState<PageLockRow | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const holdingLockRef = useRef(false);

  const refreshLock = useCallback(async () => {
    const supabase = createClient();
    const result = await supabase
      .from("page_locks")
      .select("*")
      .eq("project_id", projectId)
      .eq("page_key", pageKey)
      .maybeSingle();

    if (result.error) {
      console.error("page_locks fetch", result.error);
      return;
    }

    const row = result.data as PageLockRow | null;
    setLock(row ?? null);
  }, [projectId, pageKey]);

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null);
    });
  }, []);

  useEffect(() => {
    void refreshLock();
  }, [refreshLock]);

  useEffect(() => {
    const supabase = createClient();

    const applyPayload = (
      payload: RealtimePostgresChangesPayload<PageLockRow>,
    ) => {
      if (payload.eventType === "DELETE") {
        const oldRow = payload.old as Partial<PageLockRow> | undefined;
        if (
          oldRow?.project_id === projectId &&
          oldRow?.page_key === pageKey
        ) {
          setLock(null);
          if (
            oldRow.locked_by &&
            currentUserId &&
            oldRow.locked_by === currentUserId
          ) {
            holdingLockRef.current = false;
            setIsEditing(false);
          }
        }
        return;
      }

      const row = payload.new;
      if (!row || row.project_id !== projectId || row.page_key !== pageKey) {
        return;
      }
      setLock(row);
    };

    const channel = supabase
      .channel(`page_locks:${projectId}:${pageKey}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "page_locks",
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => applyPayload(payload as RealtimePostgresChangesPayload<PageLockRow>),
      )
      .subscribe();

    return () => {
      void channel.unsubscribe();
    };
  }, [projectId, pageKey, currentUserId]);

  useEffect(() => {
    if (!currentUserId || !lock) return;
    if (lock.locked_by === currentUserId) {
      setIsEditing(true);
      holdingLockRef.current = true;
    } else {
      setIsEditing(false);
      holdingLockRef.current = false;
    }
  }, [lock, currentUserId]);

  const lockedByOther =
    lock !== null &&
    currentUserId !== null &&
    lock.locked_by !== currentUserId;

  const acquireLock = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) {
        setError("Sign in to edit the map.");
        return;
      }

      const { error: insErr } = await supabase.from("page_locks").insert({
        project_id: projectId,
        page_key: pageKey,
        locked_by: uid,
      });

      if (insErr) {
        await refreshLock();
        setError("Could not acquire lock. Another editor may have just started.");
        return;
      }

      holdingLockRef.current = true;
      setIsEditing(true);
      await refreshLock();
      onEditStart?.();
    } finally {
      setBusy(false);
    }
  }, [projectId, pageKey, refreshLock, onEditStart]);

  const releaseLock = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return;

      await supabase
        .from("page_locks")
        .delete()
        .match({
          project_id: projectId,
          page_key: pageKey,
          locked_by: uid,
        });

      holdingLockRef.current = false;
      setIsEditing(false);
      setLock(null);
    } finally {
      setBusy(false);
    }
  }, [projectId, pageKey]);

  const blockInteraction = !isEditing || lockedByOther;
  const readOnly = blockInteraction;

  useEffect(() => {
    onReadOnlyChange?.(readOnly);
  }, [readOnly, onReadOnlyChange]);

  return (
    <div
      className={
        className ??
        "relative flex min-h-0 flex-1 flex-col"
      }
    >
      {lockedByOther && lock ? (
        <div
          role="status"
          className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100"
        >
          Map is being edited by {formatLockerLabel(lock.locked_by)}. Waiting
          for them to finish…
        </div>
      ) : null}

      {!lockedByOther && !isEditing ? (
        <div className="flex items-center justify-end gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2 dark:border-gray-700 dark:bg-gray-900">
          <span className="text-xs text-gray-500 dark:text-gray-400">View only</span>
          <button
            type="button"
            disabled={busy || !currentUserId}
            onClick={() => void acquireLock()}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Edit Map
          </button>
        </div>
      ) : null}

      {isEditing && !lockedByOther ? (
        <div className="flex items-center justify-end gap-2 border-b border-gray-200 bg-green-50 px-4 py-2 dark:border-green-900/40 dark:bg-green-950/30">
          <span className="text-xs font-medium text-green-900 dark:text-green-100">Editing</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              onCancelEdits?.();
              void releaseLock();
            }}
            className="rounded-md border border-gray-400 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel Edits
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              onSaveEdits?.();
              void releaseLock();
            }}
            className="rounded-md border border-green-700 bg-white px-3 py-1.5 text-sm font-medium text-green-900 hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save Edits
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div
        className={`${bodyClassName ?? "min-h-0 flex-1"} ${blockInteraction ? "opacity-95" : ""}`}
      >
        {typeof children === "function" ? children({ readOnly }) : children}
      </div>
    </div>
  );
}
