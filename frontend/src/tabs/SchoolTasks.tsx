import { useState } from 'react';
import type { MouseEvent } from 'react';
import type { DashboardDTO } from '@solace/core';
import { C, cssVars, fmtDate, tMinus, todayIso } from '../tokens.ts';
import { AccordionList, Card, Countdown, Field, InsetPanel, postJson, StatTile, TabShell, TileGrid } from './parts.tsx';

type Task = DashboardDTO['schoolTasks'][number];
type Kind = Task['kind'];
const KIND_LABELS: Record<Kind, string> = { task: 'Task', company_visit: 'Company visit', other: 'Other' };
const KINDS = Object.keys(KIND_LABELS) as Kind[];

function KindChip({ kind }: { kind: Kind }) {
  return <span className="st-kind-chip">{KIND_LABELS[kind].toUpperCase()}</span>;
}

function TaskRow({ t, selected, busy, onClick, onToggle }: { t: Task; selected: boolean; busy: boolean; onClick: () => void; onToggle: () => void }) {
  const edge = t.done ? C.ok : t.overdue ? C.danger : C.muted3;
  const sub = [t.course, t.done && t.doneDate ? `done ${fmtDate(t.doneDate)}` : fmtDate(t.deadline)].filter(Boolean).join(' · ');
  return (
    <div
      className={`ui-card-row mis-row${t.overdue ? ' is-danger' : ''}${selected ? ' is-selected' : ''}`}
      onClick={onClick}
      style={cssVars({ '--row-edge': edge })}
    >
      <span className={`mis-row__dot${t.overdue ? ' is-danger' : ''}${t.done ? ' is-passed' : ''}`} />
      <div className="mis-row__main" role="button" tabIndex={0} aria-label={`Open task: ${t.title}`} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}>
        <div className="mis-row__course-line">
          <span>{t.title}</span>
        </div>
        <div className="mis-row__sub">{sub}</div>
      </div>
      <div className="mis-row__chips">
        <KindChip kind={t.kind} />
        {!t.done && <Countdown daysUntil={t.daysUntil} />}
        <button
          className="parts-button mis-btn-sm"
          disabled={busy}
          onClick={(e: MouseEvent<HTMLButtonElement>) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          {t.done ? '↺ reopen' : '✓ done'}
        </button>
      </div>
    </div>
  );
}

/** SCHOOL TERM — school tasks & deadlines (assignments, company visits). Open list sorted by deadline
 *  (the DTO already orders it), done items collapsed behind "History"; rows edit INLINE (accordion). */
export function SchoolTasks({ dto, onReload, compact = false, courseFilter }: { dto: DashboardDTO; onReload: () => void | Promise<void>; compact?: boolean; courseFilter?: string }) {
  const tasks = dto.schoolTasks.filter(t => courseFilter === undefined || (t.course ?? 'Unsorted') === courseFilter);
  const open = tasks.filter((t) => !t.done);
  const doneTasks = tasks.filter((t) => t.done);
  const overdueCount = open.filter((t) => t.overdue).length;
  const next = open.find((t) => t.daysUntil >= 0) ?? null;

  const [editId, setEditId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [openList, setOpenList] = useState<'open' | 'done' | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<Kind>('task');
  const [deadline, setDeadline] = useState(todayIso());
  const [course, setCourse] = useState(courseFilter ?? '');
  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setEditId(null);
    setAdding(false);
    setOpenList(null);
    setTitle('');
    setKind('task');
    setDeadline(todayIso());
    setCourse(courseFilter ?? '');
    setNotes('');
  };
  const startAdd = () => {
    const wasAdding = adding;
    reset();
    setAdding(!wasAdding);
  };
  const loadFor = (t: Task) => {
    setEditId(t.id);
    setTitle(t.title);
    setKind(t.kind);
    setDeadline(t.deadline);
    setCourse(t.course ?? '');
    setNotes(t.notes ?? '');
    setMsg('');
  };
  const toggleEdit = (list: 'open' | 'done', t: Task) => {
    if (openList === list && editId === t.id) reset();
    else {
      setAdding(false);
      setOpenList(list);
      loadFor(t);
    }
  };

  async function submit() {
    setBusy(true);
    setMsg('');
    // Optional fields are sent EXPLICITLY (even null) so blanking one on edit actually clears it.
    const body = { title, kind, deadline, course: course.trim() || null, notes: notes.trim() || null };
    const m = await postJson(editId != null ? `/api/school-tasks?id=${editId}` : '/api/school-tasks', editId != null ? 'PATCH' : 'POST', body);
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
    const m = await postJson(`/api/school-tasks?id=${editId}`, 'DELETE');
    setBusy(false);
    if (m === '') {
      reset();
      setMsg('Deleted ✓');
      await onReload();
    } else setMsg(m);
  }
  async function toggleDone(t: Task) {
    setBusy(true);
    const m = await postJson(`/api/school-tasks?id=${t.id}`, 'PATCH', { done: !t.done });
    setBusy(false);
    if (m === '') await onReload();
    else setMsg(m);
  }
  const canSubmit = title.trim() !== '' && /^\d{4}-\d{2}-\d{2}$/.test(deadline);

  const renderForm = () => (
    <>
      <div className="mis-form-grid">
        <div className="mis-form-course">
          <Field label="Title"><input className="parts-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Networking report" /></Field>
        </div>
        <Field label="Type">
          <select className="parts-input" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            {KINDS.map((k) => (
              <option key={k} value={k}>{KIND_LABELS[k]}</option>
            ))}
          </select>
        </Field>
        <Field label="Deadline"><input className="parts-input" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></Field>
        <Field label="Course"><input className="parts-input" value={course} onChange={(e) => setCourse(e.target.value)} placeholder="optional" /></Field>
        <div className="mis-form-course">
          <Field label="Notes"><input className="parts-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional" /></Field>
        </div>
      </div>
      <div className="mis-form-actions">
        <button className="parts-button" disabled={busy || !canSubmit} onClick={() => void submit()}>
          {editId != null ? 'Update task' : 'Add task'}
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
      {!compact && <TileGrid>
        <StatTile label="Open" value={String(open.length)} sub="tasks" />
        <StatTile label="Overdue" value={String(overdueCount)} sub="late" color={overdueCount > 0 ? C.danger : undefined} />
        <StatTile label="Next deadline" value={next ? tMinus(next.daysUntil) : '—'} sub={next ? next.title : 'no open deadline'} color={next && next.daysUntil <= 2 ? C.danger : undefined} />
        <StatTile label="Done" value={String(doneTasks.length)} sub="completed" />
      </TileGrid>}

      <Card
        title="▮ OPEN"
        headerRight={
          <button className="parts-button mis-btn-sm" onClick={startAdd}>{adding ? '✕ Close' : compact ? '+ NEW TASK' : '＋ Add'}</button>
        }
      >
        {adding && (
          <div className="mis-add-panel">
            <InsetPanel>{renderForm()}</InsetPanel>
          </div>
        )}
        <AccordionList
          items={open}
          editingId={openList === 'open' ? editId : null}
          renderRow={(t) => <TaskRow t={t} busy={busy} selected={openList === 'open' && editId === t.id} onClick={() => toggleEdit('open', t)} onToggle={() => void toggleDone(t)} />}
          renderEditor={() => renderForm()}
          empty="No open tasks."
        />
      </Card>

      <Card title="▮ DONE">
        <button
          className="parts-button mis-btn-sm"
          onClick={() => setShowHistory((v) => !v)}
          aria-expanded={showHistory}
        >
          {showHistory ? '▾ Hide' : `▸ History (${doneTasks.length})`}
        </button>
        {showHistory && (
          <div className="mis-history-panel">
            <AccordionList
              items={doneTasks}
              editingId={openList === 'done' ? editId : null}
              renderRow={(t) => <TaskRow t={t} busy={busy} selected={openList === 'done' && editId === t.id} onClick={() => toggleEdit('done', t)} onToggle={() => void toggleDone(t)} />}
              renderEditor={() => renderForm()}
              empty="Nothing completed yet."
            />
          </div>
        )}
      </Card>
    </TabShell>
  );
}
