/** Theme registry — the single source of truth for valid `data-theme` ids + their display labels.
 * theme.ts reads this to validate a saved localStorage value; a future settings UI can render
 * `THEMES` directly instead of hardcoding the two ids.
 * Adding a theme: copy themes/yorha-dark.css → themes/<id>.css, change the selector to
 * [data-theme="<id>"] and the values, add it to THEMES below, @import it in styles/index.css.
 * Select it with localStorage 'solace.theme' = '<id>'. */
export type ThemeId = 'yorha-light' | 'yorha-dark';

export const THEMES: Record<ThemeId, { label: string }> = {
  'yorha-light': { label: 'YoRHa Light' },
  'yorha-dark': { label: 'YoRHa Dark' },
};

/** The theme after `current` in THEMES order (wraps) — drives the command-bar toggle. */
export const nextTheme = (current: ThemeId): ThemeId => {
  const ids = Object.keys(THEMES) as ThemeId[];
  return ids[(ids.indexOf(current) + 1) % ids.length]!;
};

export const DEFAULT_THEME: ThemeId = 'yorha-light';
