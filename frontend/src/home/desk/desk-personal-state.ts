import { writeStored } from './desk-browser.ts';

export const TRACKS = [
  { title: 'High Rise Haze', file: 'high-rise-haze.mp3' },
  { title: 'Midnight Window Glow', file: 'midnight-window-glow.mp3' },
  { title: 'Storm Over Side Streets', file: 'storm-over-side-streets.mp3' },
  { title: 'After School Rain', file: 'after-school-rain.mp3' },
  { title: 'Chapter By Lamplight', file: 'chapter-by-lamplight.mp3' },
  { title: 'Terminal Rain', file: 'terminal-rain.mp3' },
] as const;
export const nextLocalTrack = (index: number) => (index + 1) % TRACKS.length;
export const SCRATCHPAD_KEY = 'solace.desk.scratchpad.v1';
export function loadScratchpad(storage: Pick<Storage, 'getItem'>): { text: string; error: boolean } {
  try { return { text: storage.getItem(SCRATCHPAD_KEY) ?? '', error: false }; }
  catch { return { text: '', error: true }; }
}
export function saveScratchpad(storage: Pick<Storage, 'setItem'>, text: string) {
  return writeStored(SCRATCHPAD_KEY, text, storage);
}
