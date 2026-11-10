import { describe, expect, it } from 'vitest';
import { importFit } from '../src/importers/fit-importer.ts';
import { makeSyntheticFit } from './fixtures/make-fit.ts';

describe('importFit', () => {
  it('round-trips a synthetic FIT activity (distance, HR, GPS degrees, samples)', () => {
    const bytes = makeSyntheticFit({ n: 600, avgHr: 150, speedMps: 2.8, lat: 50.85, lon: 4.35, withTemperature: true });
    const run = importFit(bytes);

    expect(run.sport).toBe('running');
    expect(run.totalDistanceM).toBeCloseTo(600 * 2.8, 0);
    expect(run.totalDurationS).toBeCloseTo(600, 0);
    expect(run.avgHrBpm).toBe(150);
    expect(run.maxHrBpm).toBe(150);
    expect(run.avgEnhancedSpeedMps).toBeCloseTo(2.8, 2);
    expect(run.samples).toHaveLength(600);
    // Semicircles decoded back to degrees.
    expect(run.startLatDeg).toBeCloseTo(50.85, 3);
    expect(run.startLonDeg).toBeCloseTo(4.35, 3);
    expect(run.temperatureSource).toBe('fit');
    expect(run.correctedTemperatureC).toBeCloseTo(22, 1);

    // Per-second samples carry HR + decoded GPS.
    expect(run.samples[0]?.heartRateBpm).toBe(150);
    expect(run.samples[0]?.latDeg).toBeCloseTo(50.85, 3);
  });

  it('derives the LOCAL calendar date from the FIT offset — a post-midnight run buckets to the right day', () => {
    // 23:30 UTC on 19 May, but +02:00 (CEST) → 01:30 LOCAL on 20 May. The date prefix must be the LOCAL day.
    const bytes = makeSyntheticFit({ n: 60, startIso: '2026-05-19T23:30:00Z', utcOffsetMinutes: 120 });
    const run = importFit(bytes);

    expect(run.startTimeUtc).toBe(Math.floor(Date.parse('2026-05-19T23:30:00Z') / 1000));
    expect(run.startTimeLocal.slice(0, 10)).toBe('2026-05-20'); // local day, not the UTC 2026-05-19
    expect(run.startTimeLocal).toContain('+02:00');
  });

  it('falls back to UTC when the FIT carries no local offset (date prefix = UTC day)', () => {
    const bytes = makeSyntheticFit({ n: 60, startIso: '2026-05-20T07:00:00Z', utcOffsetMinutes: 0 });
    const run = importFit(bytes);
    expect(run.startTimeLocal.slice(0, 10)).toBe('2026-05-20');
    expect(run.startTimeLocal).toContain('+00:00');
  });

  it('degrades gracefully when GPS and temperature are absent', () => {
    const bytes = makeSyntheticFit({ n: 60, avgHr: 140, speedMps: 2.5, withGps: false, withTemperature: false });
    const run = importFit(bytes);

    expect(run.samples).toHaveLength(60);
    expect(run.startLatDeg).toBeNull();
    expect(run.startLonDeg).toBeNull();
    expect(run.temperatureSource).toBe('none');
    expect(run.correctedTemperatureC).toBeNull();
    expect(run.samples.every((s) => s.latDeg === null && s.temperatureC === null)).toBe(true);
  });
});
