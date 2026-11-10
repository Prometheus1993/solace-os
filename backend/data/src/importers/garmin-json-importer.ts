import type { RecoveryDayInput } from '@solace/core';

/**
 * The Garmin MCP (Taxuspt/garmin_mcp) returns wellness as JSON. This bridge takes a NORMALISED daily
 * wellness object — assembled from the MCP's get_hrv_data / get_sleep_data /
 * get_rhr_day / get_body_battery responses — and maps it into recovery_days.
 *
 * The reshape from raw MCP JSON into this contract happens at fetch time (by
 * `syncGarmin`, or by hand for the MCP); this importer only validates + clamps a
 * clean shape, so it stays decoupled from MCP-response drift. `bodyBattery` is
 * the start-of-day (morning) level. Rows are tagged source 'garmin_mcp' for
 * provenance, and merged (COALESCE upsert) by date so repeated imports never wipe other metrics.
 */

/** One day as supplied to import-garmin-json. Every metric is optional/nullable. */
export interface GarminWellnessDay {
  date: string;
  sleepScore?: number | null;
  hrvOvernightMs?: number | null;
  restingHrBpm?: number | null;
  bodyBattery?: number | null;
}

export interface GarminWellnessJson {
  source?: string;
  days: GarminWellnessDay[];
}

export interface GarminJsonParse {
  recoveryDays: RecoveryDayInput[];
  /** Dropped whole: invalid/missing date, or no usable metric on the day. */
  skippedDays: number;
  /** Individual values nulled because they were non-finite or out of range. */
  droppedMetrics: number;
  note: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Format AND calendar validity (rejects 2026-02-31). Deterministic UTC parts. */
function isRealIsoDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * A finite number within [lo, hi], else null. Accepts only an actual number or a
 * non-blank fully-numeric string — never lets JS coerce '', '  ', [], false, true
 * or [42] into a spurious 0/1 (a blank sleepScore/bodyBattery has valid floor 0,
 * so coercion would write a clinical "rock-bottom" reading instead of nulling it).
 * Counts how many values it drops, so droppedMetrics is a trustworthy audit signal.
 */
function bounded(v: unknown, lo: number, hi: number, dropped: { n: number }): number | null {
  if (v == null) return null;
  let n: number;
  if (typeof v === 'number') {
    n = v;
  } else if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) {
    n = Number(v);
  } else {
    dropped.n++;
    return null;
  }
  if (!Number.isFinite(n) || n < lo || n > hi) {
    dropped.n++;
    return null;
  }
  return n;
}

/**
 * Parse a normalised Garmin wellness JSON (string or already-parsed object) into
 * recovery_days input. Days with an invalid/missing date, or with no usable
 * metric at all, are skipped — never written as empty rows.
 */
export function parseGarminWellnessJson(input: string | GarminWellnessJson): GarminJsonParse {
  let obj: GarminWellnessJson;
  if (typeof input === 'string') {
    try {
      obj = JSON.parse(input) as GarminWellnessJson;
    } catch {
      return { recoveryDays: [], skippedDays: 0, droppedMetrics: 0, note: 'invalid JSON' };
    }
  } else {
    obj = input;
  }

  const days = Array.isArray(obj?.days) ? obj.days : [];
  const dropped = { n: 0 };
  // Keyed by date so duplicate dates within one payload merge here (the way the DB
  // upsert would), keeping recoveryDays.length === distinct days actually written.
  const byDate = new Map<string, RecoveryDayInput>();
  let skipped = 0;

  for (const d of days) {
    const date = (d?.date ?? '').trim();
    if (!isRealIsoDate(date)) {
      skipped++;
      continue;
    }
    const sleepScore = bounded(d.sleepScore, 0, 100, dropped);
    const hrvOvernightMs = bounded(d.hrvOvernightMs, 1, 500, dropped);
    const restingHrBpm = bounded(d.restingHrBpm, 25, 120, dropped);
    const bodyBattery = bounded(d.bodyBattery, 0, 100, dropped);
    if (sleepScore == null && hrvOvernightMs == null && restingHrBpm == null && bodyBattery == null) {
      skipped++;
      continue;
    }
    const prev = byDate.get(date);
    if (prev) {
      // Later non-null value wins, mirroring the COALESCE upsert.
      prev.sleepScore = sleepScore ?? prev.sleepScore;
      prev.hrvOvernightMs = hrvOvernightMs ?? prev.hrvOvernightMs;
      prev.restingHrBpm = restingHrBpm ?? prev.restingHrBpm;
      prev.bodyBattery = bodyBattery ?? prev.bodyBattery;
    } else {
      byDate.set(date, { date, sleepScore, hrvOvernightMs, restingHrBpm, bodyBattery, source: 'garmin_mcp' });
    }
  }

  const recoveryDays = [...byDate.values()];

  const note =
    `${recoveryDays.length} day(s)` +
    (skipped ? `, ${skipped} skipped` : '') +
    (dropped.n ? `, ${dropped.n} out-of-range value(s) nulled` : '');
  return { recoveryDays, skippedDays: skipped, droppedMetrics: dropped.n, note };
}
