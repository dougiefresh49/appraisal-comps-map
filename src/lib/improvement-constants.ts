/**
 * Shared constants for improvement analysis across photo display and populate logic.
 *
 * `PHOTO_KEY_TO_IMPROVEMENT_LABEL` maps the snake_case keys Gemini emits in
 * photo_analyses.improvements_observed to the human-readable row labels used
 * in the improvement_analysis grid.
 *
 * `IMPROVEMENT_LABEL_TO_PHOTO_KEY` is the inverse — row label → photo key —
 * used by the photo detail panel to display friendly names.
 */

export const PHOTO_KEY_TO_IMPROVEMENT_LABEL: Record<string, string> = {
  foundation: "Foundation",
  roof: "Roof Type/Material",
  building_frame: "Building Frame",
  exterior_walls: "Exterior Walls",
  floors: "Floors",
  walls: "Walls",
  ceiling: "Ceiling",
  lighting: "Lighting",
  restrooms: "Restrooms",
  electrical: "Electrical",
  plumbing: "Plumbing",
  heating: "Heating",
  hvac: "Air Conditioning",
  fire_protection: "Fire Protection/Sprinklers",
  elevators: "Number of Elevators",
  site_improvements: "Site Improvements",
  landscaping: "Landscaping",
  parking: "Parking Spaces",
  construction_quality: "Construction Quality",
  stories: "Number of Stories",
  condition: "Condition",
};

/**
 * Inverse map: improvement analysis row label → photo improvements_observed key.
 * Used by PhotoDetailPanel to show friendly display names.
 */
export const IMPROVEMENT_LABEL_TO_PHOTO_KEY: Record<string, string> = {
  Foundation: "foundation",
  "Roof Type/Material": "roof",
  "Building Frame": "building_frame",
  "Exterior Walls": "exterior_walls",
  Floors: "floors",
  Walls: "walls",
  Ceiling: "ceiling",
  Lighting: "lighting",
  Restrooms: "restrooms",
  Electrical: "electrical",
  Plumbing: "plumbing",
  Heating: "heating",
  "Air Conditioning": "hvac",
  "Fire Protection/Sprinklers": "fire_protection",
  "Number of Elevators": "elevators",
  "Site Improvements": "site_improvements",
  Landscaping: "landscaping",
  "Parking Spaces": "parking",
  "Construction Quality": "construction_quality",
  "Number of Stories": "stories",
  Condition: "condition",
};

/**
 * Display labels for photo improvements_observed keys — used by PhotoDetailPanel.
 * Kept here so PhotoDetailPanel can import rather than maintain its own copy.
 */
export const IMPROVEMENT_DISPLAY_LABELS: Record<string, string> = {
  foundation: "Foundation",
  roof: "Roof Type / Material",
  building_frame: "Building Frame",
  exterior_walls: "Exterior Walls",
  floors: "Floors",
  walls: "Walls",
  ceiling: "Ceiling",
  lighting: "Lighting",
  restrooms: "Restrooms",
  electrical: "Electrical",
  plumbing: "Plumbing",
  heating: "Heating",
  hvac: "Air Conditioning / HVAC",
  fire_protection: "Fire Protection / Sprinklers",
  elevators: "Elevators",
  site_improvements: "Site Improvements",
  landscaping: "Landscaping",
  parking: "Parking",
  condition: "Condition",
  construction_quality: "Construction Quality",
  stories: "Stories",
};
