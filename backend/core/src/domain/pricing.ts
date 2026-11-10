import type { VolumeFormat } from './types.ts';

/**
 * DETERMINISTIC per-volume pricing (EUR cents, integer). Money is written into a database, so it
 * must be reproducible and diff-reviewable: pricing resolves off a committed table
 * (`source-exports/price-table.json`) via a fixed precedence, keyed by publisher × edition
 * plus per-series and per-series-volume overrides.
 *
 * SDK-free, DOM-free — this is `@solace/core`. All amounts are positive integer cents.
 */

/** The edition axis of the table. `Collector Edition` is deliberately NOT here — it is a per-series override. */
export type Edition = 'standard' | 'omnibus' | 'n-in-1' | 'vizbig' | 'deluxe' | 'box-set';

/**
 * Detect the edition from a series' canonical title. Reuses the exact vocabulary + precedence of
 * `manga-lookup.ts`'s `gbEdition()` (kept in lockstep — the same regexes, the same order), mapped
 * onto the lowercase {@link Edition} enum.
 *
 * Precedence is by BRANCH ORDER, not by position in the string: `\bomnibus\b` is tested FIRST, so
 * for `'Sample Saga - Omnibus 3 - 1'` the omnibus branch wins and the trailing `3 - 1` is never
 * considered as an n-in-1 token. (It wouldn't match `\b(\d+)[-\s]?in[-\s]?1\b` anyway — there is no
 * literal "in" — but the omnibus-first ordering is intentional.)
 */
export function detectEdition(canonicalTitle: string): Edition {
  const s = canonicalTitle;
  if (/\bomnibus\b/i.test(s)) return 'omnibus';
  if (/\b(\d+)[-\s]?in[-\s]?1\b/i.test(s)) return 'n-in-1';
  if (/\b(?:vizbig|big edition)\b/i.test(s)) return 'vizbig';
  if (/\bdeluxe\b/i.test(s)) return 'deluxe';
  if (/\bbox set\b/i.test(s)) return 'box-set';
  return 'standard';
}

const EDITIONS: readonly Edition[] = ['standard', 'omnibus', 'n-in-1', 'vizbig', 'deluxe', 'box-set'];

export interface PriceTable {
  version: number;
  defaultCents: number;
  oneShotCents: number;
  publisherStandard: Record<string, number>;
  publisherEdition: Record<string, Partial<Record<Edition, number>>>;
  seriesOverrides: Record<string, number>;
  seriesVolumeOverrides: Record<string, Array<{ from: number; to: number; cents: number }>>;
}

/**
 * Map a raw publisher string ('Example Press', 'Sample House Comics', 'Demo Books Entertainment') onto the
 * table's slug key ('example press', 'sample house', 'demo books'), else null. Case-insensitive substring match:
 * a slug matches when it appears anywhere in the lowercased publisher. On multiple matches the
 * LONGEST slug wins (deterministic; guards against a short slug shadowing a more specific one).
 */
export function normalizePublisher(publisher: string | null, table: PriceTable): string | null {
  if (publisher == null) return null;
  const hay = publisher.trim().toLowerCase();
  if (hay === '') return null;
  let best: string | null = null;
  for (const slug of Object.keys(table.publisherStandard)) {
    if (hay.includes(slug.toLowerCase()) && (best === null || slug.length > best.length)) best = slug;
  }
  return best;
}

// ── parsePriceTable ─────────────────────────────────────────────────────────
// Parse + validate an unknown JSON value into a PriceTable. Throws on malformation. Unknown
// top-level keys (the real file carries a `_comment` array) are ignored.

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** A valid money amount: a positive integer number of cents. Rejects NaN, floats, zero, negatives. */
function cents(v: unknown, where: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) {
    throw new Error(`price-table: ${where} must be a positive integer cents value, got ${JSON.stringify(v)}`);
  }
  return v;
}

function centsRecord(v: unknown, where: string): Record<string, number> {
  if (!isRecord(v)) throw new Error(`price-table: ${where} must be an object`);
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(v)) out[k] = cents(val, `${where}.${k}`);
  return out;
}

export function parsePriceTable(raw: unknown): PriceTable {
  if (!isRecord(raw)) throw new Error('price-table: root must be an object');

  const version = raw['version'];
  if (typeof version !== 'number' || !Number.isFinite(version)) throw new Error('price-table: version must be a number');

  const defaultCents = cents(raw['defaultCents'], 'defaultCents');
  const oneShotCents = cents(raw['oneShotCents'], 'oneShotCents');
  const publisherStandard = centsRecord(raw['publisherStandard'], 'publisherStandard');
  const seriesOverrides = centsRecord(raw['seriesOverrides'], 'seriesOverrides');

  const peRaw = raw['publisherEdition'];
  if (!isRecord(peRaw)) throw new Error('price-table: publisherEdition must be an object');
  const publisherEdition: Record<string, Partial<Record<Edition, number>>> = {};
  for (const [slug, editions] of Object.entries(peRaw)) {
    if (!isRecord(editions)) throw new Error(`price-table: publisherEdition.${slug} must be an object`);
    const bucket: Partial<Record<Edition, number>> = {};
    for (const [ed, val] of Object.entries(editions)) {
      if (!EDITIONS.includes(ed as Edition)) throw new Error(`price-table: publisherEdition.${slug}.${ed} is not a valid edition`);
      bucket[ed as Edition] = cents(val, `publisherEdition.${slug}.${ed}`);
    }
    publisherEdition[slug] = bucket;
  }

  const svoRaw = raw['seriesVolumeOverrides'];
  if (!isRecord(svoRaw)) throw new Error('price-table: seriesVolumeOverrides must be an object');
  const seriesVolumeOverrides: Record<string, Array<{ from: number; to: number; cents: number }>> = {};
  for (const [title, bands] of Object.entries(svoRaw)) {
    if (!Array.isArray(bands)) throw new Error(`price-table: seriesVolumeOverrides.${title} must be an array`);
    seriesVolumeOverrides[title] = bands.map((b, i) => {
      if (!isRecord(b)) throw new Error(`price-table: seriesVolumeOverrides.${title}[${i}] must be an object`);
      const from = b['from'];
      const to = b['to'];
      if (typeof from !== 'number' || !Number.isInteger(from) || from < 1)
        throw new Error(`price-table: seriesVolumeOverrides.${title}[${i}].from must be a positive integer`);
      if (typeof to !== 'number' || !Number.isInteger(to) || to < from)
        throw new Error(`price-table: seriesVolumeOverrides.${title}[${i}].to must be an integer >= from`);
      return { from, to, cents: cents(b['cents'], `seriesVolumeOverrides.${title}[${i}].cents`) };
    });
  }

  return { version, defaultCents, oneShotCents, publisherStandard, publisherEdition, seriesOverrides, seriesVolumeOverrides };
}

// ── resolveVolumePrice ──────────────────────────────────────────────────────

export interface PriceResolveInput {
  canonicalTitle: string;
  publisher: string | null;
  volumeNumber: number | null;
  totalVolumesKnown: number | null;
  format: VolumeFormat;
}

export type PriceBasis = 'series-volume' | 'series' | 'publisher-edition' | 'publisher-standard' | 'one-shot' | 'default';

export interface PriceResolution {
  cents: number;
  basis: PriceBasis;
  edition: Edition;
  publisherSlug: string | null;
}

/**
 * Resolve a single volume's price. TOTAL — always returns a positive integer cents value, never
 * null/NaN/negative. Precedence (EXACTLY this order):
 *   1. seriesVolumeOverrides[title] band containing volumeNumber → 'series-volume'
 *   2. seriesOverrides[title]                                     → 'series'
 *   3. publisherEdition[slug][edition] when edition !== 'standard' → 'publisher-edition'
 *   4. publisherStandard[slug]                                    → 'publisher-standard'
 *   5. oneShotCents when totalVolumesKnown === 1                  → 'one-shot'
 *   6. defaultCents                                               → 'default'
 *
 * The one-shot rule sits BELOW publisher-standard ON PURPOSE (deviates from an earlier draft, kept
 * deliberately): a one-shot is only assumed pricier when the publisher is unknown. Otherwise
 * `Tiny Tale` — a normal $9.99 standard-publisher volume with totalVolumesKnown = 1 — would be mispriced as
 * an oversized art book. Genuinely oversized one-shots carry explicit
 * seriesOverrides instead.
 *
 * A one-shot is NEVER detected from volumeNumber: migration v13 numbered every synthetic volume
 * from 1, so all one-shots have volumeNumber === 1, indistinguishable from vol 1 of a long run.
 * Only totalVolumesKnown === 1 marks a one-shot.
 */
export function resolveVolumePrice(input: PriceResolveInput, table: PriceTable): PriceResolution {
  const edition = detectEdition(input.canonicalTitle);
  const publisherSlug = normalizePublisher(input.publisher, table);

  // 1. per-series-volume band
  const bands = table.seriesVolumeOverrides[input.canonicalTitle];
  if (bands && input.volumeNumber != null) {
    const band = bands.find((b) => input.volumeNumber! >= b.from && input.volumeNumber! <= b.to);
    if (band) return { cents: band.cents, basis: 'series-volume', edition, publisherSlug };
  }

  // 2. per-series override
  const seriesCents = table.seriesOverrides[input.canonicalTitle];
  if (seriesCents != null) return { cents: seriesCents, basis: 'series', edition, publisherSlug };

  if (publisherSlug != null) {
    // 3. publisher × edition (non-standard editions only)
    if (edition !== 'standard') {
      const edCents = table.publisherEdition[publisherSlug]?.[edition];
      if (edCents != null) return { cents: edCents, basis: 'publisher-edition', edition, publisherSlug };
    }
    // 4. publisher standard
    const stdCents = table.publisherStandard[publisherSlug];
    if (stdCents != null) return { cents: stdCents, basis: 'publisher-standard', edition, publisherSlug };
  }

  // 5. one-shot (publisher unknown / unpriced)
  if (input.totalVolumesKnown === 1) return { cents: table.oneShotCents, basis: 'one-shot', edition, publisherSlug };

  // 6. default
  return { cents: table.defaultCents, basis: 'default', edition, publisherSlug };
}
