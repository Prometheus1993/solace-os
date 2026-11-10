export type CityBuilding = { x: number; base: number; width: number; frame: number; layer: 'far' | 'mid' | 'front'; ad?: number };
// Stable placement: resizing the window scales the same city rather than regenerating it.
export const CITY_BUILDINGS: CityBuilding[] = [
  ...Array.from({ length: 36 }, (_, i): CityBuilding => ({ x: -.015 + i / 35 * 1.03, base: .48 + (i * 7 % 9) * .012, width: .016 + (i * 3 % 5) * .0025, frame: i % 4, layer: 'far' })),
  ...Array.from({ length: 24 }, (_, i): CityBuilding => ({ x: -.015 + i / 23 * 1.03, base: .79 + (i * 11 % 5) * .016, width: .029 + (i * 5 % 7) * .002, frame: i % 8, layer: 'mid', ...(i % 5 === 1 ? { ad: i % 8 } : {}) })),
  // These towers hide the entrances/exits of the distant rooftop block.
  { x: .22, base: .80, width: .074, frame: 2, layer: 'mid' },
  { x: .80, base: .80, width: .074, frame: 2, layer: 'mid' },
  // Bases sit below the opening. Broad edge framing, sparse shorter interior silhouettes.
  { x: -.01, base: 1.12, width: .115, frame: 0, layer: 'front', ad: 0 },
  { x: .105, base: 1.15, width: .085, frame: 3, layer: 'front', ad: 4 },
  { x: .205, base: 1.12, width: .055, frame: 2, layer: 'front', ad: 6 },
  { x: .39, base: 1.08, width: .044, frame: 0, layer: 'front', ad: 1 },
  { x: .64, base: 1.08, width: .048, frame: 2, layer: 'front', ad: 7 },
  { x: .81, base: 1.12, width: .055, frame: 1, layer: 'front', ad: 3 },
  { x: .91, base: 1.15, width: .085, frame: 3, layer: 'front', ad: 5 },
  { x: 1.015, base: 1.12, width: .115, frame: 0, layer: 'front', ad: 2 },
];
