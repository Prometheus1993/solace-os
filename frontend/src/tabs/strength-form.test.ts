import { describe, expect, it } from 'vitest';
import type { StrengthLogSession } from '@solace/core';
import {
  addExercise, addSet, canSubmit, emptyForm, exerciseNames, formFromSession, previewRows, removeExercise, removeSet,
  setExerciseName, setSetField, summarizeSets, toggleHold, toPayload, tonnage, type StrengthForm,
} from './strength-form.ts';

const session = (over: Partial<StrengthLogSession> = {}): StrengthLogSession => ({
  id: 1, date: '2026-10-06', notes: 'Push', exercises: [{ name: 'Bench Press', sets: [{ reps: 8, weightKg: 60 }, { reps: 8, weightKg: 60 }] }], ...over,
});
const form = (exercises: StrengthForm['exercises'], over: Partial<StrengthForm> = {}): StrengthForm => ({ date: '2026-10-20', notes: '', exercises, ...over });

describe('form helpers', () => {
  it('addSet duplicates the previous set', () => {
    let f = setExerciseName(emptyForm('2026-10-20'), 0, 'Bench Press');
    f = setSetField(setSetField(f, 0, 0, 'reps', '8'), 0, 0, 'kg', '60');
    f = addSet(f, 0);
    expect(f.exercises[0]!.sets).toEqual([{ reps: '8', kg: '60' }, { reps: '8', kg: '60' }]);
  });
  it('removeSet / removeExercise never leave an empty form', () => {
    expect(removeSet(emptyForm('d'), 0, 0).exercises[0]!.sets).toHaveLength(1);
    expect(removeExercise(emptyForm('d'), 0).exercises).toHaveLength(1);
    expect(removeExercise(addExercise(emptyForm('d')), 0).exercises).toHaveLength(1);
  });
  it('repeat uses today and empty notes; edit keeps both', () => {
    expect(formFromSession(session(), 'repeat', '2026-10-20')).toMatchObject({ date: '2026-10-20', notes: '' });
    expect(formFromSession(session(), 'edit', '2026-10-20')).toMatchObject({ date: '2026-10-06', notes: 'Push' });
    expect(formFromSession(session(), 'edit', 'x').exercises[0]!.sets[0]).toEqual({ reps: '8', kg: '60' });
  });
});

describe('toPayload', () => {
  it('trims, collapses whitespace, merges consecutive same-name blocks, accepts comma decimals and 0 kg', () => {
    const r = toPayload(form([
      { name: '  Bench   Press ', sets: [{ reps: '8', kg: '62,5' }] },
      { name: 'bench press', sets: [{ reps: '6', kg: '0' }] },
      { name: 'Row', sets: [{ reps: '10', kg: '40' }] },
    ], { notes: ' push ' }));
    expect(r).toEqual({ ok: true, payload: { date: '2026-10-20', notes: 'push', exercises: [
      { name: 'Bench Press', sets: [{ reps: 8, weightKg: 62.5 }, { reps: 6, weightKg: 0 }] },
      { name: 'Row', sets: [{ reps: 10, weightKg: 40 }] },
    ] } });
  });
  it('skips blank rows and blocks, rejects partial rows', () => {
    expect(toPayload(form([{ name: '', sets: [{ reps: '', kg: '' }] }, { name: 'Row', sets: [{ reps: '10', kg: '40' }, { reps: '', kg: '' }] }]))).toMatchObject({ ok: true });
    expect(toPayload(form([{ name: 'Row', sets: [{ reps: '10', kg: '' }] }]))).toMatchObject({ ok: false });
    expect(toPayload(form([{ name: 'Row', sets: [{ reps: '', kg: '40' }] }]))).toMatchObject({ ok: false });
    expect(toPayload(form([{ name: '', sets: [{ reps: '5', kg: '5' }] }]))).toMatchObject({ ok: false });
    expect(toPayload(form([{ name: 'Row', sets: [{ reps: '', kg: '' }] }]))).toMatchObject({ ok: false });
  });
  it('rejects empty, bad reps, out-of-range values', () => {
    expect(canSubmit(emptyForm('2026-10-20'))).toBe(false);
    expect(canSubmit(form([{ name: 'Row', sets: [{ reps: '0', kg: '40' }] }]))).toBe(false);
    expect(canSubmit(form([{ name: 'Row', sets: [{ reps: '2.5', kg: '40' }] }]))).toBe(false);
    expect(canSubmit(form([{ name: 'Row', sets: [{ reps: '5', kg: '501' }] }]))).toBe(false);
    expect(canSubmit(form([{ name: 'Row', sets: [{ reps: '101', kg: '40' }] }]))).toBe(false);
    expect(canSubmit(form([{ name: 'Row', sets: [{ reps: '5', kg: '40' }] }], { date: '' }))).toBe(false);
  });
});

describe('summaries', () => {
  it('summarizeSets collapses consecutive identical sets', () => {
    expect(summarizeSets([{ reps: 12, weightKg: 40 }, { reps: 12, weightKg: 40 }, { reps: 12, weightKg: 40 }, { reps: 9, weightKg: 40 }])).toBe('3×12 @ 40 kg · 1×9 @ 40 kg');
    expect(summarizeSets([{ reps: 10, weightKg: 0 }])).toBe('1×10 @ bodyweight');
  });
  it('exerciseNames is distinct, case-insensitive, newest first', () => {
    const s = [session({ id: 2, exercises: [{ name: 'Row', sets: [] }, { name: 'bench press', sets: [] }] }), session()];
    expect(exerciseNames(s)).toEqual(['Row', 'bench press']);
  });
});

describe('previewRows', () => {
  it('shows equipment and key-lift chips data', () => {
    const rows = previewRows(form([
      { name: 'Bench Press', sets: [{ reps: '8', kg: '60' }] },
      { name: 'Incline Bench Press', sets: [{ reps: '8', kg: '40' }] },
      { name: 'Incline Db Bench Press', sets: [{ reps: '8', kg: '30' }] },
      { name: 'Lat Pulldown', sets: [{ reps: '10', kg: '50' }] },
    ]), []);
    expect(rows.map((r) => [r.equipment, r.keyLift])).toEqual([['barbell', 'bench'], ['barbell', null], ['dumbbell', null], ['machine', null]]);
    expect(rows[0]!.tonnageKg).toBe(480);
  });
  it('warns when a set is over 1.5x the previous max, ignoring the session being edited', () => {
    const f = form([{ name: ' bench  press', sets: [{ reps: '5', kg: '91' }] }]);
    expect(previewRows(f, [session()])[0]!.jump).toEqual({ kg: 91, prevMaxKg: 60 });
    expect(previewRows(form([{ name: 'Bench Press', sets: [{ reps: '5', kg: '90' }] }]), [session()])[0]!.jump).toBeNull();
    expect(previewRows(f, [session()], 1)[0]!.jump).toBeNull();
    expect(previewRows(form([{ name: 'New Lift', sets: [{ reps: '5', kg: '300' }] }]), [session()])[0]!.jump).toBeNull();
  });
});

describe('hold sets (seconds)', () => {
  it('toggleHold flips a set between reps/kg and seconds, clearing the typed values', () => {
    let f = setSetField(setSetField(emptyForm('d'), 0, 0, 'reps', '8'), 0, 0, 'kg', '60');
    f = toggleHold(f, 0, 0);
    expect(f.exercises[0]!.sets[0]).toEqual({ reps: '', kg: '', secs: '' });
    expect(toggleHold(f, 0, 0).exercises[0]!.sets[0]).toEqual({ reps: '', kg: '' });
  });
  it('addSet copies a hold set as a hold set', () => {
    const f = addSet(setSetField(toggleHold(emptyForm('d'), 0, 0), 0, 0, 'secs', '60'), 0);
    expect(f.exercises[0]!.sets).toEqual([{ reps: '', kg: '', secs: '60' }, { reps: '', kg: '', secs: '60' }]);
  });
  it('toPayload emits { seconds } and mixes with rep sets; blank hold rows are skipped', () => {
    const r = toPayload(form([
      { name: 'Plank', sets: [{ reps: '', kg: '', secs: '60' }, { reps: '', kg: '', secs: '60' }, { reps: '', kg: '', secs: '' }] },
      { name: 'Row', sets: [{ reps: '10', kg: '40' }] },
    ]));
    expect(r).toEqual({ ok: true, payload: { date: '2026-10-20', exercises: [
      { name: 'Plank', sets: [{ seconds: 60 }, { seconds: 60 }] },
      { name: 'Row', sets: [{ reps: 10, weightKg: 40 }] },
    ] } });
  });
  it('rejects 0, over 3600, fractions and text seconds', () => {
    for (const secs of ['0', '3601', '1.5', 'abc']) expect(canSubmit(form([{ name: 'Plank', sets: [{ reps: '', kg: '', secs }] }])), secs).toBe(false);
    expect(canSubmit(form([{ name: 'Plank', sets: [{ reps: '', kg: '', secs: '3600' }] }]))).toBe(true);
  });
  it('summarizes as "3×60 s", tonnage ignores holds, formFromSession round-trips', () => {
    const sets = [{ seconds: 60 }, { seconds: 60 }, { seconds: 60 }, { reps: 5, weightKg: 20 }];
    expect(summarizeSets(sets)).toBe('3×60 s · 1×5 @ 20 kg');
    expect(tonnage(sets)).toBe(100);
    const f = formFromSession(session({ exercises: [{ name: 'Plank', sets: [{ seconds: 45 }] }] }), 'edit', 'x');
    expect(f.exercises[0]!.sets[0]).toEqual({ reps: '', kg: '', secs: '45' });
  });
  it('previewRows flags a hold-only exercise and does not feed the jump guard', () => {
    const rows = previewRows(form([{ name: 'Plank', sets: [{ reps: '', kg: '', secs: '60' }] }]), [session({ exercises: [{ name: 'Plank', sets: [{ seconds: 30 }] }] })]);
    expect(rows[0]).toMatchObject({ holdOnly: true, tonnageKg: 0, jump: null, keyLift: null });
  });
});
