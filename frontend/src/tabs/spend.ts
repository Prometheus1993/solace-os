/**
 * Pure spend arithmetic for the ARCHIVES "Σ spent" tile — extracted so it can be unit-tested.
 *
 * The bug this fixes: the tile's HEADLINE was a per-tab, Copy/PurchaseItem-derived sum
 * (Σ series.totalSpentCents over the current kind's list) while its "incl. … est." SUBTITLE used the
 * GLOBAL, Purchase-derived `lifeSimSummary.totalSpentEstimatedCents` (all archives, manga + books).
 * Different scope AND different basis, so the estimate could exceed the total it claims to be part of
 * (e.g. a book-only estimate shown on the manga tab: "Σ spent €0.00 · incl. €10.99 est.").
 *
 * The fix keeps BOTH numbers in the SAME scope (the current tab's `list`) and the SAME basis
 * (per-volume `pricePaid`), so the estimated part is always a subset of — never larger than — the
 * total. `estimatedCents` counts only volumes whose price is an AI estimate; `totalCents` counts all.
 */

type PricedVolume = { pricePaid: { amountCents: number; estimated: boolean } | null };
type SpendSeries = { totalSpentCents: number | null; volumes: readonly PricedVolume[] };

/** Σ of a series' non-estimated per-volume prices (drives the "excl. estimates" toggle). */
export const seriesRealSpent = (s: SpendSeries): number =>
  s.volumes.reduce((sum, v) => sum + (v.pricePaid && !v.pricePaid.estimated ? v.pricePaid.amountCents : 0), 0);

/** Σ of a series' AI-ESTIMATED per-volume prices. */
export const seriesEstSpent = (s: SpendSeries): number =>
  s.volumes.reduce((sum, v) => sum + (v.pricePaid && v.pricePaid.estimated ? v.pricePaid.amountCents : 0), 0);

/**
 * Roll a tab's series list up into a consistent { totalCents, estimatedCents }. Both derive from the
 * SAME per-tab list and the SAME per-volume basis, so `estimatedCents <= totalCents` always holds.
 */
export function archiveSpend(list: readonly SpendSeries[]): { totalCents: number; estimatedCents: number } {
  return list.reduce(
    (acc, s) => ({
      totalCents: acc.totalCents + (s.totalSpentCents ?? 0),
      estimatedCents: acc.estimatedCents + seriesEstSpent(s),
    }),
    { totalCents: 0, estimatedCents: 0 },
  );
}
