import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_CONFIG } from '@solace/core';
import { describe, expect, it } from 'vitest';
import {
  ingestManualStrengthSession,
  ManualStrengthValidationError,
  manualStrengthSourceHash,
  migrate,
  openDatabase,
  SqliteRepository,
  toRawStrengthSession,
  validateManualStrengthInput,
} from '../src/index.ts';

const parseManualStrengthInput = (jsonText: string) => validateManualStrengthInput(JSON.parse(jsonText));

// Well after DEFAULT_CONFIG.hevyTotalWeightSwitchDate (a date convention): every set is a total-weight
// passthrough regardless of equipment, matching how total-weight logging works post-switch.
const VALID_JSON = JSON.stringify({
  date: '2026-09-27',
  notes: 'Push day',
  exercises: [
    { name: 'Bench Press', sets: [{ reps: 5, weightKg: 100 }, { reps: 5, weightKg: 100 }] },
    { name: 'Incline Db Bench Press', sets: [{ reps: 8, weightKg: 30 }] },
    { name: 'Lat Pulldown', sets: [{ reps: 12, weightKg: 70 }] },
    { name: 'Pull-Up', sets: [{ reps: 10, weightKg: 0 }] },
  ],
});

// Same date as VALID_JSON but different training content (a plausible "edited/reordered the file"
// re-import) — a DIFFERENT content hash on the SAME local calendar date, the case the same-day
// guard exists for.
const SAME_DAY_DIFFERENT_CONTENT_JSON = JSON.stringify({
  date: '2026-09-27',
  notes: 'Edited after the fact',
  exercises: [
    { name: 'Bench Press', sets: [{ reps: 5, weightKg: 100 }, { reps: 5, weightKg: 100 }] },
    { name: 'Lat Pulldown', sets: [{ reps: 12, weightKg: 70 }] },
  ],
});

describe('parseManualStrengthInput — valid input', () => {
  it('parses date, notes, and every exercise/set', () => {
    const parsed = parseManualStrengthInput(VALID_JSON);
    expect(parsed.date).toBe('2026-09-27');
    expect(parsed.notes).toBe('Push day');
    expect(parsed.exercises).toHaveLength(4);
    expect(parsed.exercises[0]).toEqual({ name: 'Bench Press', sets: [{ reps: 5, weightKg: 100 }, { reps: 5, weightKg: 100 }] });
  });

  it('tolerates an absent notes', () => {
    const parsed = parseManualStrengthInput(JSON.stringify({ date: '2026-09-27', exercises: [{ name: 'Squat', sets: [{ reps: 5, weightKg: 100 }] }] }));
    expect(parsed.notes).toBeUndefined();
  });

  it('silently ignores unknown top-level keys (e.g. a leftover durationMin)', () => {
    const parsed = parseManualStrengthInput(
      JSON.stringify({ date: '2026-09-27', durationMin: 55, bogus: true, exercises: [{ name: 'Squat', sets: [{ reps: 5, weightKg: 100 }] }] }),
    );
    expect(parsed).not.toHaveProperty('durationMin');
    expect(parsed).not.toHaveProperty('bogus');
    expect(parsed.exercises).toHaveLength(1);
  });
});

describe('parseManualStrengthInput — validation rejections', () => {
  const base = { date: '2026-09-27', exercises: [{ name: 'Bench Press', sets: [{ reps: 5, weightKg: 100 }] }] };

  it('rejects a non-object top level', () => {
    expect(() => parseManualStrengthInput('[]')).toThrow(ManualStrengthValidationError);
  });

  it('rejects a missing date', () => {
    expect(() => parseManualStrengthInput(JSON.stringify({ ...base, date: undefined }))).toThrow(/date/);
  });

  it('rejects an impossible calendar date', () => {
    expect(() => parseManualStrengthInput(JSON.stringify({ ...base, date: '2026-02-30' }))).toThrow(ManualStrengthValidationError);
  });

  it('rejects a malformed date string', () => {
    expect(() => parseManualStrengthInput(JSON.stringify({ ...base, date: '27-09-2026' }))).toThrow(ManualStrengthValidationError);
  });

  it('rejects an empty exercises array', () => {
    expect(() => parseManualStrengthInput(JSON.stringify({ ...base, exercises: [] }))).toThrow(/exercises/);
  });

  it('rejects a missing exercises field', () => {
    expect(() => parseManualStrengthInput(JSON.stringify({ date: '2026-09-27' }))).toThrow(/exercises/);
  });

  it('rejects an exercise with an empty name', () => {
    expect(() => parseManualStrengthInput(JSON.stringify({ date: '2026-09-27', exercises: [{ name: '  ', sets: [{ reps: 5, weightKg: 100 }] }] }))).toThrow(
      /name/,
    );
  });

  it('rejects an exercise with no sets', () => {
    expect(() => parseManualStrengthInput(JSON.stringify({ date: '2026-09-27', exercises: [{ name: 'Bench Press', sets: [] }] }))).toThrow(/sets/);
  });

  it('rejects zero reps', () => {
    expect(() =>
      parseManualStrengthInput(JSON.stringify({ date: '2026-09-27', exercises: [{ name: 'Bench Press', sets: [{ reps: 0, weightKg: 100 }] }] })),
    ).toThrow(/reps/);
  });

  it('rejects negative reps', () => {
    expect(() =>
      parseManualStrengthInput(JSON.stringify({ date: '2026-09-27', exercises: [{ name: 'Bench Press', sets: [{ reps: -5, weightKg: 100 }] }] })),
    ).toThrow(/reps/);
  });

  it('rejects non-integer reps', () => {
    expect(() =>
      parseManualStrengthInput(JSON.stringify({ date: '2026-09-27', exercises: [{ name: 'Bench Press', sets: [{ reps: 5.5, weightKg: 100 }] }] })),
    ).toThrow(/reps/);
  });

  it('rejects negative weight', () => {
    expect(() =>
      parseManualStrengthInput(JSON.stringify({ date: '2026-09-27', exercises: [{ name: 'Bench Press', sets: [{ reps: 5, weightKg: -1 }] }] })),
    ).toThrow(/weightKg/);
  });

  it('accepts weightKg of 0 (bodyweight)', () => {
    const parsed = parseManualStrengthInput(JSON.stringify({ date: '2026-09-27', exercises: [{ name: 'Pull-Up', sets: [{ reps: 10, weightKg: 0 }] }] }));
    expect(parsed.exercises[0]?.sets[0]).toEqual({ reps: 10, weightKg: 0 });
  });
});

describe('hold sets ({ seconds })', () => {
  const withSets = (sets: unknown[]) => JSON.stringify({ date: '2026-09-27', exercises: [{ name: 'Plank', sets }] });

  it('accepts whole seconds 1..3600 and keeps them as { seconds }', () => {
    const parsed = parseManualStrengthInput(withSets([{ seconds: 60 }, { seconds: 1 }, { seconds: 3600 }]));
    expect(parsed.exercises[0]?.sets).toEqual([{ seconds: 60 }, { seconds: 1 }, { seconds: 3600 }]);
  });

  it('rejects 0, 3601, fractions, negatives and non-numbers', () => {
    for (const seconds of [0, 3601, 59.5, -5, '60', null]) {
      expect(() => parseManualStrengthInput(withSets([{ seconds }])), String(seconds)).toThrow(/seconds/);
    }
  });

  it('rejects a set that mixes both kinds', () => {
    expect(() => parseManualStrengthInput(withSets([{ seconds: 60, reps: 5 }]))).toThrow(/not both/);
    expect(() => parseManualStrengthInput(withSets([{ seconds: 60, weightKg: 0 }]))).toThrow(/not both/);
  });

  it('a hold set and a rep set hash differently; the hold hash is stable', () => {
    const hold = parseManualStrengthInput(withSets([{ seconds: 60 }]));
    expect(manualStrengthSourceHash(hold)).toBe(manualStrengthSourceHash(parseManualStrengthInput(withSets([{ seconds: 60 }]))));
    expect(manualStrengthSourceHash(hold)).not.toBe(manualStrengthSourceHash(parseManualStrengthInput(withSets([{ reps: 60, weightKg: 0 }]))));
  });
});

describe('manualStrengthSourceHash', () => {
  it('is stable for identical content and ignores notes', () => {
    const a = parseManualStrengthInput(VALID_JSON);
    const b = parseManualStrengthInput(JSON.stringify({ ...JSON.parse(VALID_JSON), notes: 'different note' }));
    expect(manualStrengthSourceHash(a)).toBe(manualStrengthSourceHash(b));
  });

  it('differs when the training content differs', () => {
    const a = parseManualStrengthInput(VALID_JSON);
    const c = parseManualStrengthInput(JSON.stringify({ ...JSON.parse(VALID_JSON), date: '2026-09-28' }));
    expect(manualStrengthSourceHash(a)).not.toBe(manualStrengthSourceHash(c));
  });

  // Pins the EXACT hash of a sample session (`fixtures/sample-strength-session.json`) so no future
  // change to the hash function or its canonicalisation can silently break stored dedupe keys — a
  // mismatch here means an already-imported session would re-import as "new" instead of deduping.
  it('matches the pinned hash for fixtures/sample-strength-session.json', () => {
    const path = resolve(import.meta.dirname, './fixtures/sample-strength-session.json');
    const parsed = parseManualStrengthInput(readFileSync(path, 'utf8'));
    expect(manualStrengthSourceHash(parsed)).toBe('34fea6f2be7090a6fbafc90002eb2c28ce3ce1101ba9e57d2b27c3cbcb3092ac');
  });
});

describe('ingestManualStrengthSession', () => {
  it('applies total-weight passthrough (post-switch), persists sets, dedupes a re-run, and skips on dry-run', async () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const repo = new SqliteRepository(db);
    await repo.saveAthleteConfig(DEFAULT_CONFIG);

    const raw = toRawStrengthSession(parseManualStrengthInput(VALID_JSON));

    // --dry-run: parses + corrects but writes nothing.
    const dry = await ingestManualStrengthSession(repo, raw, { dryRun: true });
    expect(dry.imported).toBe(false);
    expect(dry.alreadyImported).toBe(false);
    expect(dry.sessionInput.sets).toHaveLength(5);
    expect(await repo.getStrengthSessions()).toHaveLength(0);

    // Real write.
    const first = await ingestManualStrengthSession(repo, raw);
    expect(first.imported).toBe(true);
    expect(first.setCount).toBe(5);

    const sets = await repo.getStrengthSets();
    expect(sets).toHaveLength(5);
    // Total-weight passthrough: post-switch, every set's real load equals its logged total weight
    // (no +20 bar, no x2 dumbbell), for EVERY equipment class.
    expect(sets.find((s) => s.exerciseName === 'Bench Press')?.realLoadKg).toBe(100);
    expect(sets.find((s) => s.exerciseName === 'Incline Db Bench Press')?.realLoadKg).toBe(30);
    expect(sets.find((s) => s.exerciseName === 'Lat Pulldown')?.realLoadKg).toBe(70);
    expect(sets.find((s) => s.exerciseName === 'Pull-Up')?.realLoadKg).toBe(0);
    for (const s of sets) {
      expect(s.correctionApplied).toMatch(/total weight/);
      expect(s.excludedFromTrend).toBe(false);
    }

    // Re-running the identical content is a no-op — no new session, no new sets.
    const second = await ingestManualStrengthSession(repo, raw);
    expect(second.imported).toBe(false);
    expect(second.alreadyImported).toBe(true);
    expect(await repo.getStrengthSessions()).toHaveLength(1);
    expect(await repo.getStrengthSets()).toHaveLength(5);

    db.close();
  });
});

describe('ingestManualStrengthSession — same-day guard', () => {
  function setup() {
    const db = openDatabase(':memory:');
    migrate(db);
    const repo = new SqliteRepository(db);
    return { db, repo };
  }

  it('refuses a same-day, different-content session and writes nothing', async () => {
    const { db, repo } = setup();
    await repo.saveAthleteConfig(DEFAULT_CONFIG);
    const first = await ingestManualStrengthSession(repo, toRawStrengthSession(parseManualStrengthInput(VALID_JSON)));
    expect(first.imported).toBe(true);

    const edited = toRawStrengthSession(parseManualStrengthInput(SAME_DAY_DIFFERENT_CONTENT_JSON));
    const result = await ingestManualStrengthSession(repo, edited);
    expect(result.imported).toBe(false);
    expect(result.alreadyImported).toBe(false);
    expect(result.sameDayConflict).toEqual({ existingSessionId: first.session!.id, date: '2026-09-27' });
    expect(await repo.getStrengthSessions()).toHaveLength(1);
    expect(await repo.getStrengthSets()).toHaveLength(5);

    db.close();
  });

  it('writes the same-day session when allowSameDay is passed', async () => {
    const { db, repo } = setup();
    await repo.saveAthleteConfig(DEFAULT_CONFIG);
    await ingestManualStrengthSession(repo, toRawStrengthSession(parseManualStrengthInput(VALID_JSON)));

    const edited = toRawStrengthSession(parseManualStrengthInput(SAME_DAY_DIFFERENT_CONTENT_JSON));
    const result = await ingestManualStrengthSession(repo, edited, { allowSameDay: true });
    expect(result.imported).toBe(true);
    expect(result.sameDayConflict).toBeUndefined();
    expect(await repo.getStrengthSessions()).toHaveLength(2);

    db.close();
  });

  it('writes a different-day session without any conflict', async () => {
    const { db, repo } = setup();
    await repo.saveAthleteConfig(DEFAULT_CONFIG);
    await ingestManualStrengthSession(repo, toRawStrengthSession(parseManualStrengthInput(VALID_JSON)));

    const differentDay = toRawStrengthSession(
      parseManualStrengthInput(JSON.stringify({ ...JSON.parse(VALID_JSON), date: '2026-09-28' })),
    );
    const result = await ingestManualStrengthSession(repo, differentDay);
    expect(result.imported).toBe(true);
    expect(result.sameDayConflict).toBeUndefined();
    expect(await repo.getStrengthSessions()).toHaveLength(2);

    db.close();
  });

  it('still dedupes exact-same content as "already imported" — that precedence beats the same-day guard', async () => {
    const { db, repo } = setup();
    await repo.saveAthleteConfig(DEFAULT_CONFIG);
    const first = await ingestManualStrengthSession(repo, toRawStrengthSession(parseManualStrengthInput(VALID_JSON)));

    const again = await ingestManualStrengthSession(repo, toRawStrengthSession(parseManualStrengthInput(VALID_JSON)));
    expect(again.alreadyImported).toBe(true);
    expect(again.sameDayConflict).toBeUndefined();
    expect(again.session?.id).toBe(first.session?.id);
    expect(await repo.getStrengthSessions()).toHaveLength(1);

    db.close();
  });

  it('dry-run reports the refusal instead of a would-write preview, and writes nothing', async () => {
    const { db, repo } = setup();
    await repo.saveAthleteConfig(DEFAULT_CONFIG);
    const first = await ingestManualStrengthSession(repo, toRawStrengthSession(parseManualStrengthInput(VALID_JSON)));

    const edited = toRawStrengthSession(parseManualStrengthInput(SAME_DAY_DIFFERENT_CONTENT_JSON));
    const dry = await ingestManualStrengthSession(repo, edited, { dryRun: true });
    expect(dry.imported).toBe(false);
    expect(dry.alreadyImported).toBe(false);
    expect(dry.sameDayConflict).toEqual({ existingSessionId: first.session!.id, date: '2026-09-27' });
    expect(await repo.getStrengthSessions()).toHaveLength(1);

    db.close();
  });
});
