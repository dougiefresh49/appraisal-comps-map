# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- **Development server**: `pnpm dev` (uses Next.js with Turbo)
- **Build**: `pnpm build` 
- **Type checking**: `pnpm typecheck` (runs `tsc --noEmit`)
- **Linting**: `pnpm lint` (Next.js ESLint) or `pnpm lint:fix` for auto-fixing
- **Format checking**: `pnpm format:check` or `pnpm format:write` (Prettier with Tailwind plugin)
- **Full check**: `pnpm check` (runs both linting and type checking)
- **Preview production build**: `pnpm preview`
- **Package manager**: Uses `pnpm` (specified in package.json)

## Project Architecture

This is a Next.js 15 application built with the T3 Stack, specifically focused on creating an interactive appraisal comparables mapping tool with Google Maps integration.

### Core Technologies
- **Next.js 15** with App Router
- **React 19** with TypeScript
- **Google Maps** via `@vis.gl/react-google-maps` for map rendering
- **Drag & Drop** via `@dnd-kit/core` for interactive bubble manipulation
- **Tailwind CSS** for styling
- **Environment validation** via `@t3-oss/env-nextjs` with Zod schemas

### Application Structure

**Main Routes:**
- `/` - Homepage with minimal draggable bubble demo
- `/cursor` - Full CompMap component (uses CompMap.tsx)
- `/gemini` - Alternative CompMap implementation (uses CompMapGemini.tsx)

**Key Components:**
- `CompMap.tsx` - Advanced draggable bubble system with ribbon tails connecting to markers
- `CompMapGemini.tsx` - Alternative implementation with different drag handling approach
- `MapOverlayPortal.tsx` - Custom React portal for rendering overlays on Google Maps using OverlayView

### Map System Architecture

The application uses a sophisticated overlay system for rendering draggable property bubbles on Google Maps:

1. **Map Projection Conversion**: Converts between geographic coordinates (lat/lng) and pixel coordinates using Google Maps projection
2. **Overlay Portal System**: `MapOverlayPortal` creates a React portal that renders custom elements above the map using Google Maps OverlayView API
3. **Drag & Drop Integration**: Uses `@dnd-kit/core` for accessible drag and drop with custom coordinate transformation
4. **Ribbon Tails**: SVG polygons that dynamically connect property markers to their draggable info bubbles

### Property Data Structure
```typescript
type Property = {
  type: "subject" | "comp";
  id: number;
  position: { lat: number; lng: number };
  address: string;
  compNumber: string;
  distance?: number;
};
```

### Environment Configuration
- **Required**: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` for Google Maps integration
- **Environment validation**: Defined in `src/env.js` using T3 env pattern
- **Path aliases**: `~/*` maps to `./src/*` (configured in tsconfig.json)

### Styling Approach
- Uses Tailwind CSS with custom configuration
- Inline styles for dynamic map overlays and bubble positioning
- Custom bubble components with speech-bubble design (colored backgrounds with triangular tails)

## Key Implementation Details

**Map Overlay Rendering**: The app renders custom UI elements over Google Maps by:
1. Creating a Google Maps OverlayView instance
2. Using React portals to render components into the map's DOM structure
3. Converting between geographic and pixel coordinates for positioning

**Drag Interaction**: Bubble dragging works by:
1. Capturing drag events from `@dnd-kit/core`
2. Converting drag deltas (pixels) to geographic coordinate changes
3. Updating bubble positions while maintaining connections to markers via ribbon tails

**Multiple Implementations**: The project contains two different approaches to the same functionality:
- `CompMap.tsx` - More complex implementation with detailed drag handling
- `CompMapGemini.tsx` - Alternative approach with different overlay management