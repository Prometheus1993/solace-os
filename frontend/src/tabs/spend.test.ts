import { describe, expect, it } from 'vitest';
import { archiveSpend, seriesEstSpent, seriesRealSpent } from './spend.ts';

const vol = (amountCents: number | null, estimated = false) => ({
  pricePaid: amountCents == null ? null : { amountCents, estimated },
});

describe('archiveSpend — the "Σ spent" tile headline + est. share share ONE scope & basis', () => {
  it('estimatedCents is always a SUBSET of totalCents (the contradiction bug)', () => {
    // The tile previously mixed a per-tab, copy-derived headline with a GLOBAL, Purchase-derived
    // estimated subtitle — so the estimate could exceed the total. Same list + same per-volume basis
    // makes that impossible: est ≤ total, always.
    const list = [{ totalSpentCents: 2599, volumes: [vol(1500, false), vol(1099, true)] }];
    const { totalCents, estimatedCents } = archiveSpend(list);
    expect(totalCents).toBe(2599);
    expect(estimatedCents).toBe(1099);
    expect(estimatedCents).toBeLessThanOrEqual(totalCents);
  });

  it('a tab with no priced volumes reports 0 total AND 0 estimated — no cross-tab leak', () => {
    // Reproduces the exact scenario: the MANGA tab has zero manga spend; the old code still rendered
    // "incl. €10.99 est." from a BOOK purchase (the global estimated total). Now the est is per-list,
    // so a manga tab with nothing priced shows 0 est., never a phantom estimate larger than the total.
    const mangaTab = [{ totalSpentCents: 0, volumes: [vol(null), vol(null)] }];
    const { totalCents, estimatedCents } = archiveSpend(mangaTab);
    expect(totalCents).toBe(0);
    expect(estimatedCents).toBe(0);
  });

  it('per-series real vs estimated split are complementary', () => {
    const s = { totalSpentCents: 3000, volumes: [vol(2000, false), vol(1000, true)] };
    expect(seriesRealSpent(s)).toBe(2000);
    expect(seriesEstSpent(s)).toBe(1000);
    expect(seriesRealSpent(s) + seriesEstSpent(s)).toBe(3000);
  });
});
