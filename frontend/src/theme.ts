/** Theme + texture settings — imperative DOM attribute/class toggles + localStorage (no Context, so
 * the raw-CSS string sites re-theme for free via the CSS vars). yorha-light is the explicit default.
 * Call applySavedSettings() in main.tsx BEFORE React renders to avoid a theme flash. */
import { DEFAULT_THEME, THEMES, type ThemeId } from './styles/themes/index.ts';

const THEME_KEY = 'solace.theme';
const TEXTURE_KEY = 'solace.texture';

function readTheme(): ThemeId {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'dark') return 'yorha-dark'; // legacy pre-rename value
  if (saved === 'light') return 'yorha-light'; // legacy pre-rename value
  if (saved && saved in THEMES) return saved as ThemeId;
  return DEFAULT_THEME; // missing or unknown → light
}
// Texture is subtly ON by default (the YoRHa film-grain gives the flat panels life). There is no
// in-app texture toggle (a value saved to TEXTURE_KEY is still honored at boot below); the theme
// is switched from the command bar via setTheme().
const readTexture = (): boolean => localStorage.getItem(TEXTURE_KEY) !== 'off';

function apply(theme: ThemeId, texture: boolean): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.classList.toggle('fx-on', texture);
}

/** The theme currently applied to <html> (what the command-bar toggle reads). */
export const currentTheme = (): ThemeId => (document.documentElement.dataset['theme'] as ThemeId | undefined) ?? DEFAULT_THEME;

/** Switch theme: set data-theme on <html> and persist to localStorage. */
export function setTheme(theme: ThemeId): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* localStorage unavailable → applies for this session only */
  }
}

/** Run once, synchronously, before React mounts (main.tsx) to prevent a flash of the wrong theme. */
export function applySavedSettings(): void {
  try {
    apply(readTheme(), readTexture());
  } catch {
    /* localStorage unavailable → light + no texture (already the CSS default) */
  }
}
