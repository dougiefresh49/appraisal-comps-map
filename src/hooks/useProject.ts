"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  normalizeProjectData,
  type ProjectData,
} from "~/utils/projectStore";
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
      prev.subject !== next.subject ||
      prev.clientCompany !== next.clientCompany ||
      prev.clientName !== next.clientName ||
      prev.propertyType !== next.propertyType ||
      prev.subjectPhotosFolderId !== next.subjectPhotosFolderId ||
      prev.projectFolderId !== next.projectFolderId
    ) {
      await upsertProjectMetadata(projectId, {
        subject: next.subject,
        clientCompany: next.clientCompany,
        clientName: next.clientName,
        propertyType: next.propertyType,
        subjectPhotosFolderId: next.subjectPhotosFolderId,
        projectFolderId: next.projectFolderId,
      });
    }

    const prevCompIds = new Set(prev.comparables.map((c) => c.id));
    const nextCompIds = new Set(next.comparables.map((c) => c.id));

    for (const comp of next.comparables) {
      const prevComp = prev.comparables.find((c) => c.id === comp.id);
      if (!prevComp || prevComp !== comp) {
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
      if (!prevMap || prevMap !== map) {
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
