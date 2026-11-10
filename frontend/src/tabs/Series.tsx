import { useEffect, useState } from 'react';
import type { DashboardDTO } from '@solace/core';
import { C, cssVars, formatEur } from '../tokens.ts';
import { BarTrack } from '../ui.tsx';
import { READ_STATUS_LABELS, SERIES_STATE_LABELS } from '../yorha-labels.ts';
import { AccordionList, Card, Field, FilterTabs, getJson, InsetPanel, postJson, StatTile, TabShell, TileGrid } from './parts.tsx';
import { archiveSpend } from './spend.ts';
import { filterTabsFor, matcherFor, matchesQuery, type Kind, type SeriesFilter, type SeriesItem } from './series-filters.ts';
import { centsToEurInput, nextToBuyList, parseEurToCents, spendSubtitle, toBuyTile } from './series-summary.ts';
import { useMobile } from '../responsive.ts';

type VolItem = SeriesItem['volumes'][number];
type SortKey = 'recent' | 'title' | 'rating' | 'progress' | 'tobuy';

// One result from GET /api/manga-lookup — an English print edition (Google Books), the canonical
// AniList/Jikan/Google Books entry. Maps 1:1 onto creating a Series.
interface Candidate {
  title: string;
  romaji: string | null;
  native: string | null;
  author: string | null;
  totalVolumes: number | null;
  isOngoing: boolean;
  isSeries: boolean;
  coverUrl: string | null;
  source: string;
  edition?: string | null;
  publisher?: string | null;
  language?: 'en' | null;
  genres?: string[] | null;
  relations?: RelatedWork[] | null;
  /** Found by AUTHOR name (not title): the creator's full name. */
  matchedAuthor?: string | null;
}
interface RelatedWork {
  relationType: string;
  title: string;
  format: string;
  coverUrl: string | null;
}
interface LookupResp {
  found: boolean;
  candidates: Candidate[];
}

const RELATION_LABELS: Record<string, string> = {
  PREQUEL: 'Prequel',
  SEQUEL: 'Sequel',
  SIDE_STORY: 'Side story',
  SPIN_OFF: 'Spin-off',
  PARENT: 'Parent series',
  ALTERNATIVE: 'Alternative',
};
const relationLabel = (r: RelatedWork): string => RELATION_LABELS[r.relationType] ?? (r.format === 'ONE_SHOT' ? 'One-shot' : 'Related');

// The single state pill: dropped / complete / ongoing (still publishing) / caught-up / reading / active.
// Derived on the client from the DTO's already-derived flags (mirrors core domain/series.ts).
function stateOf(s: SeriesItem): { key: string; color: string } {
  if (s.readingStatus === 'dropped') return { key: 'dropped', color: C.muted2 };
  if (s.finished) return { key: 'complete', color: C.ok };
  if (s.publicationStatus === 'ongoing') return { key: s.caughtUp ? 'caughtup' : 'ongoing', color: C.gold };
  if (s.reading) return { key: 'reading', color: C.gold };
  return { key: 'active', color: C.muted3 };
}
/** The clickable read-status cycle for a per-volume Copy. dnf (indexOf -1) folds back to 'unread'. */
const READ_CYCLE = ['unread', 'reading', 'read'] as const;
const nextReadStatus = (cur: string): string => READ_CYCLE[(READ_CYCLE.indexOf(cur as (typeof READ_CYCLE)[number]) + 1) % READ_CYCLE.length]!;
/** Chip colour per read-status (READ = ok, READING = gold, DNF = danger, else muted). */
const readColor = (st: string): string => (st === 'read' ? C.ok : st === 'reading' ? C.gold : st === 'dnf' ? C.danger : C.muted3);

/** A series' rating = the best rating across its volumes' copies (there's no series-level rating). */
const seriesRating = (s: SeriesItem): number | null => {
  const rs = s.volumes.map((v) => v.rating).filter((r): r is number => r != null);
  return rs.length > 0 ? Math.max(...rs) : null;
};

function Cover({ url, w, h }: { url: string | null; w: number; h: number }) {
  if (!url) return <div className="series-cover-placeholder" style={{ width: w, height: h, fontSize: Math.max(9, w / 6) }}>📕</div>;
  return <img src={url} alt="" loading="lazy" className="series-cover-img" style={{ width: w, height: h }} />;
}

// FILLED-gold chip = a call to action (buy). Price pills below are OUTLINE (per the style rule).
function BuyChip({ vol }: { vol: number }) {
  return (
    <span className="series-buy-chip">
      Buy vol {vol}
    </span>
  );
}

/** A labelled two-option choice for a boolean series field. Replaces bare checkboxes whose caption
 *  flipped with the state ("complete run" / "still running") and read like "tick = mark as completed" —
 *  both options are always visible, so it's clear what each one means. Deliberately NOT wrapped in
 *  `Field` (a <label>): clicking a label's text would forward the click to its first button and flip it. */
function TwoWay({ label, value, onChange, off, on }: { label: string; value: boolean; onChange: (v: boolean) => void; off: string; on: string }) {
  const opt = (v: boolean, text: string) => {
    const active = value === v;
    return (
      <button
        type="button"
        aria-pressed={active}
        onClick={() => onChange(v)}
        className={`series-twoway-btn${active ? ' is-active' : ''}`}
      >
        {text}
      </button>
    );
  };
  return (
    <div className="series-twoway">
      <span className="series-twoway__label">{label}</span>
      <div role="group" aria-label={label} className="series-twoway__group">
        {opt(false, off)}
        {opt(true, on)}
      </div>
    </div>
  );
}

/** OUTLINE price pill (mono + tabular-nums). "(est.)" suffix in faint when the purchase was an AI guess. */
function PricePill({ p }: { p: NonNullable<VolItem['pricePaid']> }) {
  return (
    <span className={`series-price-pill${p.estimated ? ' is-estimated' : ''}`}>
      {formatEur(p.amountCents)}
      {p.estimated ? <span className="series-price-pill__est"> (est.)</span> : null}
    </span>
  );
}

function SeriesRow({ s, kind, selected, expanded, onEdit, onToggleVolumes }: { s: SeriesItem; kind: Kind; selected: boolean; expanded: boolean; onEdit: () => void; onToggleVolumes: () => void }) {
  const st = stateOf(s);
  const rating = seriesRating(s);
  const showBar = kind === 'manga' && s.progressPct != null;
  return (
    <div className={`yorha-card-row series-row${selected ? ' is-selected' : ''}`} style={cssVars({ '--series-row-accent': st.color })}>
      <div onClick={onEdit} role="button" tabIndex={0} aria-label={`Open ${s.title}`} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEdit(); } }} className="series-row__main">
        <Cover url={s.coverUrl} w={38} h={54} />
        <div className="series-row__info">
          <div className="series-row__title-line">
            <span className="series-row__title">{s.title}</span>
            <span className="series-row__state-chip" style={cssVars({ '--series-state-color': st.color })}>{SERIES_STATE_LABELS[st.key] ?? st.key.toUpperCase()}</span>
            {s.nextVolumeToBuy != null && <BuyChip vol={s.nextVolumeToBuy} />}
          </div>
          {s.author && <div className="series-row__author">{s.author}</div>}
          {kind === 'manga' ? (
            <div className="series-row__manga-line">
              <span className="series-row__read-count">Read {s.readCount} / {s.totalVolumesKnown ?? '?'}</span>
              {showBar && <div className="series-row__bar-wrap"><BarTrack pct={s.progressPct!} color={s.finished ? C.ok : C.gold} height={6} /></div>}
              {s.unreadOwned > 0 && <span className="series-row__note">+{s.unreadOwned} owned, unread</span>}
              {s.caughtUp && <span className="series-row__note">caught up</span>}
              {s.volumesBehind != null && s.volumesBehind > 0 && !s.finished && s.readingStatus !== 'dropped' && <span className="series-row__behind">{s.volumesBehind} to buy</span>}
            </div>
          ) : (
            <div className="series-row__book-line">
              {s.type === 'LN' ? 'light novel' : 'book'}
              {s.englishPublisher ? ` · ${s.englishPublisher}` : ''}
            </div>
          )}
          {s.genres.length > 0 && (
            <div className="series-row__genres">
              {s.genres.slice(0, 4).map((g) => (
                <span key={g} className="series-genre-chip">{g}</span>
              ))}
            </div>
          )}
          <div className="series-row__meta-line">
            {rating != null && <span className="series-row__rating">{'★'.repeat(rating)}</span>}
            {s.totalSpentCents != null && <span className="series-row__spent">Σ {formatEur(s.totalSpentCents)}</span>}
          </div>
        </div>
      </div>
      {/* Separate disclosure — its OWN state (expandedSeriesId), independent of the edit accordion. */}
      {s.volumes.length > 0 && (
        <button
          className={`yorha-btn parts-button series-vol-toggle${expanded ? ' is-expanded' : ''}`}
          onClick={(e) => { e.stopPropagation(); onToggleVolumes(); }}
        >
          {expanded ? '▾' : '▸'} {s.volumes.length} vol
        </button>
      )}
    </div>
  );
}

/** The per-volume disclosure — a lightweight list (read-status chip + owned + OUTLINE price pill per
 *  volume). NOT a full form; distinct from the gold edit InsetPanel (this uses a leanness left-accent
 *  so the two never look alike). The Σ-spent recompute + "excl. estimates" toggle were dropped — the
 *  series' Σ-spent already renders once, on the row chip (3.2 #12). */
function VolumePanel({ s, onSetRead, savingCopyId }: { s: SeriesItem; onSetRead: (copyId: number, next: string) => void; savingCopyId: number | null }) {
  return (
    <div className="series-vol-panel">
      <div className="series-vol-panel__header">
        <span className="series-vol-panel__header-text">VOLUMES · {s.ownedCount} owned / {s.readCount} read</span>
      </div>
      <div className="series-vol-panel__list">
        {s.volumes.map((v) => {
          const col = readColor(v.readStatus);
          const label = READ_STATUS_LABELS[v.readStatus] ?? v.readStatus.toUpperCase();
          const saving = savingCopyId === v.copyId;
          // Clickable when a Copy row backs the volume — cycles unread→reading→read via PATCH /api/copies.
          // No copyId (a volume with no Copy) → read-only chip; NEVER PATCH with the volume id.
          const isRead = v.readStatus === 'read';
          return (
            <div key={v.id} className="series-vol-row">
              <span className="series-vol-row__num">
                {v.volumeNumber != null ? `#${v.volumeNumber}` : '—'}
              </span>
              {v.copyId != null ? (
                <button
                  className={`yorha-btn series-read-chip series-read-chip--button${isRead ? ' is-read' : ''}`}
                  onClick={() => onSetRead(v.copyId!, nextReadStatus(v.readStatus))}
                  disabled={saving}
                  title="Click to change reading status"
                  style={cssVars({ '--series-chip-color': col })}
                >
                  {saving ? '…' : label}
                </button>
              ) : (
                <span title="No copy — cannot be changed" className={`series-read-chip series-read-chip--static${isRead ? ' is-read' : ''}`} style={cssVars({ '--series-chip-color': col })}>{label}</span>
              )}
              {isRead && v.readDate && <span className="series-vol-row__read-date">READ {v.readDate}</span>}
              <span className={`series-vol-row__owned${v.owned ? '' : ' is-not-owned'}`}>{v.owned ? 'owned' : 'not owned'}</span>
              {v.format !== 'single' && <span className="series-vol-row__format">{v.format}</span>}
              <span className="series-vol-row__spacer" />
              {v.pricePaid != null && <PricePill p={v.pricePaid} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CandidatePicker({ candidates, kind, onPick, onPickRelated }: { candidates: Candidate[]; kind: Kind; onPick: (c: Candidate) => void; onPickRelated: (title: string) => void }) {
  const seen = new Set<string>();
  const related: RelatedWork[] = [];
  for (const c of candidates)
    for (const r of c.relations ?? []) {
      const key = r.title.toLowerCase();
      if (!seen.has(key)) (seen.add(key), related.push(r));
    }
  const relatedShown = related.slice(0, 12);
  return (
    <div className="series-candidates">
      <div className="series-candidates__header">PICK THE RIGHT ONE — {candidates.length} found · <span className="series-candidates__en-hint">EN</span> = English edition (correct count){candidates.some((c) => c.matchedAuthor) ? ' · ✎ = found via author' : ''}</div>
      <div className="series-candidates__row">
        {candidates.map((c, i) => {
          const sub = c.native ?? c.romaji;
          const genres = (c.genres ?? []).slice(0, 3);
          return (
            <button
              key={`${c.title}-${i}`}
              onClick={() => onPick(c)}
              className="yorha-card-row series-candidate"
            >
              <Cover url={c.coverUrl} w={108} h={154} />
              <div className="series-candidate__title">{c.title}</div>
              {sub && sub !== c.title && <div className="series-candidate__sub">{sub}</div>}
              {c.matchedAuthor ? (
                <div title={`Work by ${c.matchedAuthor}`} className="series-candidate__author-match">✎ {c.matchedAuthor}</div>
              ) : (
                // A book is recognised by its author as much as its cover — show it on title hits too.
                kind === 'book' && c.author && <div className="series-candidate__sub">{c.author}</div>
              )}
              {c.language === 'en' && (
                <div className="series-candidate__en-row">
                  <span className="series-candidate__en-badge">EN</span>
                  {c.edition && c.edition !== 'Standard' && <span className="series-candidate__edition">{c.edition}</span>}
                  {c.publisher && <span className="series-candidate__publisher">{c.publisher}</span>}
                </div>
              )}
              <div className={`series-candidate__volcount${c.isOngoing ? ' is-ongoing' : ''}`}>
                {kind === 'book' ? (
                  c.isSeries ? `${c.totalVolumes} volumes` : 'book'
                ) : (
                  <>
                    {c.totalVolumes != null ? `${c.totalVolumes} vol` : c.isOngoing ? 'ongoing' : '— vol'}
                    {!c.isSeries ? ' · one-shot' : ''}
                  </>
                )}
              </div>
              {genres.length > 0 && (
                <div className="series-candidate__genres">
                  {genres.map((g) => (
                    <span key={g} className="series-candidate__genre-chip">{g}</span>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
      {relatedShown.length > 0 && (
        <div className="series-related">
          <div className="series-related__header">RELATED — click to search &amp; add</div>
          <div className="series-related__row">
            {relatedShown.map((r, i) => (
              <button
                key={`${r.title}-${i}`}
                onClick={() => onPickRelated(r.title)}
                className="yorha-card-row series-related-card"
                title={r.title}
              >
                <Cover url={r.coverUrl} w={82} h={116} />
                <span className={`series-related-card__label${r.format === 'ONE_SHOT' ? ' is-oneshot' : ''}`}>{relationLabel(r)}</span>
                <span className="series-related-card__title">{r.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** GET /api/buy-volume?seriesId= — the price the confirm pre-fills (a price-table estimate). */
interface BuyQuote {
  volumeNumber: number | null;
  priceCents: number | null;
  basis: string | null;
  publisherSlug: string | null;
}

/** The inline "Bought vol N?" confirm under a Next-to-buy row. The price field pre-fills with the
 *  price-table estimate; leaving it untouched records that estimate "(est.)", typing a different amount
 *  records a real receipt, and an empty field (no table) marks the volume owned without a price. */
function BuyConfirm({ s, onBought, onCancel }: { s: SeriesItem; onBought: (flash: string) => Promise<void>; onCancel: () => void }) {
  const [quote, setQuote] = useState<BuyQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [price, setPrice] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void getJson<BuyQuote>(`/api/buy-volume?seriesId=${s.id}`).then((q) => {
      if (!live) return;
      setQuote(q);
      setLoading(false);
      if (q?.priceCents != null) setPrice(centsToEurInput(q.priceCents));
    });
    return () => {
      live = false;
    };
  }, [s.id]);

  const vol = quote?.volumeNumber ?? s.nextVolumeToBuy!;
  const typed = price.trim() === '' ? null : parseEurToCents(price);
  const invalid = price.trim() !== '' && typed == null;
  // A receipt only when the user actually changed the pre-filled estimate. An emptied field still gets
  // the server-side estimate (when there is one) — the hint says so rather than promising "no price".
  const receipt = typed != null && typed !== quote?.priceCents;
  const effective = typed ?? quote?.priceCents ?? null;
  const hint = invalid
    ? '⚠ invalid price'
    : receipt
      ? 'real price (receipt)'
      : effective != null
        ? `estimate${typed == null ? ` ${formatEur(effective)}` : ''} · ${quote?.publisherSlug ?? quote?.basis ?? 'price table'}`
        : 'no price — owned only';

  async function confirm() {
    if (invalid) return;
    setBusy(true);
    setMsg('');
    const m = await postJson('/api/buy-volume', 'POST', { seriesId: s.id, volumeNumber: vol, ...(receipt ? { priceCents: typed } : {}) });
    setBusy(false);
    if (m !== '') return setMsg(m);
    const paid = effective != null ? ` · ${formatEur(effective)}${receipt ? '' : ' (est.)'}` : '';
    await onBought(`✓ Bought ${s.title} vol ${vol}${paid}`);
  }

  return (
    <InsetPanel scroll>
      <div className="series-buyconfirm__title">
        Bought vol {vol} of <b className="series-buyconfirm__title-bold">{s.title}</b>?
      </div>
      <div className="series-buyconfirm__row">
        <div className="series-buyconfirm__price-field">
          <Field label="Price (€)">
            <input
              className="yorha-input parts-input series-buyconfirm__price-input"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void confirm(); }}
              placeholder={loading ? '…' : '10,99'}
            />
          </Field>
        </div>
        <button className="yorha-btn parts-button series-buyconfirm__confirm-btn" disabled={busy || loading || invalid} onClick={() => void confirm()}>
          {busy ? '…' : '✓ Yes, bought'}
        </button>
        <button className="yorha-btn parts-button series-buyconfirm__cancel-btn" onClick={onCancel}>Cancel</button>
      </div>
      <div className={`series-buyconfirm__hint${invalid || msg ? ' is-danger' : ''}`}>{msg || (loading ? 'fetching price…' : hint)}</div>
    </InsetPanel>
  );
}

/** The "Next to buy" card: the ordered `nextToBuyList` as uniform, cover-led rows in ONE scroll area
 *  (~6 rows desktop / ~4 mobile tall). Every row is rendered — nothing is ever silently capped (the old
 *  `.slice(0, 12)` hid 15 of 27 series). Tapping a row opens {@link BuyConfirm} under it (one at a time);
 *  confirming marks that volume owned + records its price, then the dashboard reloads. Rows carry exactly
 *  one gold element (the BuyChip CTA); the cover and title stay neutral. */
function NextToBuyCard({ list, onReload }: { list: SeriesItem[]; onReload: () => void | Promise<void> }) {
  const ordered = nextToBuyList(list);
  const mobile = useMobile();
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [flash, setFlash] = useState('');
  // Row = 40px cover + 12px padding + 2px border; gap 6px.
  const visibleRows = mobile ? 4 : 6;
  const maxHeight = visibleRows * 54 + (visibleRows - 1) * 6 + 4;
  return (
    <Card title="▮ Next to buy" headerRight={<span className="series-nexttobuy__header-count">{ordered.length} series · tap = bought</span>}>
      <div className="series-nexttobuy__list" style={{ maxHeight }}>
        {ordered.map((s) => (
          <div key={s.id} className="series-nexttobuy__item">
            <button
              className={`yorha-card-row series-nexttobuy__row${confirmId === s.id ? ' is-selected' : ''}`}
              onClick={() => { setFlash(''); setConfirmId((cur) => (cur === s.id ? null : s.id)); }}
              title={`Bought vol ${s.nextVolumeToBuy}? Tap to confirm`}
            >
              <Cover url={s.coverUrl} w={28} h={40} />
              <BuyChip vol={s.nextVolumeToBuy!} />
              <span className="series-nexttobuy__title">{s.title}</span>
              {s.totalVolumesKnown != null && (
                <span className="series-nexttobuy__own">own {s.ownedCount}/{s.totalVolumesKnown}</span>
              )}
            </button>
            {confirmId === s.id && (
              <BuyConfirm
                s={s}
                onCancel={() => setConfirmId(null)}
                onBought={async (f) => {
                  setConfirmId(null);
                  setFlash(f);
                  await onReload();
                }}
              />
            )}
          </div>
        ))}
      </div>
      {flash && <div className="series-nexttobuy__flash">{flash}</div>}
    </Card>
  );
}

/** The unified ARCHIVES shelf over `dto.series` (migration v13). `kind` picks the sub-shelf: 'manga'
 *  or 'book' (book + LN). One row PER SERIES; its volumes nest inside a separate disclosure — a 70-volume
 *  A long series is one row, not 70. The 🔍 cover-picker POSTs a single /api/series (ownedVolumes/readVolumes
 *  create the placeholder Volume+Copy rows server-side); series-level fields edit in place. */
export function Series({ dto, onReload, kind, detailId, terminal = false, onOpen, onBack }: { dto: DashboardDTO; onReload: () => void | Promise<void>; kind: Kind; detailId?: number; terminal?: boolean; onOpen?: (id: number) => void; onBack?: () => void }) {
  const list = dto.series.filter((s) => (kind === 'manga' ? s.type === 'manga' : s.type !== 'manga'));
  const ls = dto.lifeSimSummary;

  const [filter, setFilter] = useState<SeriesFilter>('active');
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('recent');
  const [genreFilter, setGenreFilter] = useState('all');
  // Volume disclosure — its OWN key, independent of the edit accordion (editId). Both can be open.
  const [expandedId, setExpandedId] = useState<number | null>(null);
  // In-flight per-volume read-status PATCH (disables the one chip being saved).
  const [savingCopyId, setSavingCopyId] = useState<number | null>(null);

  // Persist a volume's read status by PATCHing its OWN Copy row, then refresh the dashboard.
  async function setVolRead(copyId: number, next: string) {
    setSavingCopyId(copyId);
    const m = await postJson(`/api/copies?id=${copyId}`, 'PATCH', { readStatus: next });
    setSavingCopyId(null);
    if (m === '') await onReload();
  }

  const allGenres = [...new Set(list.flatMap((s) => s.genres))].sort((a, b) => a.localeCompare(b));
  // A typed search looks through the WHOLE shelf, not just the selected tab — otherwise an author whose
  // series you finished would be invisible under the default "Active" tab.
  const searching = query.trim() !== '';
  const sorters: Record<SortKey, (a: SeriesItem, b: SeriesItem) => number> = {
    recent: () => 0, // DTO order = createdAt desc; a 0-comparator is a stable no-op.
    title: (a, b) => a.title.localeCompare(b.title),
    rating: (a, b) => (seriesRating(b) ?? -1) - (seriesRating(a) ?? -1),
    progress: (a, b) => (b.progressPct ?? -1) - (a.progressPct ?? -1),
    tobuy: (a, b) => (b.volumesBehind ?? -1) - (a.volumesBehind ?? -1),
  };
  /** Count rows matching a filter id OF THIS KIND. `matcherFor` is total, so an unknown id can't throw. */
  const cnt = (id: string): number => list.filter(matcherFor(kind, id)).length;
  const shown = list
    .filter(searching ? () => true : matcherFor(kind, filter))
    .filter((s) => genreFilter === 'all' || s.genres.includes(genreFilter))
    .filter((s) => matchesQuery(s, query))
    .sort(sorters[sortBy]);

  // --- Add/edit form state ------------------------------------------------------
  const [editId, setEditId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [type, setType] = useState<'manga' | 'book' | 'LN'>(kind === 'manga' ? 'manga' : 'book');
  const [dropped, setDropped] = useState(false);
  const [ongoing, setOngoing] = useState(false);
  const [owned, setOwned] = useState('');
  const [read, setRead] = useState('');
  const [total, setTotal] = useState('');
  // Book (single-volume) owned/read toggles.
  const [bookOwned, setBookOwned] = useState(true);
  const [bookRead, setBookRead] = useState(false);
  const [genresInput, setGenresInput] = useState('');
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [lookuping, setLookuping] = useState(false);

  const reset = () => {
    setEditId(null);
    setAdding(false);
    setTitle('');
    setAuthor('');
    setType(kind === 'manga' ? 'manga' : 'book');
    setDropped(false);
    setOngoing(false);
    setOwned('');
    setRead('');
    setTotal('');
    setBookOwned(true);
    setBookRead(false);
    setGenresInput('');
    setCoverUrl(null);
    setCandidates([]);
    setMsg('');
  };
  const startAdd = () => {
    if (adding) reset();
    else {
      reset();
      setAdding(true);
    }
  };
  const toggleEdit = (s: SeriesItem) => {
    if (editId === s.id) reset();
    else {
      setAdding(false);
      loadFor(s);
    }
  };
  const loadFor = (s: SeriesItem) => {
    setEditId(s.id);
    setTitle(s.title);
    setAuthor(s.author ?? '');
    setType(s.type);
    setDropped(s.readingStatus === 'dropped');
    setOngoing(s.publicationStatus === 'ongoing');
    setOwned(String(s.ownedCount));
    setRead(String(s.readCount));
    setTotal(s.totalVolumesKnown != null ? String(s.totalVolumesKnown) : '');
    setBookOwned(s.ownedCount > 0);
    setBookRead(s.readCount > 0);
    setGenresInput(s.genres.join(', '));
    setCoverUrl(s.coverUrl);
    setCandidates([]);
    setMsg('');
  };

  // The lookup matches a TITLE or an AUTHOR name (the server runs both). With the title field still empty,
  // a name typed in the Author field is searched instead — type "Tatsuki Fujimoto" there and hit Search.
  const lookupQuery = (title.trim() || author.trim());
  async function lookup(q0?: string) {
    const q1 = (q0 ?? lookupQuery).trim();
    if (q1.length < 2) return;
    setLookuping(true);
    setMsg('');
    setCandidates([]);
    // The BOOKS tab asks for plain books (Google Books by title + author); the MANGA tab for manga.
    const r = await getJson<LookupResp>(`/api/manga-lookup?title=${encodeURIComponent(q1)}${kind === 'book' ? '&kind=book' : ''}`);
    setLookuping(false);
    if (!r) return setMsg('⚠ Lookup failed — check the server');
    if (!r.found || r.candidates.length === 0) return setMsg('⚠ Nothing found — fill in manually');
    setCandidates(r.candidates);
    setMsg(`${r.candidates.length} match(es) — click the right cover`);
  }

  // Apply one picked candidate: fill the series metadata (title/total/ongoing/cover/genres). Never touches
  // your personal owned/read counters. Google Books can't tell if a series is still publishing, so only
  // AniList/Jikan drives the ongoing toggle.
  function pick(c: Candidate) {
    setTitle(c.title);
    if (c.author) setAuthor(c.author);
    if (c.source !== 'googlebooks') setOngoing(c.isOngoing);
    setCoverUrl(c.coverUrl);
    setTotal(c.isSeries && c.totalVolumes != null ? String(c.totalVolumes) : '');
    if (c.genres && c.genres.length > 0) setGenresInput(c.genres.join(', '));
    setCandidates([]);
    setMsg(
      c.source === 'googlebooks'
        ? "English edition filled in ✓ — check 'ongoing' + your volumes, then save"
        : `Filled in via ${c.source} ✓ — complete your volumes, then save`,
    );
  }

  async function submit() {
    setBusy(true);
    setMsg('');
    const genres = [...new Set(genresInput.split(',').map((g) => g.trim()).filter((g) => g !== ''))];
    const authorVal = author.trim() || null;
    const publicationStatus = ongoing ? 'ongoing' : 'completed';
    const readingStatus = dropped ? 'dropped' : 'active';
    if (editId != null) {
      // EDIT: only series-level fields (owned/read live on Copy rows — not patchable via /api/series).
      const body = { canonicalTitle: title, author: authorVal, type, publicationStatus, readingStatus, totalVolumesKnown: total ? Number(total) : null, coverUrl: coverUrl || null, genres };
      const m = await postJson(`/api/series?id=${editId}`, 'PATCH', body);
      setBusy(false);
      if (m === '') {
        setMsg('Updated ✓');
        reset();
        await onReload();
      } else setMsg(m);
      return;
    }
    // CREATE: ownedVolumes/readVolumes create the placeholder Volume+Copy rows server-side (one call).
    const isBook = type === 'book';
    const ownedVolumes = isBook ? (bookOwned ? 1 : 0) : owned ? Number(owned) : 0;
    const readVolumes = isBook ? (bookRead ? 1 : 0) : read ? Number(read) : 0;
    const body = {
      canonicalTitle: title,
      author: authorVal,
      type,
      publicationStatus,
      readingStatus,
      totalVolumesKnown: isBook ? 1 : total ? Number(total) : null,
      coverUrl: coverUrl || null,
      genres,
      ownedVolumes,
      readVolumes,
    };
    const m = await postJson('/api/series', 'POST', body);
    setBusy(false);
    if (m === '') {
      setMsg('Added ✓');
      reset();
      await onReload();
    } else setMsg(m);
  }
  async function del() {
    if (editId == null) return;
    setBusy(true);
    const m = await postJson(`/api/series?id=${editId}`, 'DELETE');
    setBusy(false);
    if (m === '') {
      reset();
      setMsg('Deleted ✓');
      await onReload();
    } else setMsg(m);
  }
  const canSubmit = title.trim() !== '';
  const isBook = type === 'book';

  const renderForm = () => (
    <>
      {/* 1 — Title + cover search. */}
      <div className="series-form__title-row">
        {(coverUrl || editId != null) && <Cover url={coverUrl} w={44} h={62} />}
        <div className="series-form__title-field">
          <Field label="Title">
            <div className="series-form__title-input-row">
              <input className="yorha-input parts-input series-form__title-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === 'manga' ? 'e.g. Slam Dunk — or search an author' : 'e.g. Dune — or search an author'} />
              <button className="yorha-btn parts-button series-form__search-btn" onClick={() => void lookup()} disabled={lookuping || lookupQuery.length < 2} title="Search by title or author — covers + English editions (Google Books + AniList)">{lookuping ? '…' : '🔍 Search'}</button>
            </div>
          </Field>
        </div>
      </div>

      {candidates.length > 0 && <CandidatePicker candidates={candidates} kind={kind} onPick={pick} onPickRelated={(t) => { setTitle(t); void lookup(t); }} />}

      {/* Author — free text (mangaka / novelist), prefilled by the lookup; shown under the title + searchable. */}
      <div className="series-form__spaced">
        <Field label="Author"><input className="yorha-input parts-input" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder={kind === 'manga' ? 'e.g. Takehiko Inoue' : 'e.g. Frank Herbert'} /></Field>
      </div>

      {/* 2 — Details. */}
      <div className="series-form__grid">
        <Field label="Type">
          <select className="yorha-input parts-input" value={type} onChange={(e) => setType(e.target.value as 'manga' | 'book' | 'LN')}>
            <option value="manga">Manga</option>
            <option value="book">Book</option>
            <option value="LN">Light novel</option>
          </select>
        </Field>
        <TwoWay label="Still reading?" value={dropped} onChange={setDropped} off="Active" on="Stopped (dropped)" />
        {!isBook && <TwoWay label="Is the series still publishing?" value={ongoing} onChange={setOngoing} off="Finished" on="Ongoing" />}
      </div>
      {!isBook && (
        <div className="series-form__ongoing-hint">
          "Still publishing" is about the publisher (are more volumes coming?), not your reading progress.
        </div>
      )}

      {/* 3 — Volumes (create-only; on edit the Copy rows aren't patchable via /api/series). */}
      {editId == null ? (
        isBook ? (
          <div className="series-form__grid series-form__grid--tight">
            <TwoWay label="Do you own the book?" value={bookOwned} onChange={setBookOwned} off="Wishlist" on="Owned" />
            <TwoWay label="Read?" value={bookRead} onChange={setBookRead} off="Not read yet" on="Read" />
          </div>
        ) : (
          <div className="series-form__grid series-form__grid--tight">
            <Field label="Owned"><input className="yorha-input parts-input" type="number" inputMode="numeric" value={owned} onChange={(e) => setOwned(e.target.value)} placeholder="24" /></Field>
            <Field label="Read up to"><input className="yorha-input parts-input" type="number" inputMode="numeric" value={read} onChange={(e) => setRead(e.target.value)} placeholder="23" /></Field>
            <Field label="Released (total)"><input className="yorha-input parts-input" type="number" inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="31" /></Field>
          </div>
        )
      ) : !isBook ? (
        <div className="series-form__grid series-form__grid--tight">
          <Field label="Released (total)"><input className="yorha-input parts-input" type="number" inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="31" /></Field>
        </div>
      ) : null}

      {/* Genres — comma-separated, prefilled from the AniList lookup. Drives the shelf filter/search. */}
      <div className="series-form__spaced">
        <Field label="Genres (comma-separated)"><input className="yorha-input parts-input" value={genresInput} onChange={(e) => setGenresInput(e.target.value)} placeholder="Action, Sports, Drama" /></Field>
      </div>

      <div className="series-form__actions">
        <button className="yorha-btn parts-button" disabled={busy || !canSubmit} onClick={() => void submit()}>{editId != null ? 'Update' : 'Add'}</button>
        {editId != null && <button className="yorha-btn parts-button series-form__delete-btn" onClick={() => void del()}>Delete</button>}
        <button className="parts-button series-form__cancel-btn" onClick={reset}>Cancel</button>
        {msg && <span className={`series-form__msg${msg.startsWith('⚠') ? ' is-danger' : ''}`}>{msg}</span>}
      </div>
      <div className="series-form__footer-hint">
        {editId != null
          ? 'Editing series-level fields. Per-volume ownership/reading lives on the volume Copies (▸ volumes) — add new copies/volumes via the API.'
          : isBook
            ? 'A book is automatically "Complete" once you mark it Read.'
            : 'For a series, "Complete" is automatic — when Read reaches Released. Owned drives the buy hint, so buying ahead (own 24, read 23) won\'t mark it done.'}
      </div>
    </>
  );

  // Only THIS kind's tabs. Building the other kind's as well would look its ids up in this kind's
  // matcher map (`mangaMatch['reading']` → undefined → `list.filter(undefined)` throws).
  const tabs = filterTabsFor(kind, list);

  // Both the headline total AND the "incl. … est." part are scoped to THIS tab's list and derived
  // from the SAME per-volume basis, so the estimate can never exceed the total it's part of.
  const { totalCents: totalSpent, estimatedCents: estSpent } = archiveSpend(list);
  const buyTile = toBuyTile(list, ls.volumesToBuy);

  if (detailId != null) {
    const detail = list.find(s => s.id === detailId);
    return <TabShell>
      {onBack ? <button className="yorha-btn parts-button" onClick={onBack}>← Back to folder</button> : <a className="yorha-btn parts-button" href={`#archives/${kind === 'manga' ? 'manga' : 'books'}`}>← Back to shelf</a>}
      {!detail ? <Card title="Shard unavailable"><p>This book or series is no longer in this archive.</p></Card> : <Card title={detail.title}>
        <div style={{ display:'flex', gap:24, alignItems:'flex-start', marginBottom:24 }}>
          <Cover url={detail.coverUrl} w={100} h={150} />
          <div><h2>{detail.title}</h2><p>{detail.author ?? 'Author unknown'}</p><p>{detail.readCount} / {detail.totalVolumesKnown ?? '?'} volumes read</p>
            <button className="yorha-btn parts-button" onClick={() => toggleEdit(detail)}>{editId === detail.id ? 'Close editor' : 'Edit details'}</button>
          </div>
        </div>
        {editId === detail.id && <InsetPanel>{renderForm()}</InsetPanel>}
        <VolumePanel s={detail} onSetRead={(cid, next) => void setVolRead(cid, next)} savingCopyId={savingCopyId} />
      </Card>}
    </TabShell>;
  }

  return (
    <TabShell>
      {!terminal && <TileGrid>
        {kind === 'manga' ? (
          <>
            {/* The alarm is on the SERIES count (how many need a volume); the volume total is context
                in the subtitle, not a scary red 367. */}
            <StatTile label="To buy" value={String(buyTile.seriesCount)} color={buyTile.danger ? C.danger : undefined} sub={`${buyTile.volumeCount} volumes to catch up`} />
            <StatTile label="To read" value={String(ls.volumesToRead)} sub="owned, unread" />
            <StatTile label="Ongoing" value={String(ls.mangaOngoing)} sub="series you follow" />
          </>
        ) : (
          <>
            <StatTile label="Reading" value={String(cnt('reading'))} sub="in progress" />
            <StatTile label="Complete" value={String(cnt('complete'))} sub="on the shelf" />
            <StatTile label="On shelf" value={String(list.length)} sub="books + light novels" />
          </>
        )}
        <StatTile label="Σ spent" value={formatEur(totalSpent)} sub={spendSubtitle(totalSpent, estSpent)} />
      </TileGrid>}

      {!terminal && kind === 'manga' && buyTile.seriesCount > 0 && <NextToBuyCard list={list} onReload={onReload} />}

      <Card
        title={kind === 'manga' ? '▮ Manga shelf' : '▮ Book shelf'}
        headerRight={
          <button className="yorha-btn parts-button series-shelf__add-btn" onClick={startAdd}>{adding ? '✕ Close' : terminal ? kind === 'manga' ? '+ ADD MANGA' : '+ ADD BOOK' : '＋ Add'}</button>
        }
      >
        <div className="series-shelf__toolbar">
          <input className="yorha-input parts-input series-shelf__query-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title / author / genre" />
          <select className="yorha-input parts-input series-shelf__select" value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)} title="Sort">
            <option value="recent">↧ Recent</option>
            <option value="title">Title A–Z</option>
            <option value="rating">Rating ↓</option>
            <option value="progress">Progress ↓</option>
            <option value="tobuy">To buy ↓</option>
          </select>
          {allGenres.length > 0 && (
            <select className="yorha-input parts-input series-shelf__select" value={genreFilter} onChange={(e) => setGenreFilter(e.target.value)} title="Filter by genre">
              <option value="all">All genres</option>
              {allGenres.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          )}
        </div>
        <div className="series-shelf__block">
          {searching ? (
            <div className="series-shelf__searching">
              <span>Searching the whole shelf · {shown.length} {shown.length === 1 ? 'match' : 'matches'}</span>
              <button className="yorha-btn parts-button series-shelf__clear-btn" onClick={() => setQuery('')}>✕ Clear search</button>
            </div>
          ) : (
            <FilterTabs<string> active={filter} onChange={(f) => setFilter(f as SeriesFilter)} tabs={tabs} />
          )}
        </div>
        {adding && (
          <div className="series-shelf__block">
            <InsetPanel>{renderForm()}</InsetPanel>
          </div>
        )}
        {/* The shelf scrolls inside its card (search/filters stay put above it) instead of stretching the
            page 78 rows long. The inline editor/volume panel open inside the scroll area; InsetPanel's
            scrollIntoView keeps an opened editor visible. 2px top padding leaves room for the row hover lift. */}
        <div className="series-shelf__scroll">
          <AccordionList
            items={shown}
            editingId={editId}
            renderRow={(s) => (
              <>
                <SeriesRow
                  s={s}
                  kind={kind}
                  selected={editId === s.id}
                  expanded={expandedId === s.id}
                  onEdit={() => onOpen ? onOpen(s.id) : toggleEdit(s)}
                  onToggleVolumes={() => setExpandedId((cur) => (cur === s.id ? null : s.id))}
                />
                {expandedId === s.id && <VolumePanel s={s} onSetRead={(cid, next) => void setVolRead(cid, next)} savingCopyId={savingCopyId} />}
              </>
            )}
            renderEditor={() => renderForm()}
            empty={list.length === 0 ? `No ${kind === 'manga' ? 'manga' : 'books'} yet — add one above.` : 'None on this shelf.'}
          />
        </div>
      </Card>
    </TabShell>
  );
}
