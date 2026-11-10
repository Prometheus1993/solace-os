import { describe, expect, it } from 'vitest';
import {
  ingestGarminWellnessJson,
  migrate,
  openDatabase,
  parseGarminWellnessJson,
  SqliteRepository,
} from '../src/index.ts';

function ctx() {
  const db = openDatabase(':memory:');
  migrate(db);
  return { db, repo: new SqliteRepository(db) };
}

describe('parseGarminWellnessJson', () => {
  it('maps valid days to recovery input tagged garmin_mcp', () => {
    const { recoveryDays, skippedDays, droppedMetrics } = parseGarminWellnessJson(
      JSON.stringify({
        source: 'garmin_connect',
        days: [{ date: '2026-06-18', sleepScore: 82, hrvOvernightMs: 41, restingHrBpm: 52, bodyBattery: 78 }],
      }),
    );
    expect(skippedDays).toBe(0);
    expect(droppedMetrics).toBe(0);
    expect(recoveryDays).toEqual([
      { date: '2026-06-18', sleepScore: 82, hrvOvernightMs: 41, restingHrBpm: 52, bodyBattery: 78, source: 'garmin_mcp' },
    ]);
  });

  it('skips impossible/garbage dates and all-null days', () => {
    const r = parseGarminWellnessJson({
      days: [
        { date: '2026-02-31', bodyBattery: 60 }, // not a real calendar day
        { date: 'not-a-date', sleepScore: 70 },
        { date: '2026-06-19' }, // no metric at all
        { date: '2026-06-20', hrvOvernightMs: 44 }, // the only keeper
      ],
    });
    expect(r.recoveryDays.map((d) => d.date)).toEqual(['2026-06-20']);
    expect(r.skippedDays).toBe(3);
  });

  it('nulls out-of-range metrics but keeps the day if another metric survives', () => {
    const r = parseGarminWellnessJson({
      days: [{ date: '2026-06-20', bodyBattery: 150, restingHrBpm: 5, sleepScore: 88 }],
    });
    expect(r.droppedMetrics).toBe(2); // bodyBattery 150 + restingHr 5 both out of range
    expect(r.recoveryDays).toEqual([
      { date: '2026-06-20', sleepScore: 88, hrvOvernightMs: null, restingHrBpm: null, bodyBattery: null, source: 'garmin_mcp' },
    ]);
  });

  it('rejects non-numeric junk instead of coercing it to 0/1', () => {
    // Number('')===0, Number(false)===0, Number([])===0 would all pass a [0,100]
    // floor; Number(true)===1, Number([42])===42 would pass higher floors. None
    // may slip through: each is counted as a dropped metric, never written. The
    // junk is fed as raw JSON (the real wire shape) so these untyped values land.
    const r = parseGarminWellnessJson(
      '{"days":[' +
        '{"date":"2026-06-18","sleepScore":"","bodyBattery":"  "},' + // blank strings
        '{"date":"2026-06-19","sleepScore":false,"bodyBattery":[]},' + // bool / array
        '{"date":"2026-06-20","hrvOvernightMs":true,"restingHrBpm":[42]}' + // bool / single-array
        ']}',
    );
    expect(r.recoveryDays).toEqual([]); // every metric junk → every day skipped
    expect(r.skippedDays).toBe(3);
    expect(r.droppedMetrics).toBe(6);
  });

  it('accepts numeric strings but drops partial-numeric ones', () => {
    const r = parseGarminWellnessJson('{"days":[{"date":"2026-06-21","bodyBattery":"81","sleepScore":"90abc"}]}');
    expect(r.recoveryDays).toEqual([
      { date: '2026-06-21', sleepScore: null, hrvOvernightMs: null, restingHrBpm: null, bodyBattery: 81, source: 'garmin_mcp' },
    ]);
    expect(r.droppedMetrics).toBe(1); // '90abc' → NaN → dropped
  });

  it('merges duplicate dates within one payload (count reflects distinct days)', () => {
    const r = parseGarminWellnessJson({
      days: [
        { date: '2026-06-18', hrvOvernightMs: 41 },
        { date: '2026-06-18', restingHrBpm: 52, bodyBattery: 78 },
      ],
    });
    expect(r.recoveryDays).toEqual([
      { date: '2026-06-18', sleepScore: null, hrvOvernightMs: 41, restingHrBpm: 52, bodyBattery: 78, source: 'garmin_mcp' },
    ]);
  });

  it('returns empty with a note on invalid JSON', () => {
    const r = parseGarminWellnessJson('{ not json');
    expect(r.recoveryDays).toEqual([]);
    expect(r.note).toBe('invalid JSON');
  });
});

describe('ingestGarminWellnessJson', () => {
  it('upserts and COALESCE-merges with an existing CSV-sourced day', async () => {
    const { repo } = ctx();
    // A prior CSV import gave this date only a sleep score.
    await repo.upsertRecoveryDays([
      { date: '2026-06-18', sleepScore: 80, hrvOvernightMs: null, restingHrBpm: null, bodyBattery: null, source: 'garmin_csv' },
    ]);

    // The MCP fills in HRV / resting-HR / body battery (sleep omitted).
    const summary = await ingestGarminWellnessJson(
      repo,
      JSON.stringify({ days: [{ date: '2026-06-18', hrvOvernightMs: 41, restingHrBpm: 52, bodyBattery: 78 }] }),
    );
    expect(summary.daysWritten).toBe(1);

    const day = (await repo.getRecoveryDays()).find((d) => d.date === '2026-06-18');
    expect(day).toEqual({
      date: '2026-06-18',
      sleepScore: 80, // kept from the CSV row (MCP omitted it)
      hrvOvernightMs: 41,
      restingHrBpm: 52,
      bodyBattery: 78,
      source: 'garmin_mcp', // last writer sets provenance
    });
  });

  it('reports daysWritten as distinct dates, not input rows', async () => {
    const { repo } = ctx();
    const summary = await ingestGarminWellnessJson(
      repo,
      JSON.stringify({
        days: [
          { date: '2026-06-18', hrvOvernightMs: 41 },
          { date: '2026-06-18', restingHrBpm: 52 }, // same date → one DB row
        ],
      }),
    );
    expect(summary.daysWritten).toBe(1);
    expect((await repo.getRecoveryDays()).length).toBe(1);
  });
});

describe('migration v3 recovery_days.source CHECK', () => {
  it('accepts garmin_mcp and still rejects an unknown source', () => {
    const { db } = ctx();
    expect(() =>
      db.prepare("INSERT INTO recovery_days (date, source) VALUES ('2026-01-01', 'garmin_mcp')").run(),
    ).not.toThrow();
    expect(() =>
      db.prepare("INSERT INTO recovery_days (date, source) VALUES ('2026-01-02', 'bogus')").run(),
    ).toThrow();
  });
});
