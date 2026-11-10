import { describe, expect, it } from 'vitest';
import { nextTheme, THEMES, type ThemeId } from './index.ts';

describe('nextTheme', () => {
  it('cycles through THEMES and wraps', () => {
    expect(nextTheme('yorha-light')).toBe('yorha-dark');
    expect(nextTheme('yorha-dark')).toBe('yorha-light');
  });
  it('always lands on a registered theme', () => {
    for (const id of Object.keys(THEMES) as ThemeId[]) expect(nextTheme(id) in THEMES).toBe(true);
  });
});
