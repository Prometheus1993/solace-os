// The desktop app's own small state file (in Electron's userData folder). Pure parsing; main.ts does the file I/O.

export interface Settings {
  launchAtLogin: boolean;
  alwaysOnTop: boolean;
  /** Notification keys already shown (see notifications.ts). */
  notified: string[];
}

export const DEFAULT_SETTINGS: Settings = { launchAtLogin: true, alwaysOnTop: false, notified: [] };

/** Settings from the file's text; a missing (null) or unreadable file gives the defaults. */
export function parseSettings(text: string | null): Settings {
  if (text === null) return DEFAULT_SETTINGS;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return DEFAULT_SETTINGS;
  }
  if (typeof raw !== 'object' || raw === null) return DEFAULT_SETTINGS;
  const r = raw as Record<string, unknown>;
  return {
    launchAtLogin: typeof r['launchAtLogin'] === 'boolean' ? r['launchAtLogin'] : DEFAULT_SETTINGS.launchAtLogin,
    alwaysOnTop: typeof r['alwaysOnTop'] === 'boolean' ? r['alwaysOnTop'] : DEFAULT_SETTINGS.alwaysOnTop,
    notified: Array.isArray(r['notified']) ? r['notified'].filter((k): k is string => typeof k === 'string') : [],
  };
}
