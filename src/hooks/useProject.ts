"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  PROJECTS_STORAGE_KEY,
  CURRENT_PROJECT_STORAGE_KEY,
  normalizeProjectsMap,
  createDefaultProject,
  normalizeProjectData,
  type ProjectData,
  type ProjectsMap,
} from "~/utils/projectStore";

export function useProject(projectId: string) {
  const decodedProjectId = decodeURIComponent(projectId);
  const [projects, setProjects] = useState<ProjectsMap>({});
  const [isLoading, setIsLoading] = useState(true);
  const [projectExists, setProjectExists] = useState(false);

  // Load project data
  useEffect(() => {
    if (typeof window === "undefined") return;

    const stored = window.localStorage.getItem(PROJECTS_STORAGE_KEY);
    let projectStore: ProjectsMap = {};
    
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Record<string, Partial<ProjectData>>;
        projectStore = normalizeProjectsMap(parsed);
      } catch (error) {
        console.error("Failed to parse stored projects", error);
      }
    }

    setProjects(projectStore);
    
    if (projectStore[decodedProjectId]) {
      window.localStorage.setItem(CURRENT_PROJECT_STORAGE_KEY, decodedProjectId);
      setProjectExists(true);
    } else {
      setProjectExists(false);
    }
    
    setIsLoading(false);
  }, [decodedProjectId]);

  // Persist changes
  useEffect(() => {
    if (isLoading) return;
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        PROJECTS_STORAGE_KEY,
        JSON.stringify(projects),
      );
    } catch (error) {
      console.error("Failed to persist projects", error);
    }
  }, [isLoading, projects]);

  const selectedProject = useMemo(() => {
    if (!decodedProjectId || !projects[decodedProjectId]) return undefined;
    return normalizeProjectData(projects[decodedProjectId]);
  }, [projects, decodedProjectId]);

  const updateProject = useCallback(
    (updater: (project: ProjectData) => ProjectData) => {
      setProjects((prev) => {
        const project = prev[decodedProjectId];
        if (!project) return prev;
        const normalized = normalizeProjectData(project);
        const updated = updater(normalized);
        return {
          ...prev,
          [decodedProjectId]: updated,
        };
      });
    },
    [decodedProjectId],
  );

  return {
    project: selectedProject,
    projectExists,
    isLoading,
    updateProject,
    setProjects, // For manual overrides (e.g. JSON edit)
  };
}
