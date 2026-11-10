import { Encoder, Profile, Utils } from '@garmin/fitsdk';

/**
 * Generate a synthetic but real-format .FIT activity for tests, using the
 * official SDK Encoder. This lets the importer be proven end-to-end without a real export.
 */

type Mesg = Record<string, number>;

// The SDK's writeMesg typing is strict about the profile shape; for a test
// fixture we write plain field maps and let the encoder map them by name.
const write = (enc: Encoder, mesg: Mesg): void => {
  (enc as unknown as { writeMesg: (m: Mesg) => void }).writeMesg(mesg);
};

// Profile.MesgNum is an index-signature map, so accesses are `number | undefined`
// under noUncheckedIndexedAccess. These are known-present global message numbers.
const MESG = {
  fileId: Profile.MesgNum.FILE_ID as number,
  record: Profile.MesgNum.RECORD as number,
  session: Profile.MesgNum.SESSION as number,
  activity: Profile.MesgNum.ACTIVITY as number,
};

const SEMI_PER_DEGREE = 2 ** 31 / 180;
const toSemicircles = (deg: number): number => Math.round(deg * SEMI_PER_DEGREE);

/** convertDateToDateTime can return undefined for invalid dates; assert here. */
const dt = (date: Date): number => {
  const v = Utils.convertDateToDateTime(date);
  if (v == null) throw new Error(`convertDateToDateTime failed for ${date.toISOString()}`);
  return v;
};

export interface MakeFitOptions {
  /** Number of 1-second record samples. */
  n?: number;
  avgHr?: number;
  speedMps?: number;
  startIso?: string;
  withGps?: boolean;
  lat?: number;
  lon?: number;
  withTemperature?: boolean;
  temperatureC?: number;
  /** Device UTC offset in minutes (e.g. 120 = CEST). Writes the activity message's localTimestamp. */
  utcOffsetMinutes?: number;
}

export function makeSyntheticFit(options: MakeFitOptions = {}): Uint8Array {
  const {
    n = 600,
    avgHr = 150,
    speedMps = 2.8,
    startIso = '2026-05-20T07:00:00Z',
    withGps = true,
    lat = 50.85,
    lon = 4.35,
    withTemperature = true,
    temperatureC = 22,
    utcOffsetMinutes = 0,
  } = options;

  const startMs = new Date(startIso).getTime();
  const startDateTime = dt(new Date(startMs));

  const enc = new Encoder();

  write(enc, {
    mesgNum: MESG.fileId,
    type: 4, // activity
    manufacturer: 255, // development
    product: 0,
    serialNumber: 1234,
    timeCreated: startDateTime,
  });

  for (let i = 0; i < n; i++) {
    const rec: Mesg = {
      mesgNum: MESG.record,
      timestamp: dt(new Date(startMs + i * 1000)),
      heartRate: avgHr,
      enhancedSpeed: speedMps,
      distance: i * speedMps,
      cadence: 85,
      enhancedAltitude: 50,
    };
    if (withGps) {
      rec['positionLat'] = toSemicircles(lat);
      rec['positionLong'] = toSemicircles(lon);
    }
    if (withTemperature) {
      rec['temperature'] = temperatureC;
    }
    write(enc, rec);
  }

  const session: Mesg = {
    mesgNum: MESG.session,
    timestamp: dt(new Date(startMs + n * 1000)),
    startTime: startDateTime,
    sport: 1, // running
    totalElapsedTime: n,
    totalTimerTime: n,
    totalDistance: n * speedMps,
    enhancedAvgSpeed: speedMps,
    avgHeartRate: avgHr,
    maxHeartRate: avgHr,
    avgCadence: 85,
    totalAscent: 10,
  };
  if (withGps) {
    session['startPositionLat'] = toSemicircles(lat);
    session['startPositionLong'] = toSemicircles(lon);
  }
  write(enc, session);

  // Activity message: timestamp (UTC) + localTimestamp (the same instant in local wall-clock). A real
  // Garmin activity file always carries this; the importer derives the UTC offset from the difference.
  const endMs = startMs + n * 1000;
  write(enc, {
    mesgNum: MESG.activity,
    timestamp: dt(new Date(endMs)),
    localTimestamp: dt(new Date(endMs + utcOffsetMinutes * 60_000)),
    numSessions: 1,
    totalTimerTime: n,
    type: 0, // manual
  });

  return enc.close();
}
