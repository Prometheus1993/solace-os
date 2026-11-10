import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { nextVolumeToBuy, parsePriceTable, resolveVolumePrice, type PriceBasis, type PriceTable, type Repository, type Series, type Volume } from '@solace/core';

/**
 * "Did you buy this?" — the ARCHIVES Next-to-buy tap flow. Confirming marks ONE volume of a series as
 * owned AND records what it cost, in one call, so Σ spent moves the moment a volume is added (before this,
 * a new Volume/Copy never carried a Purchase).
 *
 * The price is either a real receipt (the caller passes `priceCents` → `estimated:false`) or a guess
 * resolved DETERMINISTICALLY from the price table (`resolveVolumePrice`, `source:'price_table'`,
 * `estimated:true`). Without a table the volume is still marked owned, just unpriced.
 */

/** Which price table to read (cwd = repo root): `SOLACE_PRICE_TABLE`, else your own `source-exports/price-table.json`
 *  (git-ignored) when it exists, else the tracked made-up example `config/price-table.example.json`. */
export function priceTablePath(): string {
  const own = resolve(process.cwd(), 'source-exports', 'price-table.json');
  return process.env['SOLACE_PRICE_TABLE'] || (existsSync(own) ? own : resolve(process.cwd(), 'config', 'price-table.example.json'));
}

/** Read + validate the price table; null when the file is missing or malformed (the feature degrades, never errors). */
export function readPriceTable(path: string): PriceTable | null {
  try {
    return parsePriceTable(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    return null;
  }
}

export interface VolumeQuote {
  /** The series' next volume to buy (owned+1), or null when there's nothing to buy. */
  volumeNumber: number | null;
  priceCents: number | null;
  basis: PriceBasis | null;
  publisherSlug: string | null;
}

function priceFor(series: Series, volumeNumber: number, volume: Volume | undefined, table: PriceTable | null) {
  if (table == null) return null;
  return resolveVolumePrice(
    {
      canonicalTitle: series.canonicalTitle,
      publisher: volume?.publisher ?? series.englishPublisher,
      volumeNumber,
      totalVolumesKnown: series.totalVolumesKnown,
      format: volume?.format ?? 'single',
    },
    table,
  );
}

/** The price the confirm prompt pre-fills for a series' next volume. null ⇔ the series doesn't exist. */
export async function quoteNextVolume(repo: Repository, seriesId: number, table: PriceTable | null): Promise<VolumeQuote | null> {
  const series = await repo.getSeries(seriesId);
  if (!series) return null;
  const volumes = await repo.listVolumesBySeries(seriesId);
  const volumeIds = new Set(volumes.map((v) => v.id));
  const copies = (await repo.listCopies()).filter((c) => volumeIds.has(c.volumeId));
  const n = nextVolumeToBuy(series, volumes, copies);
  if (n == null) return { volumeNumber: null, priceCents: null, basis: null, publisherSlug: null };
  const res = priceFor(series, n, volumes.find((v) => v.volumeNumber === n), table);
  return { volumeNumber: n, priceCents: res?.cents ?? null, basis: res?.basis ?? null, publisherSlug: res?.publisherSlug ?? null };
}

export interface VolumeBuyInput {
  seriesId: number;
  volumeNumber: number;
  /** A real receipt in EUR cents. Absent → priced from `table` as an estimate. */
  priceCents?: number | null;
  /** ISO date the copy was acquired (+ the purchase date). */
  date: string;
  table: PriceTable | null;
}

export type VolumeBuyResult =
  | { ok: true; volumeId: number; copyId: number; purchaseId: number | null; priceCents: number | null; estimated: boolean }
  | { ok: false; reason: 'not_found' | 'already_owned' };

/**
 * Mark volume N of a series as bought: find-or-create the Volume, flip an unowned Copy to owned (or add
 * one), then create a single Purchase + PurchaseItem and LINK the copy's `purchaseId` (without that link
 * the money is orphaned from the series view). Any failure after the first write undoes what this call
 * created, so a half-recorded buy never lingers.
 */
export async function recordVolumeBought(repo: Repository, input: VolumeBuyInput): Promise<VolumeBuyResult> {
  const series = await repo.getSeries(input.seriesId);
  if (!series) return { ok: false, reason: 'not_found' };
  const n = input.volumeNumber;
  const existing = (await repo.listVolumesBySeries(series.id)).find((v) => v.volumeNumber === n);
  const copies = existing ? await repo.listCopiesByVolume(existing.id) : [];
  if (copies.some((c) => c.owned)) return { ok: false, reason: 'already_owned' };

  const undo: Array<() => Promise<unknown>> = [];
  try {
    let volume = existing;
    if (!volume) {
      volume = await repo.addVolume({ seriesId: series.id, volumeNumber: n, title: null, isbn13: null, isbn10: null, publisher: null, releaseDateEn: null, releaseDateJp: null, pageCount: null, coverUrl: null, coverSource: null, format: 'single' });
      const created = volume;
      undo.push(() => repo.deleteVolume(created.id)); // cascades any copy added below
    }

    const unowned = copies[0];
    let copyId: number;
    if (unowned) {
      await repo.updateCopy(unowned.id, { owned: true, acquiredDate: input.date });
      undo.push(() => repo.updateCopy(unowned.id, { owned: false, acquiredDate: unowned.acquiredDate }));
      copyId = unowned.id;
    } else {
      const copy = await repo.addCopy({ volumeId: volume.id, owned: true, acquiredDate: input.date, condition: null, readStatus: 'unread', readDate: null, rating: null, notes: null, purchaseId: null });
      if (existing) undo.push(() => repo.deleteCopy(copy.id));
      copyId = copy.id;
    }

    const receipt = input.priceCents != null;
    const res = receipt ? null : priceFor(series, n, volume, input.table);
    const priceCents = receipt ? input.priceCents! : (res?.cents ?? null);
    if (priceCents == null) return { ok: true, volumeId: volume.id, copyId, purchaseId: null, priceCents: null, estimated: false };

    const basisLabel = res ? (res.publisherSlug ? `${res.basis}, ${res.publisherSlug}` : res.basis) : '';
    const purchase = await repo.addPurchase({
      date: input.date,
      source: receipt ? 'manual' : 'price_table',
      totalPrice: priceCents,
      currency: 'EUR',
      type: 'single',
      estimated: !receipt,
      notes: res ? `price-table: ${basisLabel} (edition ${res.edition})` : null,
    });
    undo.push(() => repo.deletePurchase(purchase.id)); // cascades items, SET NULLs the copy link
    await repo.addPurchaseItems([{ purchaseId: purchase.id, volumeId: volume.id, allocatedPrice: priceCents }]);
    await repo.updateCopy(copyId, { purchaseId: purchase.id });
    return { ok: true, volumeId: volume.id, copyId, purchaseId: purchase.id, priceCents, estimated: !receipt };
  } catch (err) {
    for (const step of undo.reverse()) await step().catch(() => {});
    throw err;
  }
}
