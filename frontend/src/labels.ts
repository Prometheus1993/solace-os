/** Display dictionary — UI-only reflavour keyed on STABLE DTO enums/ids. The engine is never
 * edited for styling; consumers read `LABELS[id] ?? dtoFreeText`, so an additive engine change never
 * yields a blank label. Tune copy freely here. */

/** Tier name → clearance rank (E…S). */
export const TIER_LABELS: Record<string, string> = {
  Novice: 'E',
  Apprentice: 'D',
  Adept: 'C',
  Veteran: 'B',
  Elite: 'A',
  Mythic: 'S',
};

/** Series state → pill label (Archives). Reading lifecycle + DERIVED complete/ongoing/caught-up
 * (mirrors the old MANGA_STATUS_LABELS but keyed on the unified Series/Volume model, migration v13). */
export const SERIES_STATE_LABELS: Record<string, string> = { active: 'ACTIVE', reading: 'READING', dropped: 'DROPPED', complete: 'COMPLETE', ongoing: 'ONGOING', caughtup: 'CAUGHT UP' };

/** Read-status (Copy.readStatus) → short chip label for the per-volume disclosure list. */
export const READ_STATUS_LABELS: Record<string, string> = { unread: 'UNREAD', reading: 'READING', read: 'READ', dnf: 'DNF' };
