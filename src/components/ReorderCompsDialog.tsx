"use client";

import { useState, useCallback } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Bars3Icon, XMarkIcon, InformationCircleIcon } from "@heroicons/react/24/outline";
import { type Comparable, type ComparableType } from "~/utils/projectStore";
import { sortComparables } from "~/utils/comparable-sort";

interface ReorderCompsDialogProps {
  projectId: string;
  type: ComparableType;
  comparables: Comparable[];
  onSave: (orderedIds: string[]) => Promise<void>;
  onClose: () => void;
}

function typeLabel(type: ComparableType, index: number): string {
  switch (type) {
    case "Land":
      return `LAND #${index + 1}`;
    case "Sales":
      return `SALE #${index + 1}`;
    case "Rentals":
      return `RENTAL #${index + 1}`;
  }
}

function typeBadgeClass(type: ComparableType): string {
  switch (type) {
    case "Land":
      return "bg-emerald-950/80 text-emerald-300 ring-1 ring-emerald-800/80";
    case "Sales":
      return "bg-blue-950/80 text-blue-300 ring-1 ring-blue-800/80";
    case "Rentals":
      return "bg-violet-950/80 text-violet-300 ring-1 ring-violet-800/80";
  }
}

function sectionHeading(type: ComparableType): string {
  switch (type) {
    case "Land":
      return "Reorder Land Comparables";
    case "Sales":
      return "Reorder Sales Comparables";
    case "Rentals":
      return "Reorder Rental Comparables";
  }
}

// ── Sortable row ─────────────────────────────────────────────────────────────

interface SortableRowProps {
  comp: Comparable;
  index: number;
  type: ComparableType;
}

function SortableRow({ comp, index, type }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: comp.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition ${
        isDragging
          ? "border-blue-600/60 bg-blue-950/30 shadow-lg opacity-90"
          : "border-gray-700/60 bg-gray-800/60 hover:border-gray-600"
      }`}
    >
      {/* Drag handle */}
      <button
        type="button"
        className="cursor-grab touch-none text-gray-500 hover:text-gray-300 active:cursor-grabbing"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
      >
        <Bars3Icon className="h-4 w-4" />
      </button>

      {/* New number badge */}
      <span
        className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold tracking-wide ${typeBadgeClass(type)}`}
      >
        {typeLabel(type, index)}
      </span>

      {/* Address */}
      <span className="min-w-0 flex-1 truncate text-sm text-gray-200">
        {comp.address || comp.addressForDisplay || "—"}
      </span>
    </div>
  );
}

// ── Main dialog ───────────────────────────────────────────────────────────────

export function ReorderCompsDialog({
  projectId: _projectId,
  type,
  comparables,
  onSave,
  onClose,
}: ReorderCompsDialogProps) {
  const [items, setItems] = useState<Comparable[]>(() =>
    sortComparables(comparables),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setItems((current) => {
      const oldIndex = current.findIndex((c) => c.id === active.id);
      const newIndex = current.findIndex((c) => c.id === over.id);
      return arrayMove(current, oldIndex, newIndex);
    });
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      await onSave(items.map((c) => c.id));
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save order");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex w-full max-w-md flex-col overflow-hidden rounded-xl border border-gray-700 bg-gray-900 shadow-2xl"
        style={{ maxHeight: "85vh" }}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-800 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-100">
            {sectionHeading(type)}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-gray-200"
            aria-label="Close"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Instructions */}
        <p className="shrink-0 px-5 pt-3 pb-1 text-xs text-gray-500">
          Drag comps into the desired order. Numbers will be reassigned 1 → {items.length} on save.
        </p>

        {/* Sortable list */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={items.map((c) => c.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {items.map((comp, index) => (
                  <SortableRow key={comp.id} comp={comp} index={index} type={type} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        {/* Info note */}
        <div className="shrink-0 flex items-start gap-2 border-t border-gray-800 bg-gray-900/50 px-5 py-3">
          <InformationCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-gray-600" />
          <p className="text-xs text-gray-500">
            Saved report discussion sections may reference old comp numbers and will need to be regenerated.
          </p>
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-between border-t border-gray-800 px-5 py-3">
          {saveError ? (
            <p className="text-xs text-red-400 truncate">{saveError}</p>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="rounded-md px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200 disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? "Saving…" : "Save Order"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
