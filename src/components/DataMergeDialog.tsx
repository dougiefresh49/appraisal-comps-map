"use client";

import { useState, useCallback, useMemo } from "react";
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface DataMergeDialogProps {
  isOpen: boolean;
  title: string;
  currentData: Record<string, unknown>;
  proposedData: Record<string, unknown>;
  /** Optional display labels for field keys. */
  fieldLabels?: Record<string, string>;
  onConfirm: (merged: Record<string, unknown>) => void | Promise<void>;
  onCancel: () => void;
}

/** Keys that contain arrays — handled with item-level checklist. */
const ARRAY_KEYS = new Set(["_parcelData", "_parcelImprovements", "parcels", "improvements"]);

type ScalarChoice = "current" | "proposed";
type ArrayChoice = "current" | "proposed" | "both";

interface FieldState {
  scalar?: ScalarChoice;
  array?: ArrayChoice;
  /** New-only fields start with an "add" checkbox. */
  addNew?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function isEmpty(v: unknown): boolean {
  if (v == null || v === "") return true;
  if (Array.isArray(v) && v.length === 0) return true;
  return false;
}

function displayValue(v: unknown): string {
  if (v == null || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return `[${v.length} item${v.length !== 1 ? "s" : ""}]`;
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return "[object]";
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  return String(v);
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a === "object") {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

interface ArrayFieldRowProps {
  fieldKey: string;
  label: string;
  currentArr: unknown[];
  proposedArr: unknown[];
  choice: ArrayChoice;
  onChange: (choice: ArrayChoice) => void;
}

function ArrayFieldRow({ label, currentArr, proposedArr, choice, onChange }: ArrayFieldRowProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/60 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Current: {currentArr.length} item{currentArr.length !== 1 ? "s" : ""} · Proposed: {proposedArr.length} item{proposedArr.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ArrayChoiceButton label="Keep" active={choice === "current"} onClick={() => onChange("current")} />
          <ArrayChoiceButton label="Replace" active={choice === "proposed"} onClick={() => onChange("proposed")} color="blue" />
          <ArrayChoiceButton label="Both" active={choice === "both"} onClick={() => onChange("both")} color="purple" />
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="ml-1 rounded-md p-1 text-gray-500 hover:text-gray-300 hover:bg-gray-700 transition"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-gray-700 px-4 py-3 space-y-2">
          {proposedArr.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-400 mb-1.5">Proposed items</p>
              {proposedArr.map((item, i) => (
                <div key={i} className="rounded-md bg-blue-950/30 border border-blue-900/40 px-3 py-2 text-xs text-gray-300 font-mono mb-1">
                  {displayValue(item)}
                </div>
              ))}
            </div>
          )}
          {currentArr.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Current items</p>
              {currentArr.map((item, i) => (
                <div key={i} className="rounded-md bg-gray-900/60 border border-gray-700 px-3 py-2 text-xs text-gray-400 font-mono mb-1">
                  {displayValue(item)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ArrayChoiceButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
  color?: "gray" | "blue" | "purple";
}

function ArrayChoiceButton({ label, active, onClick, color = "gray" }: ArrayChoiceButtonProps) {
  const base = "rounded-md px-2.5 py-1 text-xs font-medium transition border";
  const colors = {
    gray: active
      ? "border-gray-500 bg-gray-700 text-gray-100"
      : "border-gray-700 bg-transparent text-gray-500 hover:text-gray-300 hover:border-gray-600",
    blue: active
      ? "border-blue-600 bg-blue-600 text-white"
      : "border-gray-700 bg-transparent text-gray-500 hover:text-blue-400 hover:border-blue-700",
    purple: active
      ? "border-purple-600 bg-purple-900/60 text-purple-200"
      : "border-gray-700 bg-transparent text-gray-500 hover:text-purple-400 hover:border-purple-700",
  };
  return (
    <button type="button" onClick={onClick} className={`${base} ${colors[color]}`}>
      {label}
    </button>
  );
}

interface ScalarFieldRowProps {
  fieldKey: string;
  label: string;
  currentVal: unknown;
  proposedVal: unknown;
  isNew: boolean;
  choice: ScalarChoice;
  addNew: boolean;
  onChange: (choice: ScalarChoice) => void;
  onToggleAdd: (add: boolean) => void;
}

function ScalarFieldRow({
  label,
  currentVal,
  proposedVal,
  isNew,
  choice,
  addNew,
  onChange,
  onToggleAdd,
}: ScalarFieldRowProps) {
  if (isNew) {
    return (
      <div className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg border border-dashed border-blue-800/50 bg-blue-950/20 px-4 py-2.5">
        <div className="min-w-0">
          <p className="text-xs font-medium text-blue-300">{label}</p>
          <p className="text-sm text-gray-200 truncate">{displayValue(proposedVal)}</p>
        </div>
        <label className="flex items-center gap-2 cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={addNew}
            onChange={(e) => onToggleAdd(e.target.checked)}
            className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500 focus:ring-offset-gray-900"
          />
          <span className="text-xs text-gray-400">Add</span>
        </label>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-700 overflow-hidden">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] divide-x divide-gray-700">
        {/* Current */}
        <button
          type="button"
          onClick={() => onChange("current")}
          className={`group flex items-start gap-2.5 px-3 py-2.5 text-left transition ${
            choice === "current"
              ? "bg-gray-700/80"
              : "bg-gray-800/40 hover:bg-gray-800/70"
          }`}
        >
          <div className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border flex items-center justify-center transition
            ${choice === 'current' ? 'border-gray-400 bg-gray-400' : 'border-gray-600 group-hover:border-gray-500'}">
            {choice === "current" && <div className="h-1.5 w-1.5 rounded-full bg-gray-900" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-0.5">{label} · Current</p>
            <p className="text-xs text-gray-300 break-words">{displayValue(currentVal)}</p>
          </div>
        </button>

        {/* Proposed */}
        <button
          type="button"
          onClick={() => onChange("proposed")}
          className={`group flex items-start gap-2.5 px-3 py-2.5 text-left transition ${
            choice === "proposed"
              ? "bg-blue-950/50 border-l border-blue-900/40"
              : "bg-gray-800/40 hover:bg-gray-800/70"
          }`}
        >
          <div className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border flex items-center justify-center transition ${
            choice === "proposed" ? "border-blue-500 bg-blue-500" : "border-gray-600 group-hover:border-blue-600"
          }`}>
            {choice === "proposed" && <div className="h-1.5 w-1.5 rounded-full bg-blue-950" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-400 mb-0.5">{label} · New</p>
            <p className="text-xs text-gray-200 break-words">{displayValue(proposedVal)}</p>
          </div>
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main DataMergeDialog
// ─────────────────────────────────────────────────────────────────────────────

export function DataMergeDialog({
  isOpen,
  title,
  currentData,
  proposedData,
  fieldLabels,
  onConfirm,
  onCancel,
}: DataMergeDialogProps) {
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [fieldState, setFieldState] = useState<Record<string, FieldState>>({});

  // Categorize fields on every render (stable memo)
  const { changedScalars, newFields, arrayFields, unchangedFields } = useMemo(() => {
    const allKeys = new Set([...Object.keys(currentData), ...Object.keys(proposedData)]);
    const changed: string[] = [];
    const newOnly: string[] = [];
    const arrays: string[] = [];
    const unchanged: string[] = [];

    for (const key of allKeys) {
      const cur = currentData[key];
      const prop = proposedData[key];

      if (ARRAY_KEYS.has(key) || (Array.isArray(cur) && Array.isArray(prop))) {
        arrays.push(key);
        continue;
      }

      if (!(key in proposedData) || isEmpty(prop)) {
        // Key not in proposed or proposed is empty — skip (don't offer to blank)
        continue;
      }

      if (!(key in currentData) || isEmpty(cur)) {
        newOnly.push(key);
        continue;
      }

      if (valuesEqual(cur, prop)) {
        unchanged.push(key);
      } else {
        changed.push(key);
      }
    }

    return {
      changedScalars: changed.sort(),
      newFields: newOnly.sort(),
      arrayFields: arrays.sort(),
      unchangedFields: unchanged.sort(),
    };
  }, [currentData, proposedData]);

  const getLabel = useCallback(
    (key: string) => fieldLabels?.[key] ?? key,
    [fieldLabels],
  );

  // Default choices for unset fields
  const getScalarChoice = (key: string): ScalarChoice =>
    (fieldState[key]?.scalar) ?? "proposed";

  const getArrayChoice = (key: string): ArrayChoice =>
    (fieldState[key]?.array) ?? "proposed";

  const getAddNew = (key: string): boolean =>
    fieldState[key]?.addNew ?? true;

  const setScalarChoice = (key: string, choice: ScalarChoice) => {
    setFieldState((prev) => ({ ...prev, [key]: { ...prev[key], scalar: choice } }));
  };

  const setArrayChoice = (key: string, choice: ArrayChoice) => {
    setFieldState((prev) => ({ ...prev, [key]: { ...prev[key], array: choice } }));
  };

  const setAddNew = (key: string, add: boolean) => {
    setFieldState((prev) => ({ ...prev, [key]: { ...prev[key], addNew: add } }));
  };

  const handleAcceptAll = () => {
    const next: Record<string, FieldState> = {};
    for (const key of changedScalars) next[key] = { scalar: "proposed" };
    for (const key of newFields) next[key] = { addNew: true };
    for (const key of arrayFields) next[key] = { array: "proposed" };
    setFieldState(next);
  };

  const handleKeepAll = () => {
    const next: Record<string, FieldState> = {};
    for (const key of changedScalars) next[key] = { scalar: "current" };
    for (const key of newFields) next[key] = { addNew: false };
    for (const key of arrayFields) next[key] = { array: "current" };
    setFieldState(next);
  };

  const buildMerged = (): Record<string, unknown> => {
    const merged = { ...currentData };

    for (const key of changedScalars) {
      const choice = getScalarChoice(key);
      merged[key] = choice === "proposed" ? proposedData[key] : currentData[key];
    }

    for (const key of newFields) {
      if (getAddNew(key)) {
        merged[key] = proposedData[key];
      }
    }

    for (const key of arrayFields) {
      const cur = (Array.isArray(currentData[key]) ? currentData[key] : []) as unknown[];
      const prop = (Array.isArray(proposedData[key]) ? proposedData[key] : []) as unknown[];
      const choice = getArrayChoice(key);
      if (choice === "current") merged[key] = cur;
      else if (choice === "proposed") merged[key] = prop;
      else merged[key] = [...cur, ...prop];
    }

    return merged;
  };

  const handleConfirm = async () => {
    setIsSaving(true);
    try {
      await onConfirm(buildMerged());
    } finally {
      setIsSaving(false);
    }
  };

  const totalChanges = changedScalars.length + newFields.length + arrayFields.length;
  const hasNoChanges = totalChanges === 0;

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSaving) onCancel();
      }}
    >
      <div className="flex w-full max-w-2xl flex-col rounded-xl bg-gray-900 shadow-2xl ring-1 ring-gray-700 max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-700 px-6 py-4 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-100">{title}</h2>
            {!hasNoChanges && (
              <p className="text-xs text-gray-500 mt-0.5">
                {changedScalars.length > 0 && `${changedScalars.length} changed field${changedScalars.length !== 1 ? "s" : ""}`}
                {newFields.length > 0 && `${changedScalars.length > 0 ? " · " : ""}${newFields.length} new field${newFields.length !== 1 ? "s" : ""}`}
                {arrayFields.length > 0 && `${(changedScalars.length + newFields.length) > 0 ? " · " : ""}${arrayFields.length} array field${arrayFields.length !== 1 ? "s" : ""}`}
              </p>
            )}
          </div>
          <button
            onClick={onCancel}
            disabled={isSaving}
            className="rounded-md p-1 text-gray-400 transition hover:bg-gray-800 hover:text-gray-200 disabled:opacity-50"
            aria-label="Close"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Shortcut bar */}
        {!hasNoChanges && (
          <div className="flex items-center gap-2 border-b border-gray-700 bg-gray-800/50 px-6 py-2.5 shrink-0">
            <span className="text-xs text-gray-500 mr-1">Shortcuts:</span>
            <button
              type="button"
              onClick={handleAcceptAll}
              className="rounded-md border border-blue-700 bg-blue-950/60 px-3 py-1 text-xs font-medium text-blue-300 transition hover:bg-blue-900/60"
            >
              Accept all new
            </button>
            <button
              type="button"
              onClick={handleKeepAll}
              className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1 text-xs font-medium text-gray-400 transition hover:bg-gray-700 hover:text-gray-200"
            >
              Keep all current
            </button>
          </div>
        )}

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 min-h-0">
          {hasNoChanges ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-900/40 text-emerald-400">
                <CheckIcon className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium text-gray-300">No changes detected</p>
              <p className="mt-1 text-xs text-gray-500">
                The proposed data is identical to what&apos;s currently saved.
              </p>
            </div>
          ) : (
            <>
              {/* Changed scalar fields */}
              {changedScalars.length > 0 && (
                <section>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Changed Fields
                  </h3>
                  <div className="space-y-2">
                    {changedScalars.map((key) => (
                      <ScalarFieldRow
                        key={key}
                        fieldKey={key}
                        label={getLabel(key)}
                        currentVal={currentData[key]}
                        proposedVal={proposedData[key]}
                        isNew={false}
                        choice={getScalarChoice(key)}
                        addNew={false}
                        onChange={(c) => setScalarChoice(key, c)}
                        onToggleAdd={() => {/* not used */}}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* New-only fields */}
              {newFields.length > 0 && (
                <section>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                    New Fields
                  </h3>
                  <div className="space-y-2">
                    {newFields.map((key) => (
                      <ScalarFieldRow
                        key={key}
                        fieldKey={key}
                        label={getLabel(key)}
                        currentVal={currentData[key]}
                        proposedVal={proposedData[key]}
                        isNew={true}
                        choice="proposed"
                        addNew={getAddNew(key)}
                        onChange={() => {/* not used */}}
                        onToggleAdd={(add) => setAddNew(key, add)}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Array fields */}
              {arrayFields.length > 0 && (
                <section>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Array Fields
                  </h3>
                  <div className="space-y-2">
                    {arrayFields.map((key) => {
                      const cur = (Array.isArray(currentData[key]) ? currentData[key] : []) as unknown[];
                      const prop = (Array.isArray(proposedData[key]) ? proposedData[key] : []) as unknown[];
                      return (
                        <ArrayFieldRow
                          key={key}
                          fieldKey={key}
                          label={getLabel(key)}
                          currentArr={cur}
                          proposedArr={prop}
                          choice={getArrayChoice(key)}
                          onChange={(c) => setArrayChoice(key, c)}
                        />
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Unchanged fields toggle */}
              {unchangedFields.length > 0 && (
                <section>
                  <button
                    type="button"
                    onClick={() => setShowUnchanged((v) => !v)}
                    className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-400 transition"
                  >
                    {showUnchanged ? (
                      <ChevronUpIcon className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDownIcon className="h-3.5 w-3.5" />
                    )}
                    {showUnchanged ? "Hide" : "Show"} unchanged ({unchangedFields.length})
                  </button>
                  {showUnchanged && (
                    <div className="mt-3 space-y-1.5">
                      {unchangedFields.map((key) => (
                        <div
                          key={key}
                          className="flex items-center gap-3 rounded-md bg-gray-800/40 px-3 py-2"
                        >
                          <p className="w-32 shrink-0 text-xs text-gray-600">{getLabel(key)}</p>
                          <p className="text-xs text-gray-500">{displayValue(currentData[key])}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-700 px-6 py-4 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="rounded-md border border-gray-700 px-4 py-2 text-sm font-medium text-gray-300 transition hover:bg-gray-800 disabled:opacity-50"
          >
            Cancel
          </button>
          {hasNoChanges ? (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md bg-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 transition hover:bg-gray-600"
            >
              Close
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={isSaving}
              className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving && (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              )}
              {isSaving ? "Saving…" : "Confirm Merge"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
