import { formatEur } from '../tokens.ts';
import type { SeriesItem } from './series-filters.ts';

/**
 * The ARCHIVES summary derivations — the "Next to buy" ordering + the manga stat tiles — split out of
 * `Series.tsx` so they can be unit-tested, mirroring `series-filters.ts`.
 *
 * The card used to `.slice(0, 12)` a raw `filter(nextVolumeToBuy != null)`, a SILENT cap: with 27 series
 * to buy from, 15 were invisible with no affordance. The order was also arbitrary (DTO createdAt-desc).
 * These helpers give ONE ordered, never-truncated list (the card decides how many to reveal) and a
 * tile model that separates "how many SERIES need a volume" (the actionable count) from "how many volumes
 * that is in total" (the backlog size — big but not alarming, so it belongs in the subtitle, not the number).
 */

/**
 * Series with a next volume to buy, most-behind first, then title. Never truncated here — the caller
 * (the "Next to buy" card) owns the reveal-more affordance, so nothing is ever silently hidden.
 */
export function nextToBuyList(list: readonly SeriesItem[]): SeriesItem[] {
  return list
    .filter((s) => s.nextVolumeToBuy != null)
    // Most-behind first so the biggest gaps surface at the top; title breaks ties for a stable order
    // (a 0-comparator would leave equal-behind rows in arbitrary DTO order across renders).
    .sort((a, b) => (b.volumesBehind ?? 0) - (a.volumesBehind ?? 0) || a.title.localeCompare(b.title));
}

/**
 * The "To buy" tile model. `seriesCount` is the actionable number (how many SERIES need a volume);
 * `volumeCount` is the total backlog size (Σ volumes behind, passed in as the DTO's `volumesToBuy`) —
 * shown as context in the subtitle, not as the headline number, so a normal backlog doesn't read as alarm.
 * `danger` (→ the red headline) is on only when there's actually something to buy.
 */
export function toBuyTile(list: readonly SeriesItem[], volumesToBuy: number): { seriesCount: number; volumeCount: number; danger: boolean } {
  const seriesCount = list.filter((s) => s.nextVolumeToBuy != null).length;
  return { seriesCount, volumeCount: volumesToBuy, danger: seriesCount > 0 };
}

/**
 * Parse a typed euro amount ("10,99", "10.99", "€ 11") into positive INTEGER cents, else null. Money is
 * integer cents everywhere, so the float only lives for this one rounding step.
 */
export function parseEurToCents(input: string): number | null {
  const t = input.replace(/€/g, '').trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const cents = Math.round(Number(t) * 100);
  return cents > 0 ? cents : null;
}

/** Cents → the editable input text ("10,99") — the inverse of {@link parseEurToCents}. */
export const centsToEurInput = (cents: number): string => (cents / 100).toFixed(2).replace('.', ',');

/**
 * The Σ-spent tile subtitle. Three-way, so "incl. €X est." never repeats the headline: when EVERY
 * purchase is an AI estimate the estimate equals the total, and echoing it below the same number is noise.
 */
export function spendSubtitle(totalCents: number, estCents: number): string {
  if (estCents > 0 && estCents < totalCents) return `incl. ${formatEur(estCents)} est.`;
  if (estCents > 0 && estCents === totalCents) return 'all estimated (no receipts)';
  return 'across purchases';
}
