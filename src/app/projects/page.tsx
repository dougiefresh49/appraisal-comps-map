"use client";

import { useEffect, useState, useMemo } from "react";
import {
  normalizeProjectsMap,
  normalizeProjectData,
  PROJECTS_STORAGE_KEY,
} from "~/utils/projectStore";
import type { ProjectsMap, ProjectData } from "~/utils/projectStore";
import { ProjectCard } from "~/components/ProjectCard";
import { CreateProjectCard } from "~/components/CreateProjectCard";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectsMap>({});
  const [isHydrated, setIsHydrated] = useState(false);

  // Load projects from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(PROJECTS_STORAGE_KEY);
      let initialProjects: ProjectsMap = {};
      if (stored) {
        const parsed = JSON.parse(stored) as Record<
          string,
          Partial<ProjectData>
        >;
        initialProjects = normalizeProjectsMap(parsed);
      }
      setProjects(initialProjects);
      setIsHydrated(true);
    } catch (error) {
      console.error("Failed to load projects", error);
      setProjects({});
      setIsHydrated(true);
    }
  }, []);

  // Persist projects to localStorage when they change
  useEffect(() => {
    if (!isHydrated) return;
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        PROJECTS_STORAGE_KEY,
        JSON.stringify(projects),
      );
    } catch (error) {
      console.error("Failed to persist projects", error);
    }
  }, [isHydrated, projects]);

  const projectNames = useMemo(
    () => Object.keys(projects).sort((a, b) => a.localeCompare(b)),
    [projects],
  );

  const handleDeleteProject = (name: string) => {
    setProjects((prev) => {
      const rest = { ...prev };
      delete rest[name];
      return rest;
    });
  };

  if (!isHydrated) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-gray-500 dark:text-gray-400">Loading projects...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8 dark:bg-gray-900">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Projects</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Select a project to view details or start a new one.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <div className="aspect-[4/3] h-full">
            <CreateProjectCard />
          </div>

          {projectNames.map((name) => {
            const project = projects[name];
            if (!project) return null;
            const normalized = normalizeProjectData(project);
            
            return (
              <div key={name} className="aspect-[4/3] h-full">
                <ProjectCard
                  projectName={name}
                  project={normalized}
                  onDelete={handleDeleteProject}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
