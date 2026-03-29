"use client";

import { useEffect, useState } from "react";
import { fetchProjectsList, deleteProject, archiveProject, type ProjectListItem } from "~/lib/supabase-queries";
import { ProjectCard } from "~/components/ProjectCard";
import { CreateProjectCard } from "~/components/CreateProjectCard";
import { AppSiteHeader } from "~/components/AppSiteHeader";

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
      <div className="min-h-screen bg-slate-50 dark:bg-[#030712]">
        <AppSiteHeader />
        <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4">
          <p className="text-sm font-medium text-slate-500 dark:text-cyan-200/70">
            Loading projects…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#030712]">
      <AppSiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-cyan-50">
            Projects
          </h1>
          <p className="mt-2 text-slate-600 dark:text-cyan-100/65">
            Select a project to view details or start a new one.
          </p>
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
      </main>
    </div>
  );
}
