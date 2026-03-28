import { useState, useEffect } from "react";
import { env } from "~/env";

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
        // Try local API route first, fallback to N8N webhook
        let response;
        try {
          response = await fetch("/api/projects-list", {
            method: "POST",
          });
        } catch (localErr) {
          // Fallback to N8N webhook
          response = await fetch(
            env.NEXT_PUBLIC_N8N_WEBHOOK_BASE_URL + "/projects-new",
            {
              method: "POST",
            },
          );
        }

        if (!response.ok) {
          throw new Error("Failed to fetch projects list");
        }

        const data = (await response.json()) as ProjectsResponse;
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
