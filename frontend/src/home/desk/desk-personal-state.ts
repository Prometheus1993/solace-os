import { writeStored } from './desk-browser.ts';

export const MOODS = ['night', 'rain', 'focus'] as const;
export type RadioMood = typeof MOODS[number];
export const TRACKS = [
  { title: 'High Rise Haze', file: 'high-rise-haze.mp3', mood: 'night' },
  { title: 'Midnight Window Glow', file: 'midnight-window-glow.mp3', mood: 'night' },
  { title: 'Storm Over Side Streets', file: 'storm-over-side-streets.mp3', mood: 'rain' },
  { title: 'After School Rain', file: 'after-school-rain.mp3', mood: 'rain' },
  { title: 'Chapter By Lamplight', file: 'chapter-by-lamplight.mp3', mood: 'focus' },
  { title: 'Terminal Rain', file: 'terminal-rain.mp3', mood: 'focus' },
] as const;
export function nextRadioTrack(index: number, mood: RadioMood) {
  const choices = TRACKS.flatMap((track, i) => track.mood === mood ? [i] : []);
  return choices[(choices.indexOf(index) + 1) % choices.length];
}
export const SCRATCHPAD_KEY = 'solace.desk.scratchpad.v1';
export function loadScratchpad(storage: Pick<Storage, 'getItem'>): { text: string; error: boolean } {
  try { return { text: storage.getItem(SCRATCHPAD_KEY) ?? '', error: false }; }
  catch { return { text: '', error: true }; }
}
export function saveScratchpad(storage: Pick<Storage, 'setItem'>, text: string) {
  return writeStored(SCRATCHPAD_KEY, text, storage);
}
