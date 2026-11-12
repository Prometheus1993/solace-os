import { describe, expect, it } from 'vitest';
import type { DayPhase } from '@solace/core';
import { carLaneCount, CITY_FIGURES, figureFrame, figuresAt, FIGURE_FRAMES } from './city-life.ts';
import { CITY_LEDGES } from './city-story-motion.ts';

const PHASES: DayPhase[] = ['dawn', 'day', 'dusk', 'night'];
const ids = (phase: DayPhase) => figuresAt(phase).map(figure => figure.id);

describe('city life', () => {
  it('shows figures by time of day, never all at once', () => {
    expect(ids('dawn')).toEqual(['porch-drink']);
    expect(ids('day')).toEqual(['porch-drink', 'balcony-lean']);
    expect(ids('dusk')).toEqual(['rooftop-smoker', 'balcony-lean', 'ledge-leg-swing']);
    expect(ids('night')).toEqual(['rooftop-smoker', 'ledge-leg-swing']);
    for (const phase of PHASES) {
      expect(figuresAt(phase).length).toBeGreaterThan(0);
      expect(figuresAt(phase).length).toBeLessThan(CITY_FIGURES.length);
    }
    for (const figure of CITY_FIGURES) expect(PHASES.some(phase => ids(phase).includes(figure.id))).toBe(true);
  });
  it('stands every figure on a roof line, one atlas row each', () => {
    expect(new Set(CITY_FIGURES.map(figure => figure.row)).size).toBe(CITY_FIGURES.length);
    for (const figure of CITY_FIGURES) {
      expect(CITY_LEDGES.some(ledge => ledge.y === figure.y && figure.x > ledge.x0 && figure.x < ledge.x1)).toBe(true);
    }
  });
  it('plays a loop, rests on the first frame and repeats', () => {
    const smoker = { ...CITY_FIGURES[1], row: 0 };
    expect(figureFrame(smoker, 0)).toBe(0);
    expect(figureFrame(smoker, .4)).toBe(1);
    expect(figureFrame(smoker, 1.9)).toBe(5);
    expect(figureFrame(smoker, 2)).toBe(5);
    expect(figureFrame(smoker, 3.5)).toBe(0);
    expect(figureFrame(smoker, 5 + .4)).toBe(1);
    for (const figure of CITY_FIGURES) for (let t = 0; t < 30; t += .13) {
      const frame = figureFrame(figure, t);
      expect(Number.isInteger(frame) && frame >= 0 && frame < FIGURE_FRAMES).toBe(true);
    }
    expect(figureFrame(CITY_FIGURES[0], 1)).not.toBe(figureFrame(CITY_FIGURES[3], 1));
  });
  it('keeps traffic busy by day and dusk and sparse at night', () => {
    expect(carLaneCount('day')).toBe(6);
    expect(carLaneCount('dusk')).toBe(6);
    expect(carLaneCount('night')).toBeLessThan(carLaneCount('dawn'));
    expect(carLaneCount('dawn')).toBeLessThan(carLaneCount('day'));
    expect(carLaneCount('night')).toBeGreaterThan(0);
  });
});
