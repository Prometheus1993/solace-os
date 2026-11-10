import { Decoder, Stream } from '@garmin/fitsdk';
import { FIT_EPOCH_OFFSET_S, SEMICIRCLE_TO_DEGREE, type LapInput, type RunSampleInput, type TemperatureSource } from '@solace/core';

/**
 * Parse a Garmin .FIT activity into a normalized run + per-second samples + laps.
 *
 * Defensive by design: real device files drop fields (no HR strap, no GPS, no
 * temperature sensor, no power), so every field is existence-checked and absent
 * values become null rather than 0.
 *
 * The SDK (with defaults) already applies scale/offset (speeds in m/s, distance
 * in m) and converts dateTime fields to JS Date. GPS stays in SEMICIRCLES — we
 * convert with the shared constant. These conversions are exact, so they are not
 * audited per-sample (the audit trail is for lossy transforms).
 */

type AnyMesg = Record<string, unknown>;

export interface ParsedFitRun {
  startTimeUtc: number;
  startTimeLocal: string;
  sport: string;
  totalDistanceM: number;
  totalDurationS: number;
  avgHrBpm: number | null;
  maxHrBpm: number | null;
  avgEnhancedSpeedMps: number | null;
  avgCadence: number | null;
  avgPowerW: number | null;
  startLatDeg: number | null;
  startLonDeg: number | null;
  elevationGainM: number | null;
  temperatureSource: TemperatureSource;
  correctedTemperatureC: number | null;
  samples: RunSampleInput[];
  laps: LapInput[];
}

const numField = (m: AnyMesg, key: string): number | null => {
  const v = m[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};

const strField = (m: AnyMesg, key: string): string | null => {
  const v = m[key];
  return typeof v === 'string' ? v : null;
};

/** DateTime fields decode to JS Date by default; convert to Unix seconds. */
const unixField = (m: AnyMesg, key: string): number | null => {
  const v = m[key];
  if (v instanceof Date) return Math.floor(v.getTime() / 1000);
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return null;
};

/**
 * Normalise a FIT date/local-date field to unix-equivalent seconds, robust to BOTH representations the
 * SDK may return (a JS Date when convertDateTimesToDates applies, or a raw FIT timestamp = seconds since
 * the 1989 epoch). Adding the epoch to a raw number makes a `local_date_time` read back as the local
 * wall-clock-as-unix, so subtracting the UTC `timestamp` yields the device's offset even if the two
 * fields come back in different representations.
 */
const activityUnix = (m: AnyMesg, key: string): number | null => {
  const v = m[key];
  if (v instanceof Date) return Math.floor(v.getTime() / 1000);
  if (typeof v === 'number' && Number.isFinite(v)) return v + FIT_EPOCH_OFFSET_S;
  return null;
};

/**
 * Format a UTC instant as a local-time ISO string carrying the device's offset, so the date prefix
 * (`startTimeLocal.slice(0,10)`, the only thing consumers read) is the true LOCAL calendar date — a run
 * started just after local midnight no longer buckets to the previous day/ISO week.
 */
const toLocalIso = (utcSeconds: number, offsetSeconds: number): string => {
  const wall = new Date((utcSeconds + offsetSeconds) * 1000).toISOString().slice(0, 19);
  const sign = offsetSeconds < 0 ? '-' : '+';
  const abs = Math.abs(offsetSeconds);
  const hh = String(Math.floor(abs / 3600)).padStart(2, '0');
  const mm = String(Math.floor((abs % 3600) / 60)).padStart(2, '0');
  return `${wall}${sign}${hh}:${mm}`;
};

const toDeg = (semi: number | null): number | null => (semi == null ? null : semi * SEMICIRCLE_TO_DEGREE);

const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** The dropped file is not a usable FIT run: the caller's fault, not a server failure. */
export class FitParseError extends Error {}

export function importFit(bytes: Uint8Array): ParsedFitRun {
  const stream = Stream.fromByteArray(Array.from(bytes));
  const decoder = new Decoder(stream);
  if (!decoder.isFIT()) {
    throw new FitParseError('Not a FIT file (header check failed).');
  }
  const { messages } = decoder.read({ applyScaleAndOffset: true, convertDateTimesToDates: true, mergeHeartRates: true });

  const records = (messages.recordMesgs ?? []) as unknown as AnyMesg[];
  const sessions = (messages.sessionMesgs ?? []) as unknown as AnyMesg[];
  const lapMesgs = (messages.lapMesgs ?? []) as unknown as AnyMesg[];
  const activities = (messages.activityMesgs ?? []) as unknown as AnyMesg[];
  const session: AnyMesg = sessions[0] ?? {};
  const activity: AnyMesg = activities[0] ?? {};

  if (records.length === 0 && sessions.length === 0) {
    throw new FitParseError('FIT file contains no record or session messages.');
  }

  // --- Run start time (UTC seconds) ---
  const firstRecUnix = records.length ? unixField(records[0] as AnyMesg, 'timestamp') : null;
  const startTimeUtc = unixField(session, 'startTime') ?? firstRecUnix ?? 0;

  // --- Local-time offset (for the calendar-date bucket) ---
  // The `activity` message carries both `timestamp` (UTC) and `localTimestamp` (the same instant as the
  // device's LOCAL wall clock). Their difference is the UTC offset in seconds; 0 if the message is absent.
  const actUtc = activityUnix(activity, 'timestamp');
  const actLocal = activityUnix(activity, 'localTimestamp');
  const localOffsetS = actUtc != null && actLocal != null ? actLocal - actUtc : 0;

  // --- Per-second samples + record-derived fallbacks ---
  const samples: RunSampleInput[] = [];
  const hrs: number[] = [];
  const speeds: number[] = [];
  const temps: number[] = [];
  let lastRecUnix: number | null = null;
  let lastDistance: number | null = null;

  records.forEach((rec, index) => {
    const recUnix = unixField(rec, 'timestamp');
    const hr = numField(rec, 'heartRate');
    const enhancedSpeed = numField(rec, 'enhancedSpeed');
    const speed = numField(rec, 'speed');
    const temp = numField(rec, 'temperature');
    const distance = numField(rec, 'distance');

    if (hr != null) hrs.push(hr);
    const effSpeed = enhancedSpeed ?? speed;
    if (effSpeed != null) speeds.push(effSpeed);
    if (temp != null) temps.push(temp);
    if (recUnix != null) lastRecUnix = recUnix;
    if (distance != null) lastDistance = distance;

    samples.push({
      tOffsetS: recUnix != null ? recUnix - startTimeUtc : index,
      heartRateBpm: hr,
      enhancedSpeedMps: enhancedSpeed,
      speedMps: speed,
      cadence: numField(rec, 'cadence'),
      powerW: numField(rec, 'power'),
      latDeg: toDeg(numField(rec, 'positionLat')),
      lonDeg: toDeg(numField(rec, 'positionLong')),
      altitudeM: numField(rec, 'enhancedAltitude') ?? numField(rec, 'altitude'),
      distanceM: distance,
      temperatureC: temp,
    });
  });

  // --- Laps ---
  const laps: LapInput[] = lapMesgs.map((lap, i) => ({
    lapIndex: i,
    startTimeUtc: unixField(lap, 'startTime') ?? startTimeUtc,
    totalDistanceM: numField(lap, 'totalDistance') ?? 0,
    totalDurationS: numField(lap, 'totalTimerTime') ?? numField(lap, 'totalElapsedTime') ?? 0,
    avgHrBpm: numField(lap, 'avgHeartRate'),
    maxHrBpm: numField(lap, 'maxHeartRate'),
    avgSpeedMps: numField(lap, 'enhancedAvgSpeed') ?? numField(lap, 'avgSpeed'),
  }));

  // --- Run-level summary (session first, record fallbacks) ---
  const durationFromRecords = lastRecUnix != null ? lastRecUnix - startTimeUtc : null;
  const hasTemp = temps.length > 0;

  return {
    startTimeUtc,
    startTimeLocal: toLocalIso(startTimeUtc, localOffsetS),
    sport: strField(session, 'sport') ?? 'running',
    totalDistanceM: numField(session, 'totalDistance') ?? lastDistance ?? 0,
    totalDurationS: numField(session, 'totalTimerTime') ?? numField(session, 'totalElapsedTime') ?? durationFromRecords ?? 0,
    avgHrBpm: numField(session, 'avgHeartRate') ?? (mean(hrs) == null ? null : Math.round(mean(hrs) as number)),
    maxHrBpm: numField(session, 'maxHeartRate') ?? (hrs.length ? Math.max(...hrs) : null),
    avgEnhancedSpeedMps: numField(session, 'enhancedAvgSpeed') ?? numField(session, 'avgSpeed') ?? mean(speeds),
    avgCadence: numField(session, 'avgCadence'),
    avgPowerW: numField(session, 'avgPower'),
    startLatDeg: toDeg(numField(session, 'startPositionLat')) ?? (samples.find((s) => s.latDeg != null)?.latDeg ?? null),
    startLonDeg: toDeg(numField(session, 'startPositionLong')) ?? (samples.find((s) => s.lonDeg != null)?.lonDeg ?? null),
    elevationGainM: numField(session, 'totalAscent'),
    temperatureSource: hasTemp ? 'fit' : 'none',
    correctedTemperatureC: hasTemp ? mean(temps) : null,
    samples,
    laps,
  };
}
