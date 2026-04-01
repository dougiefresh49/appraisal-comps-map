import { useState, useEffect } from "react";

export interface DriveProject {
  id: string;
  name: string;
}

interface ProjectsResponse {
  projects: DriveProject[];
}

export function useProjectsList() {
  const [projects, setProjects] = useState<DriveProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProjects() {
      try {
        const response = await fetch("/api/projects/list-drive-roots");

        const data = (await response.json()) as ProjectsResponse & {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(
            data.error ?? "Failed to fetch projects list from Drive",
          );
        }

        if (data.projects) {
          setProjects(data.projects);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        console.error("Error fetching projects:", err);
      } finally {
        setIsLoading(false);
      }
    }

    void fetchProjects();
  }, []);

  return { projects, isLoading, error };
}
