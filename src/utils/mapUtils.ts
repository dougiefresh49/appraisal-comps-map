/**
 * Calculate the distance between two lat/lng points in miles
 */
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 3959; // Radius of the Earth in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculate the cardinal direction from point 1 to point 2
 */
export function calculateDirection(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): string {
  const dLat = lat2 - lat1;
  const dLng = lng2 - lng1;

  const angle = (Math.atan2(dLat, dLng) * 180) / Math.PI;
  const normalizedAngle = (angle + 360) % 360;

  const directions = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ];

  const index = Math.round(normalizedAngle / 22.5) % 16;
  return directions[index] ?? "N";
}

/**
 * Format distance and direction string
 */
export function formatDistanceAndDirection(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): string {
  const distance = calculateDistance(lat1, lng1, lat2, lng2);
  const direction = calculateDirection(lat1, lng1, lat2, lng2);
  return `${distance.toFixed(2)} miles ${direction}`;
}
