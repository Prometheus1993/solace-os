/** Sub-view ids that were renamed when the UI went English; old bookmarks (`#school/schoolperiode`) still resolve. */
const HASH_VIEW_ALIASES: Record<string, string> = {
  schoolperiode: 'school-term',
  examenperiode: 'exam-term',
  body: 'vitals', // BODY -> VITALS was `#training/body` before the rename
  status: 'overview', // the STATUS sub-tab is also reachable as #body/status
};

/** The sub-view of `#<area>/<view>`: the second hash segment (old ids mapped), else `def` when absent/unknown. */
export function viewFromHash<T extends string>(hash: string, views: readonly { id: T }[], def: T): T {
  const raw = hash.replace('#', '').split('/')[1] ?? '';
  const s = HASH_VIEW_ALIASES[raw] ?? raw;
  return views.some((v) => v.id === s) ? (s as T) : def;
}
