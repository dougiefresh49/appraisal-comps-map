"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useProject } from "~/hooks/useProject";
import { MergeCompsDialog, type MergeConflict } from "./MergeCompsDialog";
import { ComparablesList } from "./ComparablesList";
import { MapBanner } from "~/components/MapBanner";
import { CompAddFlow } from "~/components/CompAddFlow";
import {
  type ComparableType,
  type ProjectData,
  getComparablesByType,
  getMapByType,
  mapTypeForCompType,
} from "~/utils/projectStore";

interface ComparablesPageContentProps {
  projectId: string;
  type: ComparableType;
}

function mapBannerImageType(compType: ComparableType): string {
  switch (compType) {
    case "Land":
      return "comps-land";
    case "Sales":
      return "comps-sales";
    case "Rentals":
      return "comps-rentals";
  }
}

function routeSlugForCompType(compType: ComparableType): string {
  switch (compType) {
    case "Land":
      return "land-sales";
    case "Sales":
      return "sales";
    case "Rentals":
      return "rentals";
  }
}

function compSectionHeading(compType: ComparableType): string {
  switch (compType) {
    case "Land":
      return "Land Comparables";
    case "Sales":
      return "Sales Comparables";
    case "Rentals":
      return "Rental Comparables";
  }
}

function compsFolderKey(
  compType: ComparableType,
): "land" | "sales" | "rentals" {
  switch (compType) {
    case "Land":
      return "land";
    case "Sales":
      return "sales";
    case "Rentals":
      return "rentals";
  }
}

export function ComparablesPageContent({
  projectId,
  type,
}: ComparablesPageContentProps) {
  const router = useRouter();
  const { project, updateProject, isLoading, projectExists } =
    useProject(projectId);
  const [mergeConflicts, setMergeConflicts] = useState<MergeConflict[] | null>(
    null,
  );
  const [showAddFlow, setShowAddFlow] = useState(false);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">
          Loading project...
        </div>
      </div>
    );
  }

  if (!projectExists || !project) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">
          Project not found
        </div>
      </div>
    );
  }

  const comparables = getComparablesByType(project, type);
  const typeSlug = routeSlugForCompType(type);
  const comparablesMapHref = `/project/${projectId}/${typeSlug}/comparables-map`;

  const compsFolderIdForType =
    project.folderStructure?.compsFolderIds?.[compsFolderKey(type)];

  const existingFolderIds = comparables
    .map((c) => c.folderId)
    .filter((id): id is string => !!id);

  const handleAddComparable = () => {
    setShowAddFlow(true);
  };

  const handleAddFlowComplete = (compId: string) => {
    router.push(`/project/${projectId}/${typeSlug}/comps/${compId}`);
  };

  const handleComparableChange = (
    id: string,
    field: "address" | "addressForDisplay" | "apn",
    value: string,
  ) => {
    updateProject((proj: ProjectData) => ({
      ...proj,
      comparables: proj.comparables.map((comp) => {
        if (comp.id !== id || comp.type !== type) return comp;

        if (field === "apn") {
          return {
            ...comp,
            apn: value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          };
        }

        return { ...comp, [field]: value };
      }),
    }));
  };

  const handleRemoveComparable = (id: string) => {
    updateProject((proj: ProjectData) => {
      const mType = mapTypeForCompType(type);
      const compsMap = getMapByType(proj, mType);
      let maps = proj.maps.filter(
        (m) => !(m.type === "comp-location" && m.linkedCompId === id),
      );
      if (compsMap) {
        maps = maps.map((m) =>
          m.id === compsMap.id
            ? { ...m, markers: m.markers.filter((mk) => mk.compId !== id) }
            : m,
        );
      }
      return {
        ...proj,
        comparables: proj.comparables.filter((c) => c.id !== id),
        maps,
      };
    });
  };

  return (
    <div className="p-8">
      <MapBanner
        projectId={projectId}
        imageType={mapBannerImageType(type)}
        mapType={mapTypeForCompType(type)}
        editHref={comparablesMapHref}
        height="h-48"
      />

      <div className="mt-6 mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {compSectionHeading(type)}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Manage {type.toLowerCase()} comparables.
          </p>
        </div>
        <button
          type="button"
          onClick={handleAddComparable}
          className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 dark:bg-blue-600 dark:hover:bg-blue-500"
        >
          + Add Comp
        </button>
      </div>

      {mergeConflicts && mergeConflicts.length > 0 && (
        <MergeCompsDialog
          conflicts={mergeConflicts}
          onMerge={() => {
            setMergeConflicts(null);
          }}
          onClose={() => setMergeConflicts(null)}
        />
      )}

      <ComparablesList
        projectId={projectId}
        type={type}
        typeSlug={typeSlug}
        comparables={comparables}
        onAdd={handleAddComparable}
        onRemove={handleRemoveComparable}
        onChange={handleComparableChange}
      />

      {showAddFlow && (
        <CompAddFlow
          projectId={projectId}
          compType={type}
          compsFolderId={compsFolderIdForType}
          projectFolderId={project.projectFolderId}
          existingFolderIds={existingFolderIds}
          onComplete={handleAddFlowComplete}
          onClose={() => setShowAddFlow(false)}
        />
      )}
    </div>
  );
}
