import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { DashboardDTO, StrengthLogList, StrengthLogResult, StrengthLogSession } from '@solace/core';
import { fmtNum, todayIso } from '../tokens.ts';
import { AccordionList, Card, Field, getJson, postJson, postJsonFull } from './parts.tsx';
import {
  addExercise, addSet, canSubmit, emptyForm, exerciseNames, formFromSession, previewRows, removeExercise, removeSet,
  sessionTotals, setExerciseName, setSetField, summarizeSets, toggleHold, toPayload, tonnage, type StrengthForm,
} from './strength-form.ts';

const KEY_LIFT_LABEL = { bench: 'key lift: bench', squat: 'key lift: squat', sumoDeadlift: 'key lift: sumo deadlift' } as const;
const API = '/api/strength';
const fmtDate = (iso: string): string => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

type SaveResponse = StrengthLogResult | { ok?: false; error: string } | null;

/** The session form, shared by "Log a session" (POST) and the inline editor (PATCH ?id=). */
function SessionForm({
  initial, sessions, editingId, levelBefore, submitLabel, onSaved, onCancel,
}: {
  initial: StrengthForm;
  sessions: StrengthLogSession[];
  editingId?: number;
  levelBefore: number;
  submitLabel: string;
  onSaved: (flash: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<StrengthForm>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [sameDay, setSameDay] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<string | null>(null);
  const listId = useId();

  useEffect(() => {
    if (pendingFocus.current == null) return;
    root.current?.querySelector<HTMLInputElement>(`[data-f="${pendingFocus.current}"]`)?.focus();
    pendingFocus.current = null;
  });

  const edit = (next: StrengthForm) => {
    setForm(next);
    setSameDay(false);
    setMsg('');
  };

  const onNameKey = (e: KeyboardEvent, ei: number) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    pendingFocus.current = `${ei}-0-reps`;
    setForm((f) => ({ ...f }));
  };
  const onKgKey = (e: KeyboardEvent, ei: number, si: number) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const sets = form.exercises[ei]!.sets;
    const last = si === sets.length - 1;
    pendingFocus.current = `${ei}-${si + 1}-${(sets[si + 1] ?? sets[si]!).secs !== undefined ? 'secs' : 'reps'}`;
    if (last) edit(addSet(form, ei, si));
    else setForm((f) => ({ ...f }));
  };

  const save = async (allowSameDay: boolean) => {
    const p = toPayload(form);
    if (!p.ok) return setMsg(`⚠ ${p.error}`);
    setBusy(true);
    setMsg('');
    const res = await postJsonFull<NonNullable<SaveResponse>>(editingId != null ? `${API}?id=${editingId}` : API, { ...p.payload, ...(allowSameDay ? { allowSameDay: true } : {}) }, editingId != null ? 'PATCH' : 'POST');
    setBusy(false);
    if (res == null) return setMsg("⚠ Can't reach /api/strength — (re)start npm run server");
    if ('error' in res && res.error === 'same_day') return setSameDay(true);
    if (!('ok' in res) || res.ok !== true) return setMsg(`⚠ ${'error' in res ? res.error : 'Save failed'}`);
    if (res.status === 'already_logged') return onSaved('Already logged — nothing changed.');
    const all = p.payload.exercises.flatMap((e) => e.sets);
    const lv = res.strength ? ` · STRENGTH LV ${levelBefore} → ${res.strength.level}` : '';
    await onSaved(`Saved ✓ ${all.length} sets · ${fmtNum(Math.round(tonnage(all)))} kg${lv}`);
  };

  const preview = previewRows(form, sessions, editingId);
  const names = exerciseNames(sessions);

  return (
    <div ref={root} className="str-log-form">
      <div className="str-log-head">
        <Field label="Date">
          <input className="parts-input" type="date" max={todayIso()} value={form.date} onChange={(e) => edit({ ...form, date: e.target.value })} />
        </Field>
        <Field label="Notes">
          <input className="parts-input" value={form.notes} onChange={(e) => edit({ ...form, notes: e.target.value })} placeholder="optional" />
        </Field>
      </div>
      <div className="str-log-hint">kg = TOTAL (bar + plates / both dumbbells), machines as shown, 0 = bodyweight</div>
      <datalist id={listId}>
        {names.map((n) => <option key={n} value={n} />)}
      </datalist>

      {form.exercises.map((ex, ei) => {
        const pv = preview.find((r) => r.name.toLowerCase() === ex.name.trim().replace(/\s+/g, ' ').toLowerCase());
        return (
          <div key={ei} className="str-log-block">
            <div className="str-log-block__top">
              <input className="parts-input" list={listId} data-f={`${ei}-name`} value={ex.name} placeholder="Exercise" onChange={(e) => edit(setExerciseName(form, ei, e.target.value))} onKeyDown={(e) => onNameKey(e, ei)} />
              <button type="button" className="parts-button str-log-x" title="Remove exercise" onClick={() => edit(removeExercise(form, ei))}>×</button>
            </div>
            {ex.sets.map((s, si) => (
              <div key={si} className="str-log-set">
                <span className="str-log-set__n">{si + 1}</span>
                {s.secs !== undefined ? (
                  <input className="parts-input str-log-set__secs" data-f={`${ei}-${si}-secs`} inputMode="numeric" placeholder="seconds" value={s.secs} onChange={(e) => edit(setSetField(form, ei, si, 'secs', e.target.value))} onKeyDown={(e) => onKgKey(e, ei, si)} />
                ) : (
                  <>
                    <input className="parts-input" data-f={`${ei}-${si}-reps`} inputMode="numeric" placeholder="reps" value={s.reps} onChange={(e) => edit(setSetField(form, ei, si, 'reps', e.target.value))} />
                    <input className="parts-input" data-f={`${ei}-${si}-kg`} inputMode="decimal" placeholder="kg" value={s.kg} onChange={(e) => edit(setSetField(form, ei, si, 'kg', e.target.value))} onKeyDown={(e) => onKgKey(e, ei, si)} />
                  </>
                )}
                <button type="button" className={`parts-button str-log-x${s.secs !== undefined ? ' is-on' : ''}`} title="Hold: seconds instead of reps and kg (plank, hang)" onClick={() => edit(toggleHold(form, ei, si))}>s</button>
                <button type="button" className="parts-button str-log-x" title="Remove set" onClick={() => edit(removeSet(form, ei, si))}>×</button>
              </div>
            ))}
            <div className="str-log-block__foot">
              <button type="button" className="parts-button" onClick={() => edit(addSet(form, ei))}>+ set</button>
              {pv && (
                <span className="str-log-chips">
                  <span className="str-log-chip">{pv.equipment}</span>
                  <span className="str-log-chip">{pv.holdOnly ? 'hold · not scored' : pv.keyLift ? KEY_LIFT_LABEL[pv.keyLift] : 'volume only'}</span>
                  {!pv.holdOnly && <span className="str-log-chip">{fmtNum(pv.tonnageKg)} kg</span>}
                  {pv.jump && <span className="str-log-chip is-warn">⚠ {pv.jump.kg} kg is over 1.5× your previous max ({pv.jump.prevMaxKg} kg) — typo?</span>}
                </span>
              )}
            </div>
          </div>
        );
      })}

      <div className="str-log-actions">
        <button type="button" className="parts-button" onClick={() => edit(addExercise(form))}>+ exercise</button>
        <button type="button" className="parts-button" disabled={busy || !canSubmit(form)} onClick={() => void save(false)}>{busy ? 'Saving…' : submitLabel}</button>
        {onCancel && <button type="button" className="parts-button" onClick={onCancel}>Cancel</button>}
      </div>
      {sameDay && (
        <div className="str-log-confirm">
          A session is already logged on {fmtDate(form.date)}.
          <button type="button" className="parts-button" disabled={busy} onClick={() => void save(true)}>Log as 2nd session that day</button>
          <button type="button" className="parts-button" onClick={() => setSameDay(false)}>Cancel</button>
        </div>
      )}
      {msg && <div className={`str-log-msg${msg.startsWith('⚠') ? ' is-error' : ''}`}>{msg}</div>}
    </div>
  );
}

/** COMBAT → STRENGTH: log a session in-app, plus the logged list. */
export function StrengthLog({ dto, onReload }: { dto: DashboardDTO; onReload: () => void | Promise<void> }) {
  // undefined = loading, null = failed, array = loaded.
  const [sessions, setSessions] = useState<StrengthLogSession[] | null | undefined>(undefined);
  const [flash, setFlash] = useState('');
  const [formKey, setFormKey] = useState(0);
  const [seed, setSeed] = useState<StrengthForm>(() => emptyForm(todayIso()));
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [rowMsg, setRowMsg] = useState('');
  const top = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const r = await getJson<StrengthLogList>(API);
    setSessions(r ? r.sessions : null);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const level = dto.stats.strength.level;
  const afterWrite = async () => {
    await refresh();
    await onReload();
  };
  const loaded = sessions ?? [];

  return (
    <>
      <div ref={top}>
        <Card title="◆ Log a session">
          <SessionForm
            key={formKey}
            initial={seed}
            sessions={loaded}
            levelBefore={level}
            submitLabel="Save session"
            onSaved={async (f) => {
              setFlash(f);
              setSeed(emptyForm(todayIso()));
              setFormKey((k) => k + 1);
              await afterWrite();
            }}
          />
          {flash && <div className="str-log-msg">{flash}</div>}
        </Card>
      </div>

      <Card title="◆ Logged sessions">
        {sessions === undefined ? null : sessions === null ? (
          <div className="str-log-msg is-error">Can't reach /api/strength — (re)start <code>npm run server</code></div>
        ) : (
          <div className="str-log-list">
            <AccordionList
              items={sessions}
              editingId={editingId}
              empty="No sessions logged yet."
              renderRow={(s) => {
                const t = sessionTotals(s);
                return (
                  <div className="str-log-row">
                    <div className="str-log-row__line">
                      <span className="str-log-row__date">{fmtDate(s.date)}</span>
                      {s.notes && <span className="str-log-row__notes">{s.notes}</span>}
                      <span className="str-log-row__meta">{t.exercises} exercises · {t.sets} sets · {fmtNum(t.tonnageKg)} kg</span>
                      <span className="str-log-row__btns">
                        <button type="button" className="parts-button" onClick={() => {
                          setSeed(formFromSession(s, 'repeat', todayIso()));
                          setFormKey((k) => k + 1);
                          setFlash('');
                          top.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
                        }}>Repeat</button>
                        <button type="button" className="parts-button" onClick={() => { setDeleteId(null); setRowMsg(''); setEditingId(editingId === s.id ? null : s.id); }}>Edit</button>
                        <button type="button" className="parts-button" onClick={() => { setEditingId(null); setRowMsg(''); setDeleteId(s.id); }}>Delete</button>
                      </span>
                    </div>
                    <div className="str-log-row__sets">
                      {s.exercises.map((e, i) => <div key={i}>{e.name} {summarizeSets(e.sets)}</div>)}
                    </div>
                    {deleteId === s.id && (
                      <div className="str-log-confirm">
                        Delete the {fmtDate(s.date)} session? This cannot be undone.
                        <button type="button" className="parts-button" onClick={async () => {
                          const err = await postJson(`${API}?id=${s.id}`, 'DELETE');
                          if (err) return setRowMsg(err);
                          setDeleteId(null);
                          setFlash(`Deleted the ${fmtDate(s.date)} session.`);
                          await afterWrite();
                        }}>Yes, delete</button>
                        <button type="button" className="parts-button" onClick={() => setDeleteId(null)}>Cancel</button>
                      </div>
                    )}
                    {rowMsg && (deleteId === s.id) && <div className="str-log-msg is-error">{rowMsg}</div>}
                  </div>
                );
              }}
              renderEditor={(s) => (
                <SessionForm
                  initial={formFromSession(s, 'edit', todayIso())}
                  sessions={loaded}
                  editingId={s.id}
                  levelBefore={level}
                  submitLabel="Save changes"
                  onCancel={() => setEditingId(null)}
                  onSaved={async (f) => {
                    setEditingId(null);
                    setFlash(f);
                    await afterWrite();
                  }}
                />
              )}
            />
          </div>
        )}
      </Card>
    </>
  );
}
