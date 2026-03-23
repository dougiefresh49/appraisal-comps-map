// This file is kept for backward compatibility but no longer exports legacy types.
// All map state is now managed through MapView entities in projectStore.
export { compLocationMapId, DEFAULT_MAP_CENTER, DEFAULT_LABEL_SIZE, DEFAULT_CIRCLE_RADIUS } from "./projectStore";
export type { MapView } from "./projectStore";
