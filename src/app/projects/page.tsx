"use client";

import { useEffect, useState } from "react";
import { fetchProjectsList, deleteProject, archiveProject, type ProjectListItem } from "~/lib/supabase-queries";
import { ProjectCard } from "~/components/ProjectCard";
import { CreateProjectCard } from "~/components/CreateProjectCard";
import { ProfileMenu } from "~/components/ProfileMenu";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const list = await fetchProjectsList();
        setProjects(list);
      } catch (err) {
        console.error("Failed to load projects", err);
      } finally {
        setIsLoading(false);
      }
    }
    void load();
  }, []);

  const handleDeleteProject = async (projectId: string) => {
    try {
      await deleteProject(projectId);
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
    } catch (err) {
      console.error("Failed to delete project", err);
    }
  };

  const handleArchiveProject = async (projectId: string) => {
    try {
      await archiveProject(projectId);
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
    } catch (err) {
      console.error("Failed to archive project", err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-gray-500 dark:text-gray-400">Loading projects...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8 dark:bg-gray-900">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Projects</h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              Select a project to view details or start a new one.
            </p>
          </div>
          <ProfileMenu isCollapsed variant="header" />
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <div className="aspect-[4/3] h-full">
            <CreateProjectCard />
          </div>

          {projects.map((item) => (
            <div key={item.id} className="aspect-[4/3] h-full">
              <ProjectCard
                projectId={item.id}
                projectName={item.name}
                address={item.address}
                clientName={item.clientCompany}
                propertyType={item.propertyType}
                onArchive={handleArchiveProject}
                onDelete={handleDeleteProject}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
