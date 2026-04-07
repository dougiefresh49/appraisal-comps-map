import type { PhotoCategory } from "~/lib/photo-analyzer";

export interface LabelExample {
  category: PhotoCategory;
  label: string;
}

/**
 * Representative few-shot examples for Gemini smart label generation.
 * Drawn from real appraisal inspection photos across all five categories.
 */
export const LABEL_EXAMPLES: LabelExample[] = [
  // Building Exterior
  { category: "Building Exterior", label: "Subject Front" },
  { category: "Building Exterior", label: "Subject Rear" },
  { category: "Building Exterior", label: "Subject Left" },
  { category: "Building Exterior", label: "Subject Right" },
  { category: "Building Exterior", label: "Exterior Utility Closet" },
  { category: "Building Exterior", label: "HVAC Behind Chapel" },
  { category: "Building Exterior", label: "Garage" },
  { category: "Building Exterior", label: "Porte Cochere" },
  { category: "Building Exterior", label: "Chapel Rear Entry" },

  // Site & Grounds
  { category: "Site & Grounds", label: "Street View" },
  { category: "Site & Grounds", label: "Street View North" },
  { category: "Site & Grounds", label: "Street View South" },
  { category: "Site & Grounds", label: "Excess Land" },
  { category: "Site & Grounds", label: "Excess Land Street View" },
  { category: "Site & Grounds", label: "Rear Storage Shed" },
  { category: "Site & Grounds", label: "Rear Fence Damage" },

  // Building Interior
  { category: "Building Interior", label: "Lobby" },
  { category: "Building Interior", label: "Entryway" },
  { category: "Building Interior", label: "Main Office" },
  { category: "Building Interior", label: "Reception Desk" },
  { category: "Building Interior", label: "Chapel" },
  { category: "Building Interior", label: "Chapel - Bathroom" },
  { category: "Building Interior", label: "Break Room" },
  { category: "Building Interior", label: "Hallway Bathroom" },
  { category: "Building Interior", label: "Rear Hallway" },
  { category: "Building Interior", label: "Storage Room" },
  { category: "Building Interior", label: "Viewing Room" },
  { category: "Building Interior", label: "Stairs" },
  { category: "Building Interior", label: "Utility Room" },
  { category: "Building Interior", label: "Embalming Room" },

  // Residential / Apartment Unit
  { category: "Residential / Apartment Unit", label: "Upstairs Apartment" },
  { category: "Residential / Apartment Unit", label: "Upstairs Apartment - Kitchen" },
  { category: "Residential / Apartment Unit", label: "Upstairs Apartment - Bathroom" },
  { category: "Residential / Apartment Unit", label: "Upstairs Apartment - Bedroom" },

  // Damage & Deferred Maintenance
  { category: "Damage & Deferred Maintenance", label: "Exterior Brick Water Damage" },
  { category: "Damage & Deferred Maintenance", label: "Copper Pipes Disconnected" },
  { category: "Damage & Deferred Maintenance", label: "Water Heater Removed" },
  { category: "Damage & Deferred Maintenance", label: "Upstairs Flooring Water Damage" },
  { category: "Damage & Deferred Maintenance", label: "Downstairs Flooring Cracking" },
  { category: "Damage & Deferred Maintenance", label: "Left Patio Concrete Cracking" },
  { category: "Damage & Deferred Maintenance", label: "Upstairs Exterior Siding Damage" },
];
