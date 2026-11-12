/**
 * Decorative life on the desk monitor (#17). Nothing here is a command, a sync or a save: it never calls the server,
 * and the lines say nothing about work being done. Time and randomness are injected.
 */
export const AMBIENT_LINES = [
  'the city hums along',
  'a slow day is a good day',
  'nothing to chase right now',
  'lights low, shoulders down',
  'one thing at a time',
  'the rain can wait',
  'tea is probably cold',
] as const;

export type AmbientPlan = { wait: number; line: number; hold: number };
/** Quiet for 25 to 55 seconds, then one line (never the same twice in a row) for 5 seconds. */
export function planAmbient(random: () => number, previous: number | null): AmbientPlan {
  const pick = Math.floor(random() * (AMBIENT_LINES.length - (previous === null ? 0 : 1)));
  return { wait: 25 + random() * 30, line: previous !== null && pick >= previous ? pick + 1 : pick, hold: 5 };
}

/** 24-hour local clock, "07:05". */
export function clockText(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
