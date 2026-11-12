export type Area = 'desk' | 'body' | 'study' | 'shelf';

export const AREAS: { id: Area; label: string }[] = [
  { id: 'desk', label: 'DESK' },
  { id: 'body', label: 'BODY' },
  { id: 'study', label: 'STUDY' },
  { id: 'shelf', label: 'SHELF' },
];

export const AREA_IDS: Area[] = AREAS.map((a) => a.id);

/** Area ids from before the rename (HOME/COMBAT/MISSIONS/ARCHIVES became DESK/BODY/STUDY/SHELF); old bookmarks still resolve. */
const AREA_ALIASES: Record<string, Area> = {
  home: 'desk',
  training: 'body',
  school: 'study',
  archives: 'shelf',
};

/** The area a hash segment names, canonical or old; null when it names none. */
export function resolveArea(segment: string): Area | null {
  if (AREA_IDS.includes(segment as Area)) return segment as Area;
  return AREA_ALIASES[segment] ?? null;
}

/** `#training/running` -> `body/running` (no `#`); a hash with an unknown first segment is returned unchanged. */
export function canonicalHash(hash: string): string {
  const [first = '', ...rest] = hash.replace(/^#/, '').split('/');
  const area = resolveArea(first);
  return area ? [area, ...rest].join('/') : hash.replace(/^#/, '');
}
