# Appraisal Report Management Tool

A comprehensive Next.js application for managing commercial appraisal reports, visualizing property data on maps, and streamlining the appraisal workflow.

## Features

### 🗺️ Interactive Maps

- **Comparables Map**: Visualize Subject property and Comparables (Land, Sales, Rentals) on a Google Map.
- **Custom Markers & Bubbles**: Drag-and-drop informational "bubbles" with adjustable tails pointing to exact property locations.
- **Drawing Tools**: Draw polygons, circles, and polylines to highlight areas or features.
- **Geocoding**: Integrated address search for quick property location.
- **Visual Customization**: Toggle UI elements, adjust bubble sizes, and use overlay guides for report screenshots.

### 📁 Project Management

- **Dashboard**: Create, rename, and manage multiple appraisal projects.
- **Data Management**: centralized storage for Subject details and Comparable properties.
- **JSON Editor**: Direct access to project data for advanced editing or backup.
- **Local Persistence**: Projects are automatically saved to your browser's local storage.

### 📸 Photo Management

- **Google Drive Integration**: Fetch property photos directly from a Google Drive folder.
- **Organization**: Drag and drop to reorder photos for the report.
- **Labeling**: Inline editing of photo labels.
- **Sync**: Persist photo metadata via Supabase and Drive (see app server actions).

### 📝 Report Generation

- **Markdown Support**: Write and format report sections (Neighborhood, Zoning, Highest & Best Use, etc.) using a rich markdown editor.
- **Structured Sections**: Dedicated pages for various standard appraisal report sections.

## Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org/) (App Router)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Maps**: [@vis.gl/react-google-maps](https://visgl.github.io/react-google-maps/) & Google Maps JavaScript API
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **State Management**: React Hooks & Local Storage
- **Drag & Drop**: [@dnd-kit](https://dndkit.com/) & [react-draggable](https://github.com/react-grid-layout/react-draggable)
- **Editor**: [@uiw/react-md-editor](https://github.com/uiwjs/react-md-editor)
- **Validation**: [Zod](https://zod.dev/)

## Setup

### 1. Environment Variables

Create a `.env.local` file in the root directory with the following variables:

```bash
# Google Maps (Required for Map Features)
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=your_google_maps_map_id

# Google Drive API (Required for Photo Features)
GOOGLE_DRIVE_API_KEY=your_google_drive_api_key_here
```

### 2. Google Maps Setup

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Enable **Maps JavaScript API**, **Places API**, and **Geocoding API**.
3. Create an API Key.
4. Create a **Map ID** (Vector map type recommended) in the Google Maps Platform > Map Management.

### 3. Google Drive Setup (For Photos)

Your Google Drive folder for a project should contain:

- `input.json`: Array of photo metadata.
- Image files referenced in the JSON.

Example `input.json`:

```json
[
  {
    "image": "photo1.jpg",
    "label": "Front View"
  }
]
```

## Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev
```

The application will be available at `http://localhost:3000`.

## Project Structure

```
src/
├── app/
│   ├── comps-map/       # Interactive Comparables Map
│   ├── land-comp-map/   # Specific map for Land Comparables
│   ├── location-map/    # Subject Location Map
│   ├── photos/          # Photo Management Interface
│   ├── projects/        # Project Dashboard
│   └── reports/         # Report Section Editors
├── components/          # Reusable UI Components
│   ├── CompMap.tsx      # Main Map Component
│   ├── DrawingTools/    # Map Drawing Tools
│   └── ...
├── utils/
│   ├── mapUtils.ts      # Geocoding & Map Helpers
│   └── projectStore.ts  # State Management Logic
└── server/              # Server Actions (Drive, photos, etc.)
```

## Usage Guide

1. **Start a Project**: Go to the home page (redirects to `/projects`) and create a new project.
2. **Enter Data**: Fill in Subject property details.
3. **Add Comparables**: Add Land, Sales, or Rental comparables.
4. **Visualize**: Navigate to the **Comparables Map** to place markers and adjust bubbles.
5. **Manage Photos**: Link a Google Drive folder ID to fetch and organize photos.
6. **Write Reports**: Use the Reports section to draft narrative content.
