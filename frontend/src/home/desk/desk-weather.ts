import type { WeatherMood } from '@solace/core';

const MOODS: readonly WeatherMood[] = ['clear', 'fog', 'rain', 'snow'];

/** Development preview: `?skyMood=rain` in the page URL pins the weather mood. Null when absent or not a mood. */
export function forcedSkyMood(search: string): WeatherMood | null {
  const value = new URLSearchParams(search).get('skyMood');
  return MOODS.find(mood => mood === value) ?? null;
}

/** A falling drop or flake in normalised window coordinates (0..1). `sway` is the flake's own wobble phase. */
export type Particle = { x: number; y: number; speed: number; size: number; sway: number };

const COUNTS: Record<WeatherMood, number> = { clear: 0, fog: 0, rain: 90, snow: 60 };
/** Rain falls fast, snow drifts down slowly: window heights per second. */
const SPEEDS: Record<WeatherMood, readonly [number, number]> = { clear: [0, 0], fog: [0, 0], rain: [.9, 1.4], snow: [.06, .14] };

/** How many particles a mood draws. Reduced motion shows a quarter of them, standing still. */
export function particleCount(mood: WeatherMood, still: boolean): number {
  return still ? Math.ceil(COUNTS[mood] / 4) : COUNTS[mood];
}

export function spawnParticles(mood: WeatherMood, still: boolean, random: () => number): Particle[] {
  const [slow, fast] = SPEEDS[mood];
  return Array.from({ length: particleCount(mood, still) }, () => ({
    x: random(), y: random(), speed: slow + random() * (fast - slow), size: .4 + random() * .6, sway: random() * Math.PI * 2,
  }));
}

/** Moves every particle down by its speed; one that leaves the bottom re-enters above the top at a new x. */
export function stepParticles(particles: Particle[], seconds: number, random: () => number): Particle[] {
  return particles.map(particle => {
    const y = particle.y + particle.speed * seconds;
    return y > 1 ? { ...particle, x: random(), y: y - 1.05 } : { ...particle, y, sway: particle.sway + seconds };
  });
}
