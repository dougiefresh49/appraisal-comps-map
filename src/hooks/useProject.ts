"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  normalizeProjectData,
  type Comparable,
  type MapView,
  type ProjectData,
} from "~/utils/projectStore";
import { createClient } from "~/utils/supabase/client";
import {
  fetchProject,
  upsertProjectMetadata,
  upsertComparable,
  upsertMapView,
  deleteComparable as deleteCompFromDb,
  deleteMap as deleteMapFromDb,
} from "~/lib/supabase-queries";

export function useProject(projectId: string) {
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
    if (
      prev.clientCompany !== next.clientCompany ||
      prev.clientName !== next.clientName ||
      prev.propertyType !== next.propertyType ||
      prev.projectFolderId !== next.projectFolderId
    ) {
      await upsertProjectMetadata(projectId, {
        clientCompany: next.clientCompany,
        clientName: next.clientName,
        propertyType: next.propertyType,
        projectFolderId: next.projectFolderId,
      });
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
