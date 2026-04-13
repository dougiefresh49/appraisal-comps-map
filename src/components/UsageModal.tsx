"use client";

import { useEffect, useMemo, useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { useAuth } from "~/hooks/useAuth";
import { getGeminiModelDisplayName } from "~/lib/chat-model-presets";
import { formatUsd } from "~/lib/gemini-pricing";

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function defaultRange(): { from: Date; to: Date } {
  const to = endOfDay(new Date());
  const from = startOfDay(new Date());
  from.setDate(from.getDate() - 30);
  return { from, to };
}

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface UsageRow {
  id: string;
  createdAt: string;
  model: string;
  promptTokens: number | null;
  candidatesTokens: number | null;
  totalTokens: number | null;
  projectId: string;
  threadId: string;
  estimatedUsd: number | null;
  estimatedUsdFormatted: string;
}

interface SummaryResponse {
  pricingNote: string;
  range: { from: string; to: string };
  filterUserId: string;
  currentUserId: string;
  userOptions: { id: string; label: string }[];
  summary: {
    rowCount: number;
    totalPromptTokens: number;
    totalCandidatesTokens: number;
    totalEstimatedUsd: number;
    totalEstimatedUsdFormatted: string;
    rowsWithUnknownModelPricing: number;
  };
  rows: UsageRow[];
  threadMeta?: Record<string, { title: string | null; projectId: string }>;
}

export function UsageModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [fromYmd, setFromYmd] = useState(() => formatYmd(defaultRange().from));
  const [toYmd, setToYmd] = useState(() => formatYmd(defaultRange().to));
  const [userId, setUserId] = useState("");
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [groupByThread, setGroupByThread] = useState(true);

  const effectiveUserId = userId !== "" ? userId : (user?.id ?? "");

  useEffect(() => {
    if (!isOpen || !user?.id) return;
    const { from, to } = defaultRange();
    setFromYmd(formatYmd(from));
    setToYmd(formatYmd(to));
    setUserId(user.id);
    setData(null);
    setError(null);
  }, [isOpen, user?.id]);

  useEffect(() => {
    if (!isOpen || !user?.id || !effectiveUserId) return;

    const from = startOfDay(new Date(`${fromYmd}T12:00:00`));
    const to = endOfDay(new Date(`${toYmd}T12:00:00`));
    if (from > to) {
      setError("Start date must be on or before end date.");
      return;
    }
    setError(null);

    setLoading(true);
    const q = new URLSearchParams({
      from: from.toISOString(),
      to: to.toISOString(),
      userId: effectiveUserId,
    });
    fetch(`/api/gemini-usage/summary?${q}`)
      .then(async (r) => {
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `Request failed (${r.status})`);
        }
        return r.json() as Promise<SummaryResponse>;
      })
      .then(setData)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Failed to load usage"),
      )
      .finally(() => setLoading(false));
  }, [isOpen, user?.id, fromYmd, toYmd, effectiveUserId]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const note = useMemo(() => data?.pricingNote ?? "", [data?.pricingNote]);

  const threadGroups = useMemo(() => {
    if (!data?.rows?.length) return [];
    const meta = data.threadMeta ?? {};
    const map = new Map<string, UsageRow[]>();
    for (const r of data.rows) {
      const list = map.get(r.threadId) ?? [];
      list.push(r);
      map.set(r.threadId, list);
    }
    const groups = [...map.entries()].map(([threadId, rows]) => {
      const m = meta[threadId];
      const trimmedTitle = m?.title?.trim() ?? "";
      const title = trimmedTitle !== "" ? trimmedTitle : null;
      const label =
        title && title.length > 0
          ? title
          : `Thread ${threadId.slice(0, 8)}…`;
      let subUsd = 0;
      let subPrompt = 0;
      let subCand = 0;
      let latest = 0;
      for (const row of rows) {
        subPrompt += Number(row.promptTokens ?? 0);
        subCand += Number(row.candidatesTokens ?? 0);
        if (row.estimatedUsd != null) subUsd += row.estimatedUsd;
        const t = new Date(row.createdAt).getTime();
        if (t > latest) latest = t;
      }
      rows.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      return {
        threadId,
        label,
        projectId: m?.projectId ?? rows[0]?.projectId ?? "",
        rows,
        latestAt: latest,
        subPrompt,
        subCand,
        subUsd,
      };
    });
    groups.sort((a, b) => b.latestAt - a.latestAt);
    return groups;
  }, [data]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="usage-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50 dark:bg-black/60"
        aria-label="Close usage"
        onClick={onClose}
      />
      <div className="relative flex max-h-[min(90vh,880px)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-700">
          <div className="min-w-0">
            <h2
              id="usage-modal-title"
              className="text-lg font-semibold text-gray-900 dark:text-gray-100"
            >
              Usage
            </h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Chat (Gemini) token usage and estimated cost — Standard paid list
              prices.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            aria-label="Close"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="shrink-0 space-y-3 border-b border-gray-100 px-5 py-4 dark:border-gray-800">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-gray-600 dark:text-gray-300">
              From
              <input
                type="date"
                value={fromYmd}
                onChange={(e) => setFromYmd(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-950 dark:text-gray-100"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-gray-600 dark:text-gray-300">
              To
              <input
                type="date"
                value={toYmd}
                onChange={(e) => setToYmd(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-950 dark:text-gray-100"
              />
            </label>
            <label className="flex min-w-[180px] flex-col gap-1 text-xs font-medium text-gray-600 dark:text-gray-300">
              User
              <select
                value={effectiveUserId}
                onChange={(e) => setUserId(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-950 dark:text-gray-100"
              >
                {(data?.userOptions ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex cursor-pointer select-none items-center gap-2 self-end pb-1 text-xs font-medium text-gray-600 dark:text-gray-300">
              <input
                type="checkbox"
                checked={groupByThread}
                onChange={(e) => setGroupByThread(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-950 dark:focus:ring-offset-gray-900"
              />
              Group by thread
            </label>
          </div>
          {error ? (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Loading…
            </p>
          ) : data ? (
            <>
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-gray-200 bg-gray-50/80 px-3 py-3 dark:border-gray-700 dark:bg-gray-800/50">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Est. total
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-gray-900 dark:text-gray-50">
                    {data.summary.totalEstimatedUsdFormatted}
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50/80 px-3 py-3 dark:border-gray-700 dark:bg-gray-800/50">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Input tokens
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-gray-900 dark:text-gray-50">
                    {data.summary.totalPromptTokens.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50/80 px-3 py-3 dark:border-gray-700 dark:bg-gray-800/50">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Output tokens
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-gray-900 dark:text-gray-50">
                    {data.summary.totalCandidatesTokens.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50/80 px-3 py-3 dark:border-gray-700 dark:bg-gray-800/50">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Turns
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-gray-900 dark:text-gray-50">
                    {data.summary.rowCount}
                  </p>
                </div>
              </div>

              {data.summary.rowsWithUnknownModelPricing > 0 ? (
                <p className="mb-3 text-xs text-amber-700 dark:text-amber-400/90">
                  {data.summary.rowsWithUnknownModelPricing} row(s) use a model
                  not in the pricing map — those are excluded from the total.
                </p>
              ) : null}

              <p className="mb-3 text-[11px] leading-relaxed text-gray-500 dark:text-gray-500">
                {note}
              </p>

              {data.rows.length === 0 ? (
                <div className="overflow-x-auto rounded-xl border border-gray-200 px-3 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  No chat usage in this range for this user.
                </div>
              ) : groupByThread ? (
                <div className="space-y-4">
                  {threadGroups.map((g) => (
                    <div
                      key={g.threadId}
                      className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-gray-200 bg-gray-50/90 px-3 py-2.5 dark:border-gray-800 dark:bg-gray-800/50">
                        <div className="min-w-0 flex-1">
                          <p
                            className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100"
                            title={g.threadId}
                          >
                            {g.label}
                          </p>
                          <p className="truncate font-mono text-[11px] text-gray-500 dark:text-gray-400">
                            {g.projectId
                              ? `Project ${g.projectId.slice(0, 8)}…`
                              : null}
                            {g.projectId ? " · " : null}
                            {g.rows.length} turn{g.rows.length === 1 ? "" : "s"}
                          </p>
                        </div>
                        <div className="shrink-0 text-right text-xs tabular-nums text-gray-700 dark:text-gray-300">
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {formatUsd(g.subUsd)}
                          </span>
                          <span className="text-gray-500 dark:text-gray-500">
                            {" "}
                            ·{" "}
                          </span>
                          <span>
                            {g.subPrompt.toLocaleString()} in /{" "}
                            {g.subCand.toLocaleString()} out
                          </span>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[640px] text-left text-sm">
                          <thead className="border-b border-gray-100 bg-white text-xs font-semibold uppercase text-gray-600 dark:border-gray-800 dark:bg-gray-900/40 dark:text-gray-400">
                            <tr>
                              <th className="px-3 py-2">Time</th>
                              <th className="px-3 py-2">Model</th>
                              <th className="px-3 py-2 text-right">In</th>
                              <th className="px-3 py-2 text-right">Out</th>
                              <th className="px-3 py-2 text-right">Est.</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {g.rows.map((r) => (
                              <tr
                                key={r.id}
                                className="bg-white dark:bg-gray-900/40"
                              >
                                <td className="whitespace-nowrap px-3 py-2 text-gray-700 tabular-nums dark:text-gray-300">
                                  {new Date(r.createdAt).toLocaleString()}
                                </td>
                                <td
                                  className="max-w-[200px] truncate px-3 py-2 text-gray-800 dark:text-gray-200"
                                  title={r.model}
                                >
                                  {getGeminiModelDisplayName(r.model)}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">
                                  {(r.promptTokens ?? 0).toLocaleString()}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">
                                  {(r.candidatesTokens ?? 0).toLocaleString()}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-gray-900 dark:text-gray-100">
                                  {r.estimatedUsdFormatted}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase text-gray-600 dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-400">
                      <tr>
                        <th className="px-3 py-2">Time</th>
                        <th className="px-3 py-2">Model</th>
                        <th className="px-3 py-2 text-right">In</th>
                        <th className="px-3 py-2 text-right">Out</th>
                        <th className="px-3 py-2 text-right">Est.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {data.rows.map((r) => (
                        <tr
                          key={r.id}
                          className="bg-white dark:bg-gray-900/40"
                        >
                          <td className="whitespace-nowrap px-3 py-2 text-gray-700 tabular-nums dark:text-gray-300">
                            {new Date(r.createdAt).toLocaleString()}
                          </td>
                          <td
                            className="max-w-[200px] truncate px-3 py-2 text-gray-800 dark:text-gray-200"
                            title={r.model}
                          >
                            {getGeminiModelDisplayName(r.model)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">
                            {(r.promptTokens ?? 0).toLocaleString()}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">
                            {(r.candidatesTokens ?? 0).toLocaleString()}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-900 dark:text-gray-100">
                            {r.estimatedUsdFormatted}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No data.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
