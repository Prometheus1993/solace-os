import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings } from '../src/settings.ts';

describe('parseSettings', () => {
  it('defaults to launch at login on and always on top off', () => {
    expect(parseSettings(null)).toEqual({ launchAtLogin: true, alwaysOnTop: false, notified: [] });
  });
  it('reads a saved file', () => {
    const saved = { launchAtLogin: false, alwaysOnTop: true, notified: ['exam:1:2026-01-12'] };
    expect(parseSettings(JSON.stringify(saved))).toEqual(saved);
  });
  it('falls back per field and on unreadable text', () => {
    expect(parseSettings('{"alwaysOnTop":true,"notified":[1,"a"]}')).toEqual({ launchAtLogin: true, alwaysOnTop: true, notified: ['a'] });
    expect(parseSettings('not json')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('[]')).toEqual(DEFAULT_SETTINGS);
  });
});
