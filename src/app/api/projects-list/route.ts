import { NextResponse } from "next/server";

export async function POST() {
  // Mock data for development when N8N webhook is not available
  const mockProjects = [
    {
      id: "mock-folder-id-001",
      name: "Test Appraisal Project"
    },
    {
      id: "mock-folder-id-002", 
      name: "Sample Property Assessment"
    },
    {
      id: "mock-folder-id-003",
      name: "Commercial Warehouse Appraisal"
    }
  ];

  return NextResponse.json({ projects: mockProjects });
}
