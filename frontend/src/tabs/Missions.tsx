import { useState } from 'react';
import type { DashboardDTO } from '@solace/core';
import { C, cssVars, ddmm, fmtDate, tMinus, todayIso } from '../tokens.ts';
import { AccordionList, Card, Countdown, Field, InsetPanel, postJson, StatTile, TabShell, TileGrid } from './parts.tsx';

type Mission = DashboardDTO['missions'][number];
type Status = 'scheduled' | 'pending' | 'graded';

/** Belgian grade on the /20 scale; pass mark = 10. Green when passed (incl. a deliberated tolerance), red when failed. */
function GradeChip({ g, passed }: { g: number; passed: boolean }) {
  const col = passed ? C.ok : C.danger;
  return (
    <span title="grade /20" className="mis-grade-chip" style={cssVars({ '--chip-color': col })}>
      {g}/20
    </span>
  );
}
/** Credits (ECTS / studiepunten) — how much the course is worth. */
function CreditChip({ c }: { c: number }) {
  return (
    <span title="credits" className="mis-credit-chip">
      {c} cr
    </span>
  );
}
/** Resit countdown — shown for a course that failed and needs a resit. */
function ResitChip({ days }: { days: number | null }) {
  const txt = days == null ? 'RESIT' : days > 0 ? `RESIT T-${days}` : days === 0 ? 'RESIT TODAY' : `RESIT +${-days}`;
  return <span className="mis-resit-chip">{txt}</span>;
}
/** Academic-board tolerance (deliberated/tolerated) — a <10 grade the board still passed, so a
 * passing GradeChip below 10 doesn't read as a mistake. */
function DeliberatedChip() {
  return <span title="deliberated / tolerated" className="mis-delib-chip">DELIBERATED</span>;
}

function MissionRow({ m, selected, onClick }: { m: Mission; selected: boolean; onClick: () => void }) {
  const danger = m.needsResit || (m.status === 'scheduled' && m.overdue);
  const edge = m.passed ? C.ok : danger ? C.danger : m.status === 'pending' ? C.gold : C.muted3;
  const sub = m.needsResit && m.resitDate != null ? `${fmtDate(m.examDate)} → resit ${fmtDate(m.resitDate)}` : fmtDate(m.examDate);
  return (
    <div
      className={`ui-card-row mis-row${danger ? ' is-danger' : ''}${selected ? ' is-selected' : ''}`}
      onClick={onClick}
      style={cssVars({ '--row-edge': edge })}
    >
      <span className={`mis-row__dot${danger ? ' is-danger' : ''}${m.passed ? ' is-passed' : ''}`} />
      <div className="mis-row__main">
        <div className="mis-row__course-line">
          <span>{m.course}</span>
        </div>
        <div className="mis-row__sub">{sub}</div>
      </div>
      <div className="mis-row__chips">
        {m.credits != null && <CreditChip c={m.credits} />}
        {m.deliberated && <DeliberatedChip />}
        {m.finalGrade != null && <GradeChip g={m.finalGrade} passed={m.passed} />}
        {m.needsResit ? <ResitChip days={m.resitDaysUntil} /> : m.finalGrade != null ? null : <Countdown daysUntil={m.daysUntil} status={m.status} />}
      </div>
    </div>
  );
}

export function Missions({ dto, onReload }: { dto: DashboardDTO; onReload: () => void | Promise<void> }) {
  const missions = dto.missions;
  // RESITS — failed first attempt, derived. Sorted by the NEXT resit date (soonest first);
  // resits with no date scheduled yet sink to the bottom, then by course for a stable order.
  const resitSortKey = (m: Mission) => m.resitDate ?? '9999-99-99';
  const resits = missions
    .filter((m) => m.needsResit)
    .sort((a, b) => resitSortKey(a).localeCompare(resitSortKey(b)) || a.course.localeCompare(b.course));
  const pending = missions.filter((m) => !m.needsResit && !m.passed); // PENDING — sat/scheduled, awaiting a result
  const passedExams = missions.filter((m) => m.passed); // PASSED — ≥10
  const total = missions.length;
  const passedCount = passedExams.length;
  const ya = dto.lifeSimSummary.yearAverage; // grade-of-merit average (credit-weighted over passed)
  const rw = dto.lifeSimSummary.resitWindow;
  const resitsNeeded = dto.lifeSimSummary.resitsNeeded;
  const soon = rw?.firstDays != null && rw.firstDays <= 3;

  const [editId, setEditId] = useState<number | null>(null);
  // Inline-accordion editing: `adding` opens the form atop the PENDING list; `openList` scopes the shared
  // `editId` so the editor opens under the clicked row in exactly ONE of the three lists.
  const [adding, setAdding] = useState(false);
  const [openList, setOpenList] = useState<'resits' | 'pending' | 'passed' | null>(null);
  // PASSED is pure history (3.3) — collapsed by default behind a "▸ History" toggle at the bottom.
  const [showHistory, setShowHistory] = useState(false);
  const [course, setCourse] = useState('');
  const [date, setDate] = useState(todayIso());
  const [status, setStatus] = useState<Status>('scheduled');
  const [grade, setGrade] = useState('');
  const [credits, setCredits] = useState('');
  const [resitDate, setResitDate] = useState('');
  const [resitGrade, setResitGrade] = useState('');
  const [deliberated, setDeliberated] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setEditId(null);
    setAdding(false);
    setOpenList(null);
    setCourse('');
    setDate(todayIso());
    setStatus('scheduled');
    setGrade('');
    setCredits('');
    setResitDate('');
    setResitGrade('');
    setDeliberated(false);
  };
  const startAdd = () => {
    if (adding) reset();
    else {
      reset();
      setAdding(true);
    }
  };
  const toggleEdit = (list: 'resits' | 'pending' | 'passed', m: Mission) => {
    if (openList === list && editId === m.id) reset();
    else {
      setAdding(false);
      setOpenList(list);
      loadFor(m);
    }
  };
  const loadFor = (m: Mission) => {
    setEditId(m.id);
    setCourse(m.course);
    setDate(m.examDate);
    setStatus(m.status);
    setGrade(m.grade != null ? String(m.grade) : '');
    setCredits(m.credits != null ? String(m.credits) : '');
    setResitDate(m.resitDate ?? '');
    setResitGrade(m.resitGrade != null ? String(m.resitGrade) : '');
    setDeliberated(m.deliberated);
    setMsg('');
  };

  async function submit() {
    setBusy(true);
    setMsg('');
    const numOrNull = (s: string) => (s ? Number(s) : null);
    // A first grade means the exam is graded; without one, 'graded' is incoherent → fall back to
    // 'pending' (sat, awaiting) so a graded row always has a grade and never renders blank.
    const effStatus: Status = grade !== '' ? 'graded' : status === 'graded' ? 'pending' : status;
    const optional = { grade: numOrNull(grade), credits: numOrNull(credits), resitDate: resitDate || null, resitGrade: numOrNull(resitGrade), deliberated };
    const full = { course, examDate: date, status: effStatus, ...optional };
    // On edit, send the optional fields EXPLICITLY (even null) so blanking actually clears them;
    // the generic null-strip only guards the always-present required fields from being clobbered.
    const body =
      editId != null ? { ...Object.fromEntries(Object.entries({ course, examDate: date, status: effStatus }).filter(([, v]) => v != null)), ...optional } : full;
    const m = await postJson(editId != null ? `/api/exams?id=${editId}` : '/api/exams', editId != null ? 'PATCH' : 'POST', body);
    setBusy(false);
    if (m === '') {
      setMsg(editId != null ? 'Updated ✓' : 'Logged ✓');
      reset();
      await onReload();
    } else setMsg(m);
  }
  async function del() {
    if (editId == null) return;
    setBusy(true);
    const m = await postJson(`/api/exams?id=${editId}`, 'DELETE');
    setBusy(false);
    if (m === '') {
      reset();
      setMsg('Deleted ✓');
      await onReload();
    } else setMsg(m);
  }
  const canSubmit = course.trim() !== '' && /^\d{4}-\d{2}-\d{2}$/.test(date);
  const failedFirst = grade !== '' && Number(grade) < 10; // → resit fields appear

  // The log/edit form body — rendered inline under the editing row (in whichever list) OR at the top of the
  // PENDING list when adding, so updating an exam never scrolls down to a form. Branches log-vs-edit on editId.
  const renderForm = () => (
    <>
      {/* Course = the headline (full width); the rest in a tidy grid; actions on their own bar. */}
      <div className="mis-form-grid">
        <div className="mis-form-course">
          <Field label="Course"><input className="parts-input" value={course} onChange={(e) => setCourse(e.target.value)} placeholder="e.g. Analysis I" /></Field>
        </div>
        <Field label="Date"><input className="parts-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Grade /20">
          <input className="parts-input" type="number" inputMode="decimal" min={0} max={20} step={0.5} value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="e.g. 15" />
        </Field>
        <Field label="Credits">
          <input className="parts-input" type="number" inputMode="numeric" min={0} step={1} value={credits} onChange={(e) => setCredits(e.target.value)} placeholder="e.g. 6" />
        </Field>
        <Field label="Status">
          <select className="parts-input" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
            <option value="scheduled">Scheduled</option>
            <option value="pending">Pending (sat, awaiting)</option>
            <option value="graded">Graded</option>
          </select>
        </Field>
        <Field label="Deliberated">
          <button type="button" onClick={() => setDeliberated((v) => !v)} className="mis-delib-toggle">
            <span className={`mis-delib-check${deliberated ? ' is-checked' : ''}`}>{deliberated ? '✓' : ''}</span>
            <span className="mis-delib-toggle-label">Deliberated</span>
          </button>
        </Field>
        {failedFirst && (
          <>
            <Field label="Resit date">
              <input className="parts-input" type="date" value={resitDate} onChange={(e) => setResitDate(e.target.value)} />
            </Field>
            <Field label="Resit grade /20">
              <input className="parts-input" type="number" inputMode="decimal" min={0} max={20} step={0.5} value={resitGrade} onChange={(e) => setResitGrade(e.target.value)} placeholder="e.g. 12" />
            </Field>
          </>
        )}
      </div>
      <div className="mis-form-actions">
        <button className="parts-button" disabled={busy || !canSubmit} onClick={() => void submit()}>
          {editId != null ? 'Update exam' : 'Log exam'}
        </button>
        {editId != null && (
          <button className="parts-button mis-btn-danger" onClick={() => void del()}>
            Delete
          </button>
        )}
        <button className="parts-button mis-btn-muted" onClick={reset}>
          Cancel
        </button>
        {msg && <span className={`mis-form-msg${msg.startsWith('⚠') ? ' is-error' : ''}`}>{msg}</span>}
      </div>
    </>
  );

  return (
    <TabShell>
      {ya && (
        <Card title="▮ GRADE OF MERIT">
          <div className="mis-grade-row">
            <span className="mis-grade-value">
              {ya.average.toFixed(2)}
              <span className="mis-grade-unit">/20</span>
            </span>
            <span className={`mis-grade-band${ya.band.key === 'pass' ? '' : ' is-distinction'}`}>
              {ya.band.label}
            </span>
          </div>
          <div className="mis-grade-note">
            {ya.toNext ? `${ya.toNext.gap.toFixed(2)} to ${ya.toNext.label} (≥${ya.toNext.min})` : 'Highest distinction'}
            {` · ${ya.passedCount} passed, ${ya.creditsCounted} sp`}
            {resitsNeeded > 0 ? ` · ${resitsNeeded} resit${resitsNeeded === 1 ? '' : 's'} pending` : ''}
          </div>
        </Card>
      )}
      <TileGrid>
        <StatTile label="Resits" value={String(resitsNeeded)} sub="to resit" color={resitsNeeded > 0 ? C.danger : undefined} />
        <StatTile label="Next resit" value={rw ? tMinus(rw.firstDays) : '—'} sub={rw ? 'days to first' : 'none dated'} color={soon ? C.danger : undefined} />
        <StatTile label="Resit window" value={rw ? `${ddmm(rw.start)}–${ddmm(rw.end)}` : '—'} sub={rw ? 'resit period' : 'no dates yet'} />
        <StatTile label="Cleared" value={`${passedCount}/${total}`} sub="passed (≥10)" />
      </TileGrid>

      <Card title="▮ RESITS NEEDED">
        {rw && (
          <div className="mis-resit-window">
            <span className={`mis-window-dates${soon ? ' is-soon' : ''}`}>
              {fmtDate(rw.start)} – {fmtDate(rw.end)}
            </span>
            {rw.firstDays != null && (
              <span className="mis-window-hint">
                · first in {tMinus(rw.firstDays)}
                {rw.firstDays > 0 ? ` day${rw.firstDays === 1 ? '' : 's'}` : ''}
              </span>
            )}
          </div>
        )}
        <AccordionList
          items={resits}
          editingId={openList === 'resits' ? editId : null}
          renderRow={(m) => <MissionRow m={m} selected={openList === 'resits' && editId === m.id} onClick={() => toggleEdit('resits', m)} />}
          renderEditor={() => renderForm()}
          empty="No resits — nothing failed yet."
        />
      </Card>

      <Card
        title="▮ PENDING"
        headerRight={
          <button className="parts-button mis-btn-sm" onClick={startAdd}>{adding ? '✕ Close' : '＋ Add'}</button>
        }
      >
        {adding && (
          <div className="mis-add-panel">
            <InsetPanel>{renderForm()}</InsetPanel>
          </div>
        )}
        <AccordionList
          items={pending}
          editingId={openList === 'pending' ? editId : null}
          renderRow={(m) => <MissionRow m={m} selected={openList === 'pending' && editId === m.id} onClick={() => toggleEdit('pending', m)} />}
          renderEditor={() => renderForm()}
          empty="Nothing awaiting a result."
        />
      </Card>

      <Card title="▮ PASSED">
        <button
          className="parts-button mis-btn-sm"
          onClick={() => setShowHistory((v) => !v)}
          aria-expanded={showHistory}
        >
          {showHistory ? '▾ Hide' : `▸ History (${passedCount})`}
        </button>
        {showHistory && (
          <div className="mis-history-panel">
            <AccordionList
              items={passedExams}
              editingId={openList === 'passed' ? editId : null}
              renderRow={(m) => <MissionRow m={m} selected={openList === 'passed' && editId === m.id} onClick={() => toggleEdit('passed', m)} />}
              renderEditor={() => renderForm()}
              empty="No passed exams yet."
            />
          </div>
        )}
      </Card>
    </TabShell>
  );
}
