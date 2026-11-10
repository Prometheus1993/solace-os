// Pure logic behind the STRENGTH-tab session form (StrengthLog.tsx). Form state is kept as
// strings (what the inputs hold); `toPayload` is the only place they become numbers.
import type { Equipment, StrengthLogSession } from '@solace/core';
import { classifyEquipmentFromName } from '@solace/core/conventions';
import { keyLiftOf, type KeyLiftId } from '@solace/core/gamification';

/** A rep set (reps + kg), or a hold set when `secs` is present (seconds instead of reps/kg). */
export interface FormSet {
  reps: string;
  kg: string;
  secs?: string;
}
export interface FormExercise {
  name: string;
  sets: FormSet[];
}
export interface StrengthForm {
  date: string;
  notes: string;
  exercises: FormExercise[];
}
export interface StrengthPayload {
  date: string;
  notes?: string;
  exercises: { name: string; sets: PayloadSet[] }[];
}
type LoadSet = { reps: number; weightKg: number };
type PayloadSet = LoadSet | { seconds: number };
const isHold = (s: PayloadSet): s is { seconds: number } => 'seconds' in s;
export type PayloadResult = { ok: true; payload: StrengthPayload } | { ok: false; error: string };

export const MAX_KG = 500;
export const MAX_REPS = 100;
export const MAX_SECONDS = 3600;
/** A set heavier than this multiple of the previous max for the same exercise gets a warning. */
export const JUMP_FACTOR = 1.5;

const blankSet = (): FormSet => ({ reps: '', kg: '' });
const blankExercise = (): FormExercise => ({ name: '', sets: [blankSet()] });

export const normalizeName = (name: string): string => name.trim().replace(/\s+/g, ' ');
const nameKey = (name: string): string => normalizeName(name).toLowerCase();

export const emptyForm = (date: string): StrengthForm => ({ date, notes: '', exercises: [blankExercise()] });

/** Duplicates the previous set (same reps and kg) right after set `si`. */
export function addSet(form: StrengthForm, ei: number, si?: number): StrengthForm {
  return {
    ...form,
    exercises: form.exercises.map((ex, i) => {
      if (i !== ei) return ex;
      const at = si ?? ex.sets.length - 1;
      const copy = at >= 0 ? { ...ex.sets[at]! } : blankSet();
      return { ...ex, sets: [...ex.sets.slice(0, at + 1), copy, ...ex.sets.slice(at + 1)] };
    }),
  };
}

export const addExercise = (form: StrengthForm): StrengthForm => ({ ...form, exercises: [...form.exercises, blankExercise()] });

export function removeSet(form: StrengthForm, ei: number, si: number): StrengthForm {
  return {
    ...form,
    exercises: form.exercises.map((ex, i) => {
      if (i !== ei) return ex;
      const sets = ex.sets.filter((_, j) => j !== si);
      return { ...ex, sets: sets.length ? sets : [blankSet()] };
    }),
  };
}

export function removeExercise(form: StrengthForm, ei: number): StrengthForm {
  const exercises = form.exercises.filter((_, i) => i !== ei);
  return { ...form, exercises: exercises.length ? exercises : [blankExercise()] };
}

export function setExerciseName(form: StrengthForm, ei: number, name: string): StrengthForm {
  return { ...form, exercises: form.exercises.map((ex, i) => (i === ei ? { ...ex, name } : ex)) };
}

export function setSetField(form: StrengthForm, ei: number, si: number, field: keyof FormSet, value: string): StrengthForm {
  return {
    ...form,
    exercises: form.exercises.map((ex, i) => (i === ei ? { ...ex, sets: ex.sets.map((s, j) => (j === si ? { ...s, [field]: value } : s)) } : ex)),
  };
}

/** Switches set `si` between reps/kg and seconds; the other kind's fields are cleared. */
export function toggleHold(form: StrengthForm, ei: number, si: number): StrengthForm {
  return {
    ...form,
    exercises: form.exercises.map((ex, i) =>
      i === ei ? { ...ex, sets: ex.sets.map((s, j) => (j === si ? (s.secs === undefined ? { reps: '', kg: '', secs: '' } : { reps: '', kg: '' }) : s)) } : ex,
    ),
  };
}

/** Repeat -> a fresh form for `today` with the same exercises; edit -> the session as stored. */
export function formFromSession(s: StrengthLogSession, mode: 'repeat' | 'edit', today: string): StrengthForm {
  return {
    date: mode === 'repeat' ? today : s.date,
    notes: mode === 'repeat' ? '' : (s.notes ?? ''),
    exercises: s.exercises.map((ex) => ({ name: ex.name, sets: ex.sets.map((st) => ('seconds' in st ? { reps: '', kg: '', secs: String(st.seconds) } : { reps: String(st.reps), kg: String(st.weightKg) })) })),
  };
}

const isBlank = (s: FormSet): boolean => (s.secs !== undefined ? s.secs.trim() === '' : s.reps.trim() === '' && s.kg.trim() === '');

/** kg is explicit (0 = bodyweight) and may use a comma decimal. */
const parseKg = (raw: string): number | null => {
  const t = raw.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
};
const parseReps = (raw: string): number | null => {
  const t = raw.trim();
  return /^\d+$/.test(t) ? Number(t) : null;
};

export function toPayload(form: StrengthForm): PayloadResult {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) return { ok: false, error: 'Pick a date.' };
  const exercises: StrengthPayload['exercises'] = [];
  for (const [ei, ex] of form.exercises.entries()) {
    const name = normalizeName(ex.name);
    const rows = ex.sets.filter((s) => !isBlank(s));
    if (name === '' && rows.length === 0) continue;
    if (name === '') return { ok: false, error: `Exercise ${ei + 1} needs a name.` };
    if (rows.length === 0) return { ok: false, error: `${name} needs at least one set.` };
    const sets: PayloadSet[] = [];
    for (const r of rows) {
      if (r.secs !== undefined) {
        const secs = parseReps(r.secs);
        if (secs == null || secs < 1 || secs > MAX_SECONDS) return { ok: false, error: `${name}: every hold needs whole seconds (1 to ${MAX_SECONDS}).` };
        sets.push({ seconds: secs });
        continue;
      }
      const reps = parseReps(r.reps);
      const kg = parseKg(r.kg);
      if (reps == null || reps < 1) return { ok: false, error: `${name}: every set needs whole reps (1 or more).` };
      if (kg == null) return { ok: false, error: `${name}: every set needs a kg (0 = bodyweight).` };
      if (reps > MAX_REPS) return { ok: false, error: `${name}: reps over ${MAX_REPS}.` };
      if (kg > MAX_KG) return { ok: false, error: `${name}: weight over ${MAX_KG} kg.` };
      sets.push({ reps, weightKg: kg });
    }
    const prev = exercises.at(-1);
    if (prev && nameKey(prev.name) === nameKey(name)) prev.sets.push(...sets);
    else exercises.push({ name, sets });
  }
  if (exercises.length === 0) return { ok: false, error: 'Add at least one exercise with a set.' };
  const notes = form.notes.trim();
  return { ok: true, payload: { date: form.date, ...(notes ? { notes } : {}), exercises } };
}

export const canSubmit = (form: StrengthForm): boolean => toPayload(form).ok;

const fmtKg = (kg: number): string => `${Math.round(kg * 100) / 100}`;

/** Hold sets carry no load, so they add nothing. */
export const tonnage = (sets: PayloadSet[]): number => sets.reduce((t, s) => (isHold(s) ? t : t + s.reps * s.weightKg), 0);

/** "3×12 @ 40 kg · 1×9 @ 40 kg" or "3×60 s": consecutive identical sets collapse. */
export function summarizeSets(sets: PayloadSet[]): string {
  const groups: { label: string; n: number }[] = [];
  for (const s of sets) {
    const label = isHold(s) ? `${s.seconds} s` : `${s.reps} @ ${s.weightKg === 0 ? 'bodyweight' : `${fmtKg(s.weightKg)} kg`}`;
    const g = groups.at(-1);
    if (g && g.label === label) g.n += 1;
    else groups.push({ label, n: 1 });
  }
  return groups.map((g) => `${g.n}×${g.label}`).join(' · ');
}

export function sessionTotals(s: StrengthLogSession): { exercises: number; sets: number; tonnageKg: number } {
  const all = s.exercises.flatMap((e) => e.sets);
  return { exercises: s.exercises.length, sets: all.length, tonnageKg: Math.round(tonnage(all)) };
}

/** Distinct exercise names across the sessions (newest first), for the name datalist. */
export function exerciseNames(sessions: StrengthLogSession[]): string[] {
  const seen = new Map<string, string>();
  for (const s of sessions) for (const e of s.exercises) if (!seen.has(nameKey(e.name))) seen.set(nameKey(e.name), normalizeName(e.name));
  return [...seen.values()];
}

export interface PreviewRow {
  name: string;
  equipment: Equipment;
  keyLift: KeyLiftId | null;
  tonnageKg: number;
  /** Every typed set is a hold (seconds): not scored, no tonnage. */
  holdOnly: boolean;
  /** Set when a set's kg is more than JUMP_FACTOR x the previous max for this exercise. */
  jump: { kg: number; prevMaxKg: number } | null;
}

/** Live per-exercise preview: the equipment/key-lift the server funnel will pick, tonnage, and a typo guard. */
export function previewRows(form: StrengthForm, sessions: StrengthLogSession[], editingId?: number): PreviewRow[] {
  const prevMax = new Map<string, number>();
  for (const s of sessions) {
    if (s.id === editingId) continue;
    for (const e of s.exercises) for (const st of e.sets) if (!isHold(st)) prevMax.set(nameKey(e.name), Math.max(prevMax.get(nameKey(e.name)) ?? 0, st.weightKg));
  }
  const rows: PreviewRow[] = [];
  for (const ex of form.exercises) {
    const name = normalizeName(ex.name);
    if (name === '') continue;
    const typed = ex.sets.filter((s) => !isBlank(s));
    const sets = ex.sets.flatMap((s): LoadSet[] => {
      if (s.secs !== undefined) return [];
      const reps = parseReps(s.reps);
      const kg = parseKg(s.kg);
      return reps != null && kg != null ? [{ reps, weightKg: kg }] : [];
    });
    const equipment = classifyEquipmentFromName(name);
    const prev = prevMax.get(nameKey(name)) ?? 0;
    const top = sets.reduce((m, s) => Math.max(m, s.weightKg), 0);
    rows.push({
      name,
      equipment,
      keyLift: keyLiftOf({ exerciseName: name, equipment }),
      tonnageKg: Math.round(tonnage(sets)),
      holdOnly: typed.length > 0 && typed.every((s) => s.secs !== undefined),
      jump: prev > 0 && top > prev * JUMP_FACTOR ? { kg: top, prevMaxKg: prev } : null,
    });
  }
  return rows;
}
