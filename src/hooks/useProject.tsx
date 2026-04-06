"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  normalizeProjectData,
  DEFAULT_APPROACHES,
  type Comparable,
  type MapView,
  type ProjectData,
} from "~/utils/projectStore";
import { createClient } from "~/utils/supabase/client";
import {
  fetchProject,
  upsertProjectMetadata,
  type ProjectMetadataPatch,
  upsertComparable,
  upsertMapView,
  deleteComparable as deleteCompFromDb,
  deleteMap as deleteMapFromDb,
} from "~/lib/supabase-queries";

/** Align layout + pages that pass raw or decoded `[projectId]` segments. */
function normalizeRouteProjectId(projectId: string): string {
  try {
    return decodeURIComponent(projectId);
  } catch {
    return projectId;
  }
}

export type UseProjectResult = {
  project: ProjectData | undefined;
  projectName: string;
  projectExists: boolean;
  isLoading: boolean;
  updateProject: (updater: (project: ProjectData) => ProjectData) => void;
};

type ProjectWorkspaceContextValue = UseProjectResult & {
  workspaceProjectId: string;
};

const ProjectWorkspaceContext = createContext<ProjectWorkspaceContextValue | null>(
  null,
);

/**
 * Mount once under `/project/[projectId]` so the sidebar and all pages share
 * the same project state (updates from one appear everywhere).
 */
export function ProjectWorkspaceProvider({
  projectId,
  children,
}: {
  projectId: string;
  children: ReactNode;
}) {
  const canonicalId = normalizeRouteProjectId(projectId);
  const state = useProjectState(canonicalId);
  const value: ProjectWorkspaceContextValue = {
    ...state,
    workspaceProjectId: canonicalId,
  };

  return (
    <ProjectWorkspaceContext.Provider value={value}>
      {children}
    </ProjectWorkspaceContext.Provider>
  );
}

export function useProject(projectId: string): UseProjectResult {
  const canonicalId = normalizeRouteProjectId(projectId);
  const ctx = useContext(ProjectWorkspaceContext);
  if (ctx === null || ctx.workspaceProjectId !== canonicalId) {
    throw new Error(
      "useProject must be used within ProjectWorkspaceProvider (project layout).",
    );
  }
  return {
    project: ctx.project,
    projectName: ctx.projectName,
    projectExists: ctx.projectExists,
    isLoading: ctx.isLoading,
    updateProject: ctx.updateProject,
  };
}

function useProjectState(projectId: string): UseProjectResult {
  const [project, setProject] = useState<ProjectData | undefined>(undefined);
  const [projectName, setProjectName] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [projectExists, setProjectExists] = useState(false);

  const prevProjectRef = useRef<ProjectData | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const result = await fetchProject(projectId);
        if (cancelled) return;

        if (result) {
          const normalized = normalizeProjectData(result.project);
          setProject(normalized);
          setProjectName(result.name);
          setProjectExists(true);
          prevProjectRef.current = normalized;
        } else {
          setProject(undefined);
          setProjectExists(false);
        }
      } catch (err) {
        console.error("Failed to fetch project", err);
        if (!cancelled) {
          setProject(undefined);
          setProjectExists(false);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!projectExists) return;
    let cancelled = false;
    const supabase = createClient();
    const channel = supabase
      .channel(`project-${projectId}-comparables`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "comparables",
          filter: `project_id=eq.${projectId}`,
        },
        () => {
          void (async () => {
            const result = await fetchProject(projectId);
            if (cancelled || !result) return;
            setProject(normalizeProjectData(result.project));
          })();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [projectId, projectExists]);

  const updateProject = useCallback(
    (updater: (project: ProjectData) => ProjectData) => {
      setProject((prev) => {
        if (!prev) return prev;
        const updated = updater(prev);
        void persistChanges(projectId, prev, updated);
        prevProjectRef.current = updated;
        return updated;
      });
    },
    [projectId],
  );

  return {
    project,
    projectName,
    projectExists,
    isLoading,
    updateProject,
  };
}

/**
 * Diffs the previous and updated project state and persists only the
 * changed portions to Supabase. This keeps the optimistic local update
 * fast while writing granular changes to the database.
 */
async function persistChanges(
  projectId: string,
  prev: ProjectData,
  next: ProjectData,
) {
  try {
    const metaPatch: ProjectMetadataPatch = {};
    if (prev.clientCompany !== next.clientCompany)
      metaPatch.clientCompany = next.clientCompany ?? null;
    if (prev.clientName !== next.clientName)
      metaPatch.clientName = next.clientName ?? null;
    if (prev.propertyType !== next.propertyType)
      metaPatch.propertyType = next.propertyType ?? null;
    if (prev.projectFolderId !== next.projectFolderId)
      metaPatch.projectFolderId = next.projectFolderId ?? null;
    if (prev.effectiveDate !== next.effectiveDate)
      metaPatch.effectiveDate = next.effectiveDate ?? null;
    if (prev.reportDueDate !== next.reportDueDate)
      metaPatch.reportDueDate = next.reportDueDate ?? null;
    if (prev.exposureTime !== next.exposureTime)
      metaPatch.exposureTime = next.exposureTime ?? null;
    if (prev.highestBestUse !== next.highestBestUse)
      metaPatch.highestBestUse = next.highestBestUse ?? null;
    if (prev.insurancePricePerSf !== next.insurancePricePerSf)
      metaPatch.insurancePricePerSf = next.insurancePricePerSf ?? null;
    if (prev.vacancyRate !== next.vacancyRate)
      metaPatch.vacancyRate = next.vacancyRate ?? null;
    if (
      JSON.stringify(prev.approaches ?? DEFAULT_APPROACHES) !==
      JSON.stringify(next.approaches ?? DEFAULT_APPROACHES)
    )
      metaPatch.approaches = next.approaches ?? null;

    if (Object.keys(metaPatch).length > 0) {
      await upsertProjectMetadata(projectId, metaPatch);
    }

    if (prev.subject !== next.subject && next.subject) {
      const supabase = createClient();
      const coreUpdate: Record<string, unknown> = {};
      if (next.subject.address) coreUpdate.Address = next.subject.address;
      if (next.subject.legalDescription) coreUpdate.Legal = next.subject.legalDescription;
      if (next.subject.acres) coreUpdate["Land Size (AC)"] = parseFloat(next.subject.acres) || next.subject.acres;

      if (Object.keys(coreUpdate).length > 0) {
        const { data: existing } = await supabase
          .from("subject_data")
          .select("core")
          .eq("project_id", projectId)
          .maybeSingle();

        const mergedCore = { ...((existing?.core ?? {}) as Record<string, unknown>), ...coreUpdate };
        await supabase
          .from("subject_data")
          .upsert({ project_id: projectId, core: mergedCore, updated_at: new Date().toISOString() }, { onConflict: "project_id" });
      }
    }

    const prevCompIds = new Set(prev.comparables.map((c) => c.id));
    const nextCompIds = new Set(next.comparables.map((c) => c.id));

    for (const comp of next.comparables) {
      const prevComp = prev.comparables.find((c) => c.id === comp.id);
      if (!prevComp || !shallowEqualComp(prevComp, comp)) {
        await upsertComparable(projectId, comp);
      }
    }

    for (const compId of prevCompIds) {
      if (!nextCompIds.has(compId)) {
        await deleteCompFromDb(compId);
      }
    }

    const prevMapIds = new Set(prev.maps.map((m) => m.id));
    const nextMapIds = new Set(next.maps.map((m) => m.id));

    for (const map of next.maps) {
      const prevMap = prev.maps.find((m) => m.id === map.id);
      if (!prevMap || !shallowEqualMap(prevMap, map)) {
        await upsertMapView(projectId, map);
      }
    }

    for (const mapId of prevMapIds) {
      if (!nextMapIds.has(mapId)) {
        await deleteMapFromDb(mapId);
      }
    }
  } catch (err) {
      console.error("Failed to persist project changes to Supabase", err);
  }
}

function shallowEqualComp(a: Comparable, b: Comparable): boolean {
  return (
    a.id === b.id &&
    a.type === b.type &&
    a.number === b.number &&
    a.address === b.address &&
    a.addressForDisplay === b.addressForDisplay &&
    a.folderId === b.folderId &&
    a.instrumentNumber === b.instrumentNumber &&
    a.parsedDataStatus === b.parsedDataStatus &&
    JSON.stringify(a.apn) === JSON.stringify(b.apn) &&
    JSON.stringify(a.images) === JSON.stringify(b.images)
  );
}

function shallowEqualMap(a: MapView, b: MapView): boolean {
  return (
    a.id === b.id &&
    a.type === b.type &&
    a.linkedCompId === b.linkedCompId &&
    a.mapCenter.lat === b.mapCenter.lat &&
    a.mapCenter.lng === b.mapCenter.lng &&
    a.mapZoom === b.mapZoom &&
    a.bubbleSize === b.bubbleSize &&
    a.hideUI === b.hideUI &&
    a.documentFrameSize === b.documentFrameSize &&
    a.imageFileId === b.imageFileId &&
    JSON.stringify(a.drawings) === JSON.stringify(b.drawings) &&
    JSON.stringify(a.markers) === JSON.stringify(b.markers)
  );
}
