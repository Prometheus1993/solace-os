import { describe, expect, it } from 'vitest';
import type { StatJourney } from '@solace/core';
import { calloutLabel, conditionOf, HEAD_GLOW, journeyRow, journeyText, shortDate, STAT_ZONE, zoneBrightness } from './hologram-state.ts';
import { CALLOUTS, FIGURE, PROJECTOR, WORLD, boxPercent } from './hologram-layout.ts';

describe('zone brightness', () => {
  it('rises with the level from a visible floor to full glow', () => {
    expect(zoneBrightness(0)).toBeCloseTo(0.2);
    expect(zoneBrightness(50)).toBeCloseTo(0.6);
    expect(zoneBrightness(100)).toBeCloseTo(1);
    expect(zoneBrightness(60)).toBeGreaterThan(zoneBrightness(30));
  });
  it('clamps out-of-range and non-finite levels', () => {
    expect(zoneBrightness(-5)).toBeCloseTo(0.2);
    expect(zoneBrightness(400)).toBeCloseTo(1);
    expect(zoneBrightness(NaN)).toBeCloseTo(0.2);
  });
  it('lights legs, arms and torso, and the outline per stat; the head has its own fixed glow', () => {
    expect(STAT_ZONE).toEqual({ stamina: 'legs', strength: 'arms-torso', leanness: 'silhouette' });
    expect(HEAD_GLOW).toBeGreaterThan(0);
  });
});

describe('condition word', () => {
  it('maps the existing readiness recommendation onto one word', () => {
    expect(conditionOf('go_hard')).toEqual({ word: 'READY', tone: 'ok' });
    expect(conditionOf('go_easy')).toEqual({ word: 'STEADY', tone: 'info' });
    expect(conditionOf('rest')).toEqual({ word: 'RECOVER', tone: 'warn' });
  });
});

describe('journey', () => {
  const journey: StatJourney = { sinceDate: '2026-06-22', startValue: 12.4, startLevel: 12, points: [] };
  it('has no row without history since the fresh start', () => {
    expect(journeyRow(null, { value: 20, level: 20 })).toBeNull();
  });
  it('reports the level and value change since the start', () => {
    const row = journeyRow(journey, { value: 18.9, level: 18 })!;
    expect(row).toMatchObject({ levelDelta: 6, valueDelta: 6.5, startLevel: 12 });
    expect(journeyText(row)).toBe('+6 LV · +6.5');
  });
  it('shows a stat that dropped with a minus and a flat one as zero', () => {
    expect(journeyText(journeyRow(journey, { value: 10.4, level: 10 })!)).toBe('−2 LV · −2');
    expect(journeyText(journeyRow(journey, { value: 12.4, level: 12 })!)).toBe('±0 LV · ±0');
  });
  it('formats the start date short', () => {
    expect(shortDate('2026-06-22')).toBe('22 JUN');
    expect(shortDate('2026-11-03')).toBe('3 NOV');
  });
});

describe('callout label', () => {
  it('names the stat with its level and tier', () => {
    const stats = { stamina: { level: 34, tier: { name: 'Adept' } } } as never;
    expect(calloutLabel('stamina', { stats })).toEqual({ name: 'STAMINA', detail: 'LV 34 · ADEPT' });
  });
});

describe('showcase layout', () => {
  it('keeps the figure, projector, labels and anchors inside the stage', () => {
    const inside = (p: { x: number; y: number }) => p.x >= 0 && p.x <= WORLD.w && p.y >= 0 && p.y <= WORLD.h;
    expect(inside({ x: PROJECTOR.x, y: PROJECTOR.y })).toBe(true);
    expect(inside({ x: PROJECTOR.x + PROJECTOR.w, y: PROJECTOR.y + PROJECTOR.h })).toBe(true);
    expect(FIGURE.x + FIGURE.w).toBeLessThanOrEqual(WORLD.w);
    for (const c of CALLOUTS) { expect(inside(c.label)).toBe(true); expect(inside(c.target)).toBe(true); }
  });
  it('puts the labels beside the figure, on their own side', () => {
    for (const c of CALLOUTS) {
      if (c.side === 'left') expect(c.label.x).toBeLessThan(FIGURE.x + 167);
      else expect(c.label.x).toBeGreaterThan(FIGURE.x + 833);
    }
  });
  it('rests the projector top surface on the feet baseline', () => {
    expect(PROJECTOR.y + 119 * 0.9).toBeCloseTo(FIGURE.y + 1560);
  });
  it('converts a world box to stage percentages', () => {
    expect(boxPercent({ x: 0, y: 0, w: WORLD.w, h: WORLD.h })).toEqual({ x: 0, y: 0, w: 100, h: 100 });
  });
});
