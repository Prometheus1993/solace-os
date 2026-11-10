import type { Copy, Purchase, PurchaseItem, Series, Volume } from './types.ts';

/**
 * A series' reading state is DERIVED from its Volume/Copy rows, never stored — mirroring
 * how exam pass/fail derives from the grade, and how the old flat Manga.finished worked.
 * These pure helpers are the SINGLE source of that logic; the DTO and UI call
 * them rather than re-deriving the volume maths per call site.
 *
 * A plain Book is just a Series(type='book') with one Volume (volumeNumber: null) — the same
 * helpers apply uniformly (totalVolumesKnown=1, read>=1 ⇒ finished) with no special-casing.
 */

type SeriesProgress = Pick<Series, 'readingStatus' | 'publicationStatus' | 'totalVolumesKnown'>;

function ownedVolumeIds(volumes: readonly Volume[], copies: readonly Copy[]): Set<number> {
  const ownedVolumeIdsFromCopies = new Set(copies.filter((c) => c.owned).map((c) => c.volumeId));
  return new Set(volumes.filter((v) => ownedVolumeIdsFromCopies.has(v.id)).map((v) => v.id));
}

function readVolumeIds(volumes: readonly Volume[], copies: readonly Copy[]): Set<number> {
  const readVolumeIdsFromCopies = new Set(copies.filter((c) => c.readStatus === 'read').map((c) => c.volumeId));
  return new Set(volumes.filter((v) => readVolumeIdsFromCopies.has(v.id)).map((v) => v.id));
}

/** Distinct volumes with at least one owned Copy. */
export function seriesOwnedCount(volumes: readonly Volume[], copies: readonly Copy[]): number {
  return ownedVolumeIds(volumes, copies).size;
}

/** Distinct volumes with at least one Copy marked 'read'. */
export function seriesReadCount(volumes: readonly Volume[], copies: readonly Copy[]): number {
  return readVolumeIds(volumes, copies).size;
}

/**
 * Finished = you've READ the whole known run and you haven't dropped it or it isn't still
 * publishing. Requires a known totalVolumesKnown (unknown total ⇒ never finished, same as
 * the old model requiring a known totalVolumes).
 */
export function seriesFinished(series: SeriesProgress, volumes: readonly Volume[], copies: readonly Copy[]): boolean {
  if (series.readingStatus === 'dropped') return false;
  if (series.publicationStatus === 'ongoing') return false; // still publishing — never "finished"
  const total = series.totalVolumesKnown;
  if (total == null || total <= 0) return false;
  return seriesReadCount(volumes, copies) >= total;
}

/** Caught up on a still-publishing series = you OWN every released volume (more will come). */
export function seriesCaughtUp(series: SeriesProgress, volumes: readonly Volume[], copies: readonly Copy[]): boolean {
  if (series.readingStatus === 'dropped' || series.publicationStatus !== 'ongoing') return false;
  const total = series.totalVolumesKnown;
  if (total == null || total <= 0) return false;
  return seriesOwnedCount(volumes, copies) >= total;
}

/**
 * The next volume NUMBER to buy (owned+1) when an active series has a known total ahead of
 * what you own; else null. Arithmetic over counts (not a lookup of an actual not-yet-created
 * Volume row) — the metadata provider chain that would pre-populate every volume row up to
 * totalVolumesKnown isn't built yet, so this must keep working from bare counts exactly like
 * the old mangaNextBuyVolume did, or the buy-hint chip would silently stop firing right after
 * migration for any partially-owned series.
 */
export function nextVolumeToBuy(series: SeriesProgress, volumes: readonly Volume[], copies: readonly Copy[]): number | null {
  if (series.readingStatus === 'dropped') return null;
  if (seriesFinished(series, volumes, copies)) return null;
  const total = series.totalVolumesKnown;
  if (total == null) return null;
  const owned = seriesOwnedCount(volumes, copies);
  return owned < total ? owned + 1 : null;
}

/**
 * Price paid for a volume: the split PurchaseItem.allocatedPrice if tagged, else the box
 * purchase's total/item-count average, else null (never guessed — per the spec's own
 * aggregation rule: never sum/derive from anything but the Purchase's totalPrice).
 */
export function volumePricePaid(
  volumeId: number,
  copies: readonly Copy[],
  purchases: readonly Purchase[],
  purchaseItems: readonly PurchaseItem[],
): { amountCents: number; estimated: boolean; split: boolean } | null {
  const copy = copies.find((c) => c.volumeId === volumeId && c.purchaseId != null);
  const purchase = copy?.purchaseId != null ? purchases.find((p) => p.id === copy.purchaseId) : null;
  if (!purchase) return null;
  const item = purchaseItems.find((pi) => pi.purchaseId === purchase.id && pi.volumeId === volumeId);
  if (item?.allocatedPrice != null) {
    return { amountCents: item.allocatedPrice, estimated: purchase.estimated, split: true };
  }
  if (purchase.totalPrice == null) return null;
  // Split the box total evenly across its members. Prefer the PurchaseItem rows; when a box was
  // recorded by tagging copies with Copy.purchaseId but WITHOUT PurchaseItem rows, fall back to the
  // number of copies referencing this purchase — never a bare `|| 1`, which would report the FULL
  // total for every volume and multiply series.totalSpentCents.
  const itemCount =
    purchaseItems.filter((pi) => pi.purchaseId === purchase.id).length ||
    copies.filter((c) => c.purchaseId === purchase.id).length ||
    1;
  return { amountCents: Math.round(purchase.totalPrice / itemCount), estimated: purchase.estimated, split: false };
}

/** Σ Purchase.totalPrice — NEVER sum a Copy/PurchaseItem-level field directly (per the spec's
 * explicit warning: price lives on the Purchase, not the item). `includeEstimated` (default
 * true) lets a caller show "real receipts only" by excluding price-table estimates. */
export function totalSpent(purchases: readonly Purchase[], opts: { includeEstimated?: boolean } = {}): number {
  const includeEstimated = opts.includeEstimated ?? true;
  return purchases.filter((p) => includeEstimated || !p.estimated).reduce((sum, p) => sum + (p.totalPrice ?? 0), 0);
}
