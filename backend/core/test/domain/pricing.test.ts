import { describe, expect, it } from 'vitest';
import {
  type PriceResolveInput,
  type PriceTable,
  detectEdition,
  normalizePublisher,
  parsePriceTable,
  resolveVolumePrice,
} from '../../src/index.ts';
// The tracked made-up example table (never the private source-exports/price-table.json).
import realTableRaw from '../../../../config/price-table.example.json';

const REAL: PriceTable = parsePriceTable(realTableRaw);

// A minimal input builder — most tests only care about a few fields.
const inp = (over: Partial<PriceResolveInput>): PriceResolveInput => ({
  canonicalTitle: 'X',
  publisher: null,
  volumeNumber: 1,
  totalVolumesKnown: null,
  format: 'single',
  ...over,
});

describe('detectEdition — reuses gbEdition vocabulary + precedence', () => {
  it('detects deluxe', () => {
    expect(detectEdition('Sample Saga — Deluxe')).toBe('deluxe');
    expect(detectEdition('Placeholder Chronicles — Deluxe')).toBe('deluxe');
  });
  it('detects omnibus', () => {
    expect(detectEdition('Sample Saga — Omnibus')).toBe('omnibus');
  });
  it('omnibus wins over the trailing "3 - 1" for a trailing "3 - 1"', () => {
    // Branch order: `\bomnibus\b` is tested FIRST, so it wins regardless of the trailing token.
    // (The `3 - 1` would not match `\b(\d+)[-\s]?in[-\s]?1\b` anyway — no literal "in".)
    expect(detectEdition('Sample Saga - Omnibus 3 - 1')).toBe('omnibus');
  });
  it('plain titles are standard (incl. a Collector Edition, which is a per-series override not an enum member)', () => {
    expect(detectEdition('Plain Tale。')).toBe('standard');
    expect(detectEdition('Plain Tale')).toBe('standard');
    expect(detectEdition('Sample Saga Collector Edition')).toBe('standard');
  });
  it('detects the remaining editions', () => {
    expect(detectEdition('Sample Saga 3-in-1')).toBe('n-in-1');
    expect(detectEdition('Sample Saga VIZBIG Edition')).toBe('vizbig');
    expect(detectEdition('Something Box Set')).toBe('box-set');
  });
});

describe('normalizePublisher — case-insensitive substring → slug', () => {
  it('maps example publisher strings onto slugs', () => {
    expect(normalizePublisher('Example Press', REAL)).toBe('example press');
    expect(normalizePublisher('Sample House Comics', REAL)).toBe('sample house');
    expect(normalizePublisher('DEMO BOOKS Entertainment', REAL)).toBe('demo books');
  });
  it('null / unknown publishers → null', () => {
    expect(normalizePublisher(null, REAL)).toBeNull();
    expect(normalizePublisher('', REAL)).toBeNull();
    expect(normalizePublisher('Unknown Press', REAL)).toBeNull();
  });
});

describe('parsePriceTable', () => {
  it('parses the example file and ignores the unknown _comment top-level key', () => {
    expect('_comment' in (realTableRaw as Record<string, unknown>)).toBe(true);
    const t = parsePriceTable(realTableRaw);
    expect(t.defaultCents).toBe(999);
    expect(t.oneShotCents).toBe(1399);
    expect(t.publisherStandard['example press']).toBe(1099);
  });
  it('rejects a negative cents value', () => {
    expect(() => parsePriceTable({ ...(realTableRaw as object), defaultCents: -1 })).toThrow();
  });
  it('rejects a float cents value', () => {
    expect(() => parsePriceTable({ ...(realTableRaw as object), oneShotCents: 10.99 })).toThrow();
  });
  it('rejects a zero cents value anywhere in publisherStandard', () => {
    expect(() =>
      parsePriceTable({ ...(realTableRaw as object), publisherStandard: { 'example press': 0 } }),
    ).toThrow();
  });
});

describe('resolveVolumePrice — against the example table', () => {
  it('Collector Edition per-volume bands (series-volume)', () => {
    const t = 'Sample Saga Collector Edition';
    expect(resolveVolumePrice(inp({ canonicalTitle: t, volumeNumber: 1 }), REAL)).toMatchObject({ cents: 5999, basis: 'series-volume' });
    expect(resolveVolumePrice(inp({ canonicalTitle: t, volumeNumber: 4 }), REAL)).toMatchObject({ cents: 4999, basis: 'series-volume' });
    expect(resolveVolumePrice(inp({ canonicalTitle: t, volumeNumber: 6 }), REAL)).toMatchObject({ cents: 4499, basis: 'series-volume' });
  });

  it('Sample Saga — Deluxe is a per-series override (series)', () => {
    expect(resolveVolumePrice(inp({ canonicalTitle: 'Sample Saga — Deluxe', volumeNumber: 3 }), REAL)).toMatchObject({ cents: 4999, basis: 'series' });
  });

  it('publisher × edition: same "deluxe" edition, DIFFERENT price by series override — the whole point', () => {
    const sample = resolveVolumePrice(inp({ canonicalTitle: 'Sample Saga — Deluxe', volumeNumber: 1 }), REAL);
    const placeholder = resolveVolumePrice(inp({ canonicalTitle: 'Placeholder Chronicles — Deluxe', volumeNumber: 1 }), REAL);
    expect(placeholder.cents).toBe(1899);
    expect(sample.cents).toBe(4999);
    expect(placeholder.edition).toBe('deluxe');
    expect(sample.edition).toBe('deluxe');
    expect(placeholder.cents).not.toBe(sample.cents);
  });

  it('Omnibus / Example Press → publisher-edition 2199', () => {
    expect(resolveVolumePrice(inp({ canonicalTitle: 'Plain Tale Omnibus', publisher: 'Example Press', volumeNumber: 1 }), REAL)).toMatchObject({
      cents: 2199,
      basis: 'publisher-edition',
      edition: 'omnibus',
    });
  });

  it('Plain Tale vol 5 / Example Press → publisher-standard 1099', () => {
    expect(resolveVolumePrice(inp({ canonicalTitle: 'Plain Tale', publisher: 'Example Press', volumeNumber: 5 }), REAL)).toMatchObject({
      cents: 1099,
      basis: 'publisher-standard',
      publisherSlug: 'example press',
    });
  });

  it('Another Tale vol 1 / Sample House Comics → publisher-standard 1499', () => {
    expect(resolveVolumePrice(inp({ canonicalTitle: 'Another Tale', publisher: 'Sample House Comics', volumeNumber: 1 }), REAL)).toMatchObject({
      cents: 1499,
      basis: 'publisher-standard',
      publisherSlug: 'sample house',
    });
  });

  it('REGRESSION: Tiny Tale / Example Press / totalVolumesKnown 1 → 1099 publisher-standard, NOT the one-shot band', () => {
    // The precedence decision: publisher-standard outranks one-shot. A normal one-shot must not
    // be priced as an oversized art book.
    expect(resolveVolumePrice(inp({ canonicalTitle: 'Tiny Tale', publisher: 'Example Press', totalVolumesKnown: 1 }), REAL)).toMatchObject({
      cents: 1099,
      basis: 'publisher-standard',
    });
  });

  it('Lone Story / null publisher / totalVolumesKnown 1 → one-shot 1399', () => {
    expect(resolveVolumePrice(inp({ canonicalTitle: 'Lone Story', publisher: null, totalVolumesKnown: 1 }), REAL)).toMatchObject({
      cents: 1399,
      basis: 'one-shot',
    });
  });

  it('unknown publisher + multi-volume → default 999', () => {
    expect(resolveVolumePrice(inp({ canonicalTitle: 'Some Unknown Series', publisher: 'Nobody Press', totalVolumesKnown: 12 }), REAL)).toMatchObject({
      cents: 999,
      basis: 'default',
    });
  });
});

describe('resolveVolumePrice — synthetic edge cases', () => {
  const synth: PriceTable = {
    version: 1,
    defaultCents: 500,
    oneShotCents: 900,
    publisherStandard: { acme: 700 },
    // NOTE: acme has NO 'deluxe' entry — a deluxe acme volume must fall through to publisher-standard.
    publisherEdition: { acme: { omnibus: 1200 } },
    seriesOverrides: {},
    seriesVolumeOverrides: {},
  };

  it('a detected edition with no publisherEdition entry falls through to publisher-standard, not default', () => {
    const r = resolveVolumePrice(inp({ canonicalTitle: 'Widget — Deluxe', publisher: 'ACME', volumeNumber: 2 }), synth);
    expect(r).toMatchObject({ cents: 700, basis: 'publisher-standard', edition: 'deluxe', publisherSlug: 'acme' });
  });

  it('a matching publisherEdition entry (omnibus) is used', () => {
    const r = resolveVolumePrice(inp({ canonicalTitle: 'Widget Omnibus', publisher: 'ACME', volumeNumber: 1 }), synth);
    expect(r).toMatchObject({ cents: 1200, basis: 'publisher-edition', edition: 'omnibus' });
  });

  it('resolveVolumePrice is TOTAL: always a positive integer, even with everything null/unknown', () => {
    const r = resolveVolumePrice(inp({ canonicalTitle: '???', publisher: null, volumeNumber: null, totalVolumesKnown: null }), synth);
    expect(Number.isInteger(r.cents)).toBe(true);
    expect(r.cents).toBeGreaterThan(0);
    expect(r.basis).toBe('default');
  });
});
