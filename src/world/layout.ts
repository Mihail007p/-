/**
 * City layout: one source of truth for where roads, sidewalks and blocks are.
 * Everything else (buildings, props, colliders, minimap) derives from it.
 */

export const LAYOUT = {
  /** number of blocks per side */
  blocks: 6,
  /** road width in metres */
  road: 18,
  /** block size in metres (building area, excluding roads) */
  block: 34,
  /** sidewalk width around each block */
  sidewalk: 5,
  /** width of the outer ring road extension (visual only) */
  margin: 22,
};

export const PITCH = LAYOUT.block + LAYOUT.road;
export const CITY_SIZE = LAYOUT.blocks * PITCH + LAYOUT.road;
export const CITY_HALF = CITY_SIZE / 2;

/** centre line of road `i` (0..blocks) on each axis */
export function roadCenter(i: number) {
  return -CITY_HALF + LAYOUT.road / 2 + i * PITCH;
}

/** block `i` (0..blocks-1) spans from here (sidewalk included) */
export function blockMin(i: number) {
  return roadCenter(i) + LAYOUT.road / 2;
}

export function blockMax(i: number) {
  return blockMin(i) + LAYOUT.block;
}

/** building area inside the sidewalk ring */
export function innerMin(i: number) {
  return blockMin(i) + LAYOUT.sidewalk;
}

export function innerSize() {
  return LAYOUT.block - LAYOUT.sidewalk * 2;
}

export type Rect = { x0: number; z0: number; x1: number; z1: number };

/** True if the point lies on a road (used for spawning and car placement). */
export function isOnRoad(x: number, z: number) {
  for (let i = 0; i <= LAYOUT.blocks; i++) {
    const c = roadCenter(i);
    if (Math.abs(x - c) < LAYOUT.road / 2 || Math.abs(z - c) < LAYOUT.road / 2) return true;
  }
  return false;
}

/** Nearest road centre line for an axis (x or z). */
export function nearestRoad(v: number) {
  let best = roadCenter(0);
  let bestD = Math.abs(v - best);
  for (let i = 1; i <= LAYOUT.blocks; i++) {
    const c = roadCenter(i);
    const d = Math.abs(v - c);
    if (d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

/**
 * Spawn position for the player: on the sidewalk of the central crossroad,
 * looking down the main avenue.
 */
export const SPAWN = {
  x: roadCenter(3) + LAYOUT.road / 2 - 1.2,
  z: roadCenter(3) + 6,
  heading: Math.PI,
};
