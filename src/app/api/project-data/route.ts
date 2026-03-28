import { NextResponse } from "next/server";

export async function POST(request: Request) {
  // Mock data for development when N8N webhook is not available
  const body = await request.json();
  const projectFolderId = body.projectFolderId;

  const mockProjectData = {
    subjectPhotoBase64: "",
    subjectPhotosFolderId: "mock-photos-folder-id",
    propertyType: "Commercial Warehouse",
    address: "123 Main Street, Sample City, TX 75001, USA",
    addressLabel: "123 Main Street",
    legalDescription: "LOT 1, BLOCK A, SAMPLE SUBDIVISION",
    acres: "2.5",
    clientName: "John Doe",
    clientCompany: "Sample Realty LLC",
    landComps: [
      {
        "#": 1,
        Address: "100 Oak Ave, Sample City, TX 75001",
        APN: "123-456-789",
        Recording: "2023-001234"
      }
    ],
    saleComps: [
      {
        "#": 1,
        Address: "200 Pine St, Sample City, TX 75002",
        APN: "123-456-790",
        Recording: "2023-001235"
      }
    ],
    rentalComps: []
  };

  return NextResponse.json(mockProjectData);
}
