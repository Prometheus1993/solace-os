/** Generic route/keyframe helpers for desk scenes: pure, in normalised scene coordinates (0..1). */
export type Point = { x: number; y: number };
/** A scaled, shifted copy of the scene: one route model drawn at several depths. */
export type View = { scale: number; x: number; y: number };
export const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export function projectPoint(point: Point, view: View): Point {
  return { x: view.x + point.x * view.scale, y: view.y + point.y * view.scale };
}
/** Opacity keyframe: ramps 0 → 1 over the first `fadeIn` of the progress and back to 0 over the last `fadeOut`. */
export function fadeInOut(t: number, fadeIn: number, fadeOut: number) {
  return Math.min(1, t / fadeIn, (1 - t) / fadeOut);
}
/**
 * A repeating schedule: every `period` seconds one action starts after `delay` and lasts `duration`.
 * Returns which repeat is playing and how far along it is (0..1), or null between actions.
 */
export function cycleAt(seconds: number, period: number, delay: number, duration: number): { cycle: number; progress: number } | null {
  const time = Math.max(0, seconds), progress = (time % period - delay) / duration;
  return progress < 0 || progress > 1 ? null : { cycle: Math.floor(time / period), progress };
}
