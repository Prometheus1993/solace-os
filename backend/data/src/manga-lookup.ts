/**
 * Manga metadata lookup against FREE public APIs — AniList first, Jikan (MyAnimeList)
 * as fallback. Pure HTTP (no LLM, no SDK) so it lives in @solace/data: the common
 * case is more accurate for facts like volume counts than an LLM.
 *
 * Returns a LIST of candidates (not one guess) with cover images + the native/romaji
 * title, so the UI can show a cover picker — you recognise the right manga by its cover
 * even when it only exists under a Japanese title. Verified live against both APIs.
 */

export interface MangaCandidate {
  /** Best display title: English if it exists, else romaji, else native. */
  title: string;
  /** Romanised Japanese title (often differs from the English one). */
  romaji: string | null;
  /** Native (Japanese) title — lets you recognise a manga with no English title. */
  native: string | null;
  author: string | null;
  /** Total tankōbon volumes; null for ongoing/unknown (never coerced to 0). */
  totalVolumes: number | null;
  /** The series is still being published (RELEASING/Publishing/Hiatus/upcoming). */
  isOngoing: boolean;
  /** A multi-volume series vs a one-shot. */
  isSeries: boolean;
  coverUrl: string | null;
  source: 'anilist' | 'jikan' | 'googlebooks';
  /** English release edition (Google Books only): 'Standard' | 'Omnibus' | 'N-in-1' | 'Deluxe' | 'Box Set'. */
  edition?: string | null;
  /** English publisher (Google Books only): 'Kodansha Comics', 'VIZ Media', … */
  publisher?: string | null;
  /** Release language of THIS candidate: 'en' for Google Books; absent for AniList/Jikan (= original JP). */
  language?: 'en' | null;
  /** Genres from AniList (e.g. ['Action','Sports']); null/absent for Jikan/Google Books. */
  genres?: string[] | null;
  /** Related works from AniList (prequels/sequels/side-stories/spin-offs/one-shots) — pickable in the
   * UI to find & add them. Absent for Jikan/Google Books. */
  relations?: MangaRelation[] | null;
  /** Set when this candidate was found by AUTHOR (the query matched a creator's name, not the title):
   * the creator's full name, so the picker can say whose work it is. Absent for title matches. */
  matchedAuthor?: string | null;
}

/** A related manga surfaced by the lookup (AniList `relations`). */
export interface MangaRelation {
  /** PREQUEL | SEQUEL | SIDE_STORY | SPIN_OFF | PARENT | ALTERNATIVE (or another type when it's a one-shot). */
  relationType: string;
  title: string;
  /** MANGA | ONE_SHOT | MANHWA | MANHUA. */
  format: string;
  coverUrl: string | null;
}

type FetchLike = typeof fetch;

const MAX_CANDIDATES = 6;
// Cap each upstream call so a hung AniList/Jikan/Google Books can't stall the /api/manga-lookup route
// indefinitely. On timeout the fetch rejects (AbortError) and each adapter's try/catch degrades to [].
const FETCH_TIMEOUT_MS = 8000;

const ANILIST_ENDPOINT = 'https://graphql.anilist.co';
// format_not: NOVEL excludes light novels (which also return as type MANGA).
// sort: SEARCH_MATCH biases the closest title match to the top.
const ANILIST_QUERY = `query ($search: String, $perPage: Int) {
  Page(perPage: $perPage) {
    media(search: $search, type: MANGA, format_not: NOVEL, sort: SEARCH_MATCH) {
      title { romaji english native }
      format
      status
      volumes
      genres
      coverImage { extraLarge large medium }
      staff(sort: RELEVANCE, perPage: 8) { edges { role node { name { full } } } }
      relations { edges { relationType node { title { romaji english native } format coverImage { large medium } } } }
    }
  }
}`;

// AniList MediaStatus → "still being published?". RELEASING / NOT_YET_RELEASED / HIATUS
// are ongoing; FINISHED / CANCELLED are complete.
function anilistOngoing(s: string | null): boolean {
  return s === 'RELEASING' || s === 'NOT_YET_RELEASED' || s === 'HIATUS';
}

interface AniStaffEdge {
  role: string | null;
  node: { name: { full: string | null } | null } | null;
}

// The staff connection mixes authors with artists/translators/editors and `role` is
// free-text, so we filter: prefer the WRITER (Story / Story & Art / Original Story /
// Writer / Scenario …), then the artist, else the first edge. Case-insensitive; the
// RELEVANCE sort already biases the real creators to the top.
const WRITER_ROLE = /\b(story|writer|scenario|script|original creator|creator|author|concept)\b/;
function pickAuthor(edges: AniStaffEdge[]): string | null {
  const norm = edges
    .map((e) => ({ role: (e.role ?? '').trim().toLowerCase(), name: e.node?.name?.full ?? null }))
    .filter((e): e is { role: string; name: string } => e.name != null);
  const writer = norm.find((e) => WRITER_ROLE.test(e.role));
  if (writer) return writer.name;
  const art = norm.find((e) => e.role.startsWith('art') || e.role.includes('illustrat'));
  return art?.name ?? norm[0]?.name ?? null;
}

// Relations to surface: the reading-order ones a reader actually wants to find & add. A genuine related
// one-shot (a pilot, a side-story) already carries one of these types (ALTERNATIVE/SIDE_STORY/…), so we
// gate on the type alone — that drops crossover/character one-shots (relationType CHARACTER/OTHER, e.g.
// "Jump Super Stars") while keeping the real ones. Anime adaptations + novels are dropped by format.
const RELATION_TYPES = new Set(['PREQUEL', 'SEQUEL', 'SIDE_STORY', 'SPIN_OFF', 'PARENT', 'ALTERNATIVE']);
const RELATION_FORMATS = new Set(['MANGA', 'ONE_SHOT', 'MANHWA', 'MANHUA']);

interface AniTitle {
  romaji?: string | null;
  english?: string | null;
  native?: string | null;
}
interface AniRelationEdge {
  relationType?: string | null;
  node?: {
    title?: AniTitle | null;
    format?: string | null;
    coverImage?: { large?: string | null; medium?: string | null } | null;
  } | null;
}

/** Filter AniList relation edges to the manga prequels/sequels/side-stories/spin-offs + one-shots,
 * mapped to a compact MangaRelation (best title + cover). Anime/novel/meta links are dropped. */
function mapRelations(edges: AniRelationEdge[]): MangaRelation[] {
  const out: MangaRelation[] = [];
  for (const e of edges) {
    const relationType = (e.relationType ?? '').toUpperCase();
    const format = (e.node?.format ?? '').toUpperCase();
    if (!RELATION_FORMATS.has(format)) continue;
    if (!RELATION_TYPES.has(relationType)) continue;
    const t = e.node?.title;
    const title = t?.english ?? t?.romaji ?? t?.native ?? null;
    if (!title) continue;
    out.push({ relationType, title, format, coverUrl: e.node?.coverImage?.large ?? e.node?.coverImage?.medium ?? null });
  }
  return out;
}

interface AniMedia {
  title?: AniTitle | null;
  format?: string | null;
  status?: string | null;
  volumes?: number | null;
  genres?: (string | null)[] | null;
  coverImage?: { extraLarge?: string | null; large?: string | null; medium?: string | null } | null;
  staff?: { edges?: AniStaffEdge[] } | null;
  relations?: { edges?: AniRelationEdge[] | null } | null;
}

function aniToCandidate(m: AniMedia): MangaCandidate | null {
  const english = m.title?.english ?? null;
  const romaji = m.title?.romaji ?? null;
  const native = m.title?.native ?? null;
  const title = english ?? romaji ?? native;
  if (!title) return null;
  return {
    title,
    romaji,
    native,
    author: pickAuthor(m.staff?.edges ?? []),
    // 0 (or missing) means "unknown / still running" — never coerce to a real count.
    totalVolumes: typeof m.volumes === 'number' && m.volumes > 0 ? m.volumes : null,
    isOngoing: anilistOngoing(m.status ?? null),
    isSeries: m.format !== 'ONE_SHOT',
    coverUrl: m.coverImage?.extraLarge ?? m.coverImage?.large ?? m.coverImage?.medium ?? null,
    source: 'anilist',
    genres: Array.isArray(m.genres) ? m.genres.filter((g): g is string => typeof g === 'string' && g !== '') : null,
    relations: mapRelations(m.relations?.edges ?? []),
  };
}

async function fromAniList(title: string, fetchImpl: FetchLike): Promise<MangaCandidate[]> {
  try {
    const res = await fetchImpl(ANILIST_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: ANILIST_QUERY, variables: { search: title, perPage: MAX_CANDIDATES } }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { data?: { Page?: { media?: AniMedia[] } | null } | null };
    const media = body.data?.Page?.media ?? [];
    return media.map(aniToCandidate).filter((c): c is MangaCandidate => c != null);
  } catch {
    return [];
  }
}

// Jikan response status strings → "still being published?".
function jikanOngoing(s: string | null): boolean {
  return s === 'Publishing' || s === 'Not yet published' || s === 'On Hiatus';
}

// Jikan author names are "Surname, Given" — reformat to "Given Surname".
function flipName(name: string): string {
  const parts = name.split(',').map((p) => p.trim());
  return parts.length === 2 && parts[1] ? `${parts[1]} ${parts[0]}` : name;
}

interface JikanManga {
  title?: string | null;
  title_english?: string | null;
  title_japanese?: string | null;
  type?: string | null;
  volumes?: number | null;
  status?: string | null;
  authors?: Array<{ name?: string | null }>;
  images?: { jpg?: { large_image_url?: string | null; image_url?: string | null } | null } | null;
}

function jikanToCandidate(m: JikanManga): MangaCandidate | null {
  const english = m.title_english ?? null;
  const romaji = m.title ?? null;
  const title = english ?? romaji;
  if (!title) return null;
  const author = m.authors?.find((a) => a.name)?.name ?? null;
  return {
    title,
    romaji,
    native: m.title_japanese ?? null,
    author: author ? flipName(author) : null,
    totalVolumes: typeof m.volumes === 'number' && m.volumes > 0 ? m.volumes : null,
    isOngoing: jikanOngoing(m.status ?? null),
    isSeries: m.type !== 'One-shot',
    coverUrl: m.images?.jpg?.large_image_url ?? m.images?.jpg?.image_url ?? null,
    source: 'jikan',
  };
}

async function fromJikan(title: string, fetchImpl: FetchLike): Promise<MangaCandidate[]> {
  // MyAnimeList needs q >= 3 chars for a meaningful match.
  if (title.trim().length < 3) return [];
  try {
    const res = await fetchImpl(`https://api.jikan.moe/v4/manga?q=${encodeURIComponent(title)}&limit=${MAX_CANDIDATES}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { data?: JikanManga[] };
    return (body.data ?? []).map(jikanToCandidate).filter((c): c is MangaCandidate => c != null);
  } catch {
    return [];
  }
}

// ── Google Books: ENGLISH print editions (standard / omnibus / 3-in-1 / deluxe) ──────────────────
// AniList/Jikan only know the ORIGINAL (Japanese) volume count. Google Books indexes the ENGLISH
// releases — every volume AND every edition is a separate book entry — so we group them per edition
// and approximate the English count from the highest volume number seen. Best-effort: great for
// mainstream licensed series, weaker for obscure ones. A GOOGLE_BOOKS_API_KEY is recommended (the
// keyless quota is shared globally and frequently exhausted → 429); on any error this returns [] so
// the canonical AniList result still shows.
export const GBOOKS_ENDPOINT = 'https://www.googleapis.com/books/v1/volumes';

// English manga publishers — used (with a title match) to cut noise (artbooks, novels, fan guides)
// and, when entries disagree, to pick the real publisher over a reseller's metadata (e.g. an entry
// mislabelled "National Geographic Books").
const MANGA_PUBLISHERS = [
  'viz', 'kodansha', 'yen press', 'yen on', 'seven seas', 'square enix', 'dark horse', 'vertical',
  'tokyopop', 'one peace', 'ghost ship', 'denpa', 'j-novel', 'kaiten', 'inklore', 'shogakukan', 'shueisha',
];
const isMangaPublisher = (p: string | null | undefined): boolean =>
  MANGA_PUBLISHERS.some((x) => (p ?? '').toLowerCase().includes(x));

// Google Books returns ~20 items per request (regardless of maxResults), and orderBy=newest buries the
// older volumes of a long COMPLETED run (long series) under reprints + non-English editions. So we
// pull several pages IN PARALLEL and dedupe — enough of the back-catalogue to find the true highest
// English volume, AND with overlap so a throttled/empty page doesn't tank the count. 8 pages ≈ 160 newest
// entries is the knee where the tail is reached. Deeper pages yield little and Google throttles them;
// volumes that exist only in box sets are covered by the canonical AniList card.
const GB_PAGE_STARTS = [0, 20, 40, 60, 80, 100, 120, 140];

interface GBookVolumeInfo {
  title?: string | null;
  subtitle?: string | null;
  authors?: string[] | null;
  publisher?: string | null;
  language?: string | null;
  imageLinks?: { thumbnail?: string | null; smallThumbnail?: string | null } | null;
  // Google Books' own series metadata: the authoritative volume index when present.
  seriesInfo?: { bookDisplayNumber?: string | null } | null;
  /** BISAC-ish subjects ("Fiction", "Comics & Graphic Novels") — used as a book's genres. */
  categories?: string[] | null;
}
interface GBookItem {
  id?: string | null;
  volumeInfo?: GBookVolumeInfo | null;
}

/** Detect the English release edition from a book title+subtitle. */
function gbEdition(s: string): string {
  if (/\bomnibus\b/i.test(s)) return 'Omnibus';
  const nin1 = /\b(\d+)[-\s]?in[-\s]?1\b/i.exec(s);
  if (nin1) return `${nin1[1]}-in-1`;
  if (/\b(?:vizbig|big edition)\b/i.test(s)) return 'VIZBIG';
  if (/\bdeluxe\b/i.test(s)) return 'Deluxe';
  if (/\bbox set\b/i.test(s)) return 'Box Set';
  return 'Standard';
}

/** Authoritative volume number from Google Books' own series metadata (when present). */
function gbSeriesVolume(v: GBookVolumeInfo): number | null {
  const n = v.seriesInfo?.bookDisplayNumber;
  return n != null && /^\d+$/.test(String(n).trim()) ? Number(n) : null;
}

/** Fallback: pull the volume number from a title+subtitle (ignoring a "N-in-1" token so it isn't read as a volume). */
function gbVolumeNumber(s: string): number | null {
  const cleaned = s.replace(/\b\d+[-\s]?in[-\s]?1\b/i, ' ');
  const m =
    /\bvol(?:ume|\.)?\s*(\d+)/i.exec(cleaned) ??
    /\bomnibus\s*(\d+)/i.exec(cleaned) ??
    /\bbook\s*(\d+)/i.exec(cleaned) ??
    /(?:^|[\s,#])(\d{1,3})\s*$/.exec(cleaned.trim());
  return m && m[1] ? Number(m[1]) : null;
}

/** Bigger thumbnail, https, no page-curl. */
function gbCover(url: string | null | undefined): string | null {
  return url ? url.replace(/^http:/, 'https:').replace(/&edge=curl/g, '') : null;
}

const gbNorm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/** Title-case the search query → the series display name (cover titles vary too much to parse cleanly).
 *  The negative lookbehind keeps the letter after an apostrophe lowercase so possessives read "Kaguya's",
 *  not "Kaguya'S". */
const gbTitleCase = (s: string): string => s.replace(/(?<!['’])\b\w/g, (c) => c.toUpperCase());

interface EditionGroup {
  vols: number[];
  publisher: string | null;
  author: string | null;
  cover: string | null;
  coverVol: number;
}

/** One Google Books query: the raw `q` (`intitle:"…"` / `inauthor:"…"`), plus optional ordering/language hint. */
interface GbQuery {
  q: string;
  orderBy?: 'newest' | 'relevance';
  langRestrict?: 'en';
}

/** Fetch one page of Google Books results (best-effort: [] on any error). Google Books throws sporadic
 * 503s (seen live on an `inauthor:` query that succeeded a second later), so a 503 gets ONE retry; a 429
 * (quota) never does. */
async function gbFetchPage(query: GbQuery, startIndex: number, fetchImpl: FetchLike, apiKey?: string): Promise<GBookItem[]> {
  const params = new URLSearchParams({ q: query.q, printType: 'books', maxResults: '40', startIndex: String(startIndex) });
  if (query.langRestrict) params.set('langRestrict', query.langRestrict);
  if (query.orderBy) params.set('orderBy', query.orderBy);
  if (apiKey) params.set('key', apiKey);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchImpl(`${GBOOKS_ENDPOINT}?${params.toString()}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (res.status === 503 && attempt === 0) continue;
      if (!res.ok) return [];
      const body = (await res.json()) as { items?: GBookItem[] };
      return body.items ?? [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Fetch several pages IN PARALLEL and dedupe (real items by id; keyless/test items by title), keeping
 * the relevance/newest order of first appearance. */
async function gbCollect(query: GbQuery, pageStarts: readonly number[], fetchImpl: FetchLike, apiKey?: string): Promise<GBookItem[]> {
  const pages = await Promise.all(pageStarts.map((si) => gbFetchPage(query, si, fetchImpl, apiKey)));
  const byKey = new Map<string, GBookItem>();
  for (const items of pages) {
    for (const it of items) {
      const v = it.volumeInfo ?? {};
      const key = it.id ?? `${v.title ?? ''}|${v.subtitle ?? ''}`;
      if (!byKey.has(key)) byKey.set(key, it);
    }
  }
  return [...byKey.values()];
}

/** Find the ENGLISH editions of a series via Google Books → one candidate per edition (Standard /
 * Omnibus / N-in-1 / VIZBIG / Deluxe), each with the English volume count (best-effort: max volume number
 * seen across the paginated back-catalogue). Returns [] on quota/error so the lookup degrades to AniList.
 * Pass the optional API key for reliability. */
export async function searchMangaEnglishEditions(query: string, fetchImpl: FetchLike = fetch, apiKey?: string): Promise<MangaCandidate[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  // Paginate in parallel + dedupe (real items by id; keyless/test items fall back to a title key).
  const items = await gbCollect({ q: `intitle:"${q}"`, langRestrict: 'en', orderBy: 'newest' }, GB_PAGE_STARTS, fetchImpl, apiKey);

  const qn = gbNorm(q);
  const groups = new Map<string, EditionGroup>();
  for (const it of items) {
    const v = it.volumeInfo ?? {};
    const full = `${v.title ?? ''} ${v.subtitle ?? ''}`.trim();
    if (!full) continue;
    if ((v.language ?? 'en') !== 'en') continue; // langRestrict is a hint, not a filter → drop FR/IT/… entries
    if (!gbNorm(full).includes(qn)) continue;
    const edition = gbEdition(full);
    const vol = gbSeriesVolume(v) ?? gbVolumeNumber(full);
    // Keep manga-publisher entries, anything with a volume number, or a non-standard edition; drop the rest (fan guides, artbooks).
    if (!isMangaPublisher(v.publisher) && vol == null && edition === 'Standard') continue;

    const g = groups.get(edition) ?? { vols: [], publisher: null, author: null, cover: null, coverVol: Infinity };
    if (vol != null) g.vols.push(vol);
    // Prefer a real manga publisher over a reseller's metadata.
    if (v.publisher && (g.publisher == null || (!isMangaPublisher(g.publisher) && isMangaPublisher(v.publisher)))) g.publisher = v.publisher;
    g.author ??= v.authors?.[0] ?? null;
    const cov = gbCover(v.imageLinks?.thumbnail ?? v.imageLinks?.smallThumbnail);
    if (cov && (vol ?? 99) < g.coverVol) ((g.cover = cov), (g.coverVol = vol ?? 99)); // prefer volume 1's cover
    groups.set(edition, g);
  }

  const series = gbTitleCase(q);
  const candidates: MangaCandidate[] = [];
  for (const [edition, g] of groups) {
    if (g.vols.length === 0) continue; // drop editions matched by name but with no countable volume (junk null candidates)
    candidates.push({
      title: edition === 'Standard' ? series : `${series} — ${edition}`,
      romaji: null,
      native: null,
      author: g.author,
      totalVolumes: Math.max(...g.vols),
      isOngoing: false, // Google Books can't tell — the user confirms with the form's ongoing toggle
      isSeries: true,
      coverUrl: g.cover,
      source: 'googlebooks',
      edition,
      publisher: g.publisher,
      language: 'en',
    });
  }
  // Standard first, then omnibus/deluxe; cap.
  candidates.sort((a, b) => Number(b.edition === 'Standard') - Number(a.edition === 'Standard'));
  return candidates.slice(0, 4);
}

/** Genres + relations come only from AniList; the Google Books English-edition candidates have none. So
 * copy the matching AniList series metadata onto same-series English editions (matched by normalised-title
 * overlap), so picking ANY edition fills genres — not just the AniList card. Best-effort: a vague
 * multi-series query could match loosely, but the user reviews genres before saving. Never overwrites
 * metadata an English candidate already has. */
export function enrichEnglishEditions(english: MangaCandidate[], others: MangaCandidate[]): MangaCandidate[] {
  const ani = others.filter((c) => c.source === 'anilist' && ((c.genres?.length ?? 0) > 0 || (c.relations?.length ?? 0) > 0));
  if (ani.length === 0) return english;
  return english.map((e) => {
    const en = gbNorm(e.title);
    const match = ani.find((a) =>
      [a.title, a.romaji, a.native].some((t) => {
        const an = t ? gbNorm(t) : '';
        if (an === '') return false;
        if (en === an) return true;
        // One is a prefix of the other (handles "Blue Lock — Omnibus" ⊃ "Blue Lock"), but only when the
        // SHORTER title is long enough to be distinctive — otherwise a 1–3 char normalised title would
        // prefix-match unrelated series and graft the wrong genres on.
        return Math.min(en.length, an.length) >= 4 && (en.startsWith(an) || an.startsWith(en));
      }),
    );
    return match ? { ...e, genres: e.genres ?? match.genres ?? null, relations: e.relations ?? match.relations ?? null } : e;
  });
}

// ── Search by AUTHOR (AniList staff) ─────────────────────────────────────────────────────────────
// The title search can't find "Tatsuki Fujimoto" — AniList `media(search:)` only matches titles. AniList
// also indexes creators (`staff`) with their works (`staffMedia`), so a name query returns the works as the
// same candidate shape. No relations here (not needed to pick a work, and they'd blow the query-complexity
// budget across 2 staff × 20 works). Verified live: "fujimoto" → Chainsaw Man, Fire Punch, Look Back, …
const ANILIST_STAFF_QUERY = `query ($search: String) {
  Page(perPage: 2) {
    staff(search: $search, sort: SEARCH_MATCH) {
      name { full native alternative }
      staffMedia(type: MANGA, sort: POPULARITY_DESC, perPage: 20) {
        edges {
          staffRole
          node {
            id
            title { romaji english native }
            format
            status
            volumes
            genres
            coverImage { extraLarge large medium }
            staff(sort: RELEVANCE, perPage: 4) { edges { role node { name { full } } } }
          }
        }
      }
    }
  }
}`;

const MAX_AUTHOR_WORKS = 12;

interface AniStaff {
  name?: { full?: string | null; native?: string | null; alternative?: (string | null)[] | null } | null;
  staffMedia?: { edges?: Array<{ staffRole?: string | null; node?: (AniMedia & { id?: number | null }) | null }> | null } | null;
}

/** Lowercase, accents stripped, split into word tokens ("Ōtomo, Katsuhiro" → ["otomo","katsuhiro"]). */
const nameTokens = (s: string): string[] =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t !== '');

/**
 * Does the query really name this creator? Every query word must START a word of one of the creator's
 * names (full / native / alternative), in any order — "fujimoto", "tatsuki fuji" and "Fujimoto Tatsuki" all
 * match "Tatsuki Fujimoto", but a title query like "blue lock" doesn't drag in some staff member whose
 * name happens to fuzzy-match. AniList's own staff search is fuzzy, so this gate is what keeps noise out.
 */
export function authorNameMatches(query: string, names: readonly (string | null | undefined)[]): boolean {
  const q = nameTokens(query);
  if (q.length === 0) return false;
  return names.some((n) => {
    if (!n) return false;
    const nt = nameTokens(n);
    return q.every((t) => nt.some((w) => w.startsWith(t)));
  });
}

/** Search manga by AUTHOR name → that creator's works (most popular first), each tagged with `matchedAuthor`.
 * Only credits where they wrote or drew it (not assistant/translator/editor); novels dropped (like the title
 * search); a work credited twice (Story + Art) appears once. [] on any error or no real name match. */
export async function searchMangaByAuthor(query: string, fetchImpl: FetchLike = fetch): Promise<MangaCandidate[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  let staff: AniStaff[];
  try {
    const res = await fetchImpl(ANILIST_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: ANILIST_STAFF_QUERY, variables: { search: q } }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { data?: { Page?: { staff?: AniStaff[] } | null } | null };
    staff = body.data?.Page?.staff ?? [];
  } catch {
    return [];
  }

  const out: MangaCandidate[] = [];
  const seen = new Set<number | string>();
  for (const person of staff) {
    const full = person.name?.full ?? null;
    if (!full || !authorNameMatches(q, [full, person.name?.native, ...(person.name?.alternative ?? [])])) continue;
    for (const edge of person.staffMedia?.edges ?? []) {
      const node = edge.node;
      if (!node || (node.format ?? '').toUpperCase() === 'NOVEL') continue;
      const role = (edge.staffRole ?? '').trim().toLowerCase();
      if (!(WRITER_ROLE.test(role) || role.startsWith('art') || role.includes('illustrat'))) continue;
      const key = node.id ?? `${node.title?.english ?? ''}|${node.title?.romaji ?? ''}`;
      if (seen.has(key)) continue;
      const c = aniToCandidate({ ...node, relations: null });
      if (!c) continue;
      seen.add(key);
      out.push({ ...c, author: c.author ?? full, relations: null, matchedAuthor: full });
      if (out.length >= MAX_AUTHOR_WORKS) return out;
    }
  }
  return out;
}

/** Merge title hits with author-search hits: title matches first, then the author's works that aren't
 * already listed (same normalised title). Pure — the route calls both searches in parallel. */
export function mergeTitleAndAuthorHits(titleHits: MangaCandidate[], authorHits: MangaCandidate[], cap: number): MangaCandidate[] {
  // A native-only title normalises to '' (gbNorm keeps a–z/0–9) — key it by the raw title instead, or
  // every Japanese-only title would collide as one "duplicate".
  const key = (c: MangaCandidate): string => gbNorm(c.title) || c.title;
  const have = new Set(titleHits.map(key));
  const extra = authorHits.filter((c) => {
    const k = key(c);
    if (have.has(k)) return false;
    have.add(k);
    return true;
  });
  return [...titleHits, ...extra].slice(0, cap);
}

// ── English volume counts for author-found manga ─────────────────────────────────────────────────
// AniList knows the ORIGINAL (Japanese) count; the shelf tracks English volumes. Instead of an 8-page
// title search per work (≈100 requests for one author), ONE paginated `inauthor:` query collects the
// author's English volumes ("Chainsaw Man, Vol. 19" → series "Chainsaw Man", 19) and each AniList work is
// matched to its series. Standard editions only (an omnibus count would mislabel the single-volume run).
const GB_AUTHOR_PAGE_STARTS = [0, 20, 40, 60, 80, 100];

/** A manga GB title → its series name: "Chainsaw Man, Vol. 18" / "Chainsaw Man Volume 3" / "Fire Punch 2" → the bare name. */
function gbSeriesName(title: string): string {
  const name = title
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[\s,:;–-]*\b(?:vol(?:ume|\.)?|book|tome?)\s*\d+\b.*$/i, '')
    .replace(/[\s,#]+\d{1,3}\s*$/, '')
    .trim();
  return name || title.trim();
}

export interface EnglishCount {
  volumes: number;
  publisher: string | null;
}

/** The author's ENGLISH manga series → highest English volume seen (normalised series name → count). */
export async function englishVolumeCountsByAuthor(author: string, fetchImpl: FetchLike = fetch, apiKey?: string): Promise<Map<string, EnglishCount>> {
  const out = new Map<string, EnglishCount>();
  if (author.trim().length < 3) return out;
  const items = await gbCollect({ q: `inauthor:"${author.trim()}"`, langRestrict: 'en', orderBy: 'newest' }, GB_AUTHOR_PAGE_STARTS, fetchImpl, apiKey);
  for (const it of items) {
    const v = it.volumeInfo ?? {};
    if (!v.title || (v.language ?? 'en') !== 'en') continue; // German/French/Polish editions carry their own numbering
    if (!authorNameMatches(author, v.authors ?? [])) continue;
    const full = `${v.title} ${v.subtitle ?? ''}`.trim();
    if (gbEdition(full) !== 'Standard') continue;
    const key = gbNorm(gbSeriesName(v.title));
    if (!key) continue;
    const vol = gbSeriesVolume(v) ?? gbVolumeNumber(full) ?? 1; // a one-shot ("Look Back") has no number → 1
    const cur = out.get(key);
    const publisher = cur?.publisher && isMangaPublisher(cur.publisher) ? cur.publisher : (v.publisher ?? cur?.publisher ?? null);
    out.set(key, { volumes: Math.max(cur?.volumes ?? 0, vol), publisher });
  }
  return out;
}

/** Put the English count (+ publisher, EN tag) on each author-found work whose English series is known,
 * matched on the exact normalised title (English, then romaji). A work with no English release keeps
 * AniList's original count and no EN tag. Pure. */
export function applyEnglishCounts(works: MangaCandidate[], counts: ReadonlyMap<string, EnglishCount>): MangaCandidate[] {
  if (counts.size === 0) return works;
  return works.map((w) => {
    const keys = [w.title, w.romaji].map((t) => (t ? gbNorm(t) : '')).filter((k) => k.length >= 2);
    // EXACT normalised title only: a prefix match gave "Vagabond: Saigo no Manga-ten" (an art book) the
    // 37-volume count of Vagabond itself (seen live). No English match → keep the original count.
    let hit: EnglishCount | undefined;
    for (const k of keys) if ((hit = counts.get(k))) break;
    return hit ? { ...w, totalVolumes: hit.volumes, publisher: hit.publisher, language: 'en' as const } : w;
  });
}

/** Author-found works with their English counts — one `inauthor:` sweep per distinct matched creator. */
export async function withEnglishCounts(works: MangaCandidate[], fetchImpl: FetchLike = fetch, apiKey?: string): Promise<MangaCandidate[]> {
  const authors = [...new Set(works.map((w) => w.matchedAuthor).filter((a): a is string => !!a))];
  if (authors.length === 0) return works;
  const maps = await Promise.all(authors.map((a) => englishVolumeCountsByAuthor(a, fetchImpl, apiKey)));
  return works.map((w) => {
    const i = authors.indexOf(w.matchedAuthor ?? '');
    return i >= 0 ? applyEnglishCounts([w], maps[i]!)[0]! : w;
  });
}

// ── Plain BOOKS (novels, non-fiction, light novels): Google Books by title AND author ────────────────
// The manga path can't find a novel: AniList/Jikan are manga-only and the Google Books edition search keeps
// only manga publishers. A book is ONE work published in many editions/languages ("Stoner": NYRB, Random
// House, Swedish, German…), so results are grouped per work (normalised title), the English edition is the
// representative, and works with the most editions rank first — for "John Williams" that lifts Stoner /
// Augustus / Butcher's Crossing above the dozens of other authors who share the name.
const BOOK_PAGE_STARTS = [0, 20];

/** "Butcher's crossing / druk 1", "Butcher's Crossing (Spanish Edition)" → "Butcher's crossing". */
const cleanBookTitle = (t: string): string => t.replace(/\s+\/\s+.*$/, '').replace(/\s*\([^)]*\)/g, '').trim() || t.trim();
/** Only EXPLICIT markers count as a volume for books ("Vol. 3", "Book 2") — never a bare trailing number
 * ("Fahrenheit 451" is not volume 451). */
const BOOK_VOLUME = /\b(?:vol(?:ume|\.)?|book|tome?)\s*(\d+)\b/i;
const stripBookVolume = (t: string): string => t.replace(/[\s,:;–-]*\b(?:vol(?:ume|\.)?|book|tome?)\s*\d+\b.*$/i, '').trim() || t;

function groupBookWorks(items: GBookItem[], matchedQuery: string | null): MangaCandidate[] {
  const groups = new Map<string, { first: number; infos: GBookVolumeInfo[]; vols: number[] }>();
  items.forEach((it, idx) => {
    const v = it.volumeInfo ?? {};
    if (!v.title) return;
    const clean = cleanBookTitle(v.title);
    const name = stripBookVolume(clean);
    const key = gbNorm(name) || name.toLowerCase();
    const g = groups.get(key) ?? { first: idx, infos: [], vols: [] };
    g.infos.push(v);
    const vol = gbSeriesVolume(v) ?? Number(BOOK_VOLUME.exec(`${clean} ${v.subtitle ?? ''}`)?.[1] ?? NaN);
    if (Number.isFinite(vol) && vol > 0) g.vols.push(vol);
    groups.set(key, g);
  });
  // A full-name query ("John Williams", 2+ words) is almost surely an AUTHOR: their own works outrank books
  // merely titled after the name (a biography). A one-word query ("Stoner", "Dune") is ranked on editions alone.
  const byName = matchedQuery != null && nameTokens(matchedQuery).length >= 2;
  const isAuthors = (g: { infos: GBookVolumeInfo[] }) => matchedQuery != null && g.infos.some((v) => authorNameMatches(matchedQuery, v.authors ?? []));
  const score = (g: { infos: GBookVolumeInfo[] }) => g.infos.length * (byName && isAuthors(g) ? 3 : 1);
  return [...groups.values()]
    .sort((a, b) => score(b) - score(a) || a.first - b.first)
    .map((g) => {
      const withCover = (v: GBookVolumeInfo) => !!(v.imageLinks?.thumbnail ?? v.imageLinks?.smallThumbnail);
      // The work's author = the most common first author across its editions ("Dune" also matches a graphic
      // novel credited to Brian Herbert — Frank Herbert still wins); the representative edition has that author.
      const tally = new Map<string, number>();
      for (const v of g.infos) if (v.authors?.[0]) tally.set(v.authors[0], (tally.get(v.authors[0]) ?? 0) + 1);
      const mainAuthor = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      const byMain = g.infos.filter((v) => mainAuthor == null || v.authors?.[0] === mainAuthor);
      const rep = byMain.find((v) => v.language === 'en' && withCover(v)) ?? byMain.find((v) => v.language === 'en') ?? byMain.find(withCover) ?? byMain[0]!;
      const coverFrom = withCover(rep) ? rep : g.infos.find(withCover);
      const total = g.vols.length > 0 ? Math.max(...g.vols) : 1;
      const genres = [...new Set(g.infos.flatMap((v) => v.categories ?? []))].slice(0, 3);
      // Tag ✎ only when this work's author really IS the query — a title hit ("Stoner") stays untagged.
      const matched = matchedQuery ? ((rep.authors ?? []).find((a) => authorNameMatches(matchedQuery, [a])) ?? null) : null;
      const c: MangaCandidate = {
        title: stripBookVolume(cleanBookTitle(rep.title!)),
        romaji: null,
        native: null,
        author: mainAuthor,
        totalVolumes: total,
        isOngoing: false,
        isSeries: total > 1,
        coverUrl: gbCover(coverFrom?.imageLinks?.thumbnail ?? coverFrom?.imageLinks?.smallThumbnail),
        source: 'googlebooks',
        publisher: rep.publisher ?? null,
        language: rep.language === 'en' ? 'en' : null,
        genres: genres.length > 0 ? genres : null,
      };
      return matched ? { ...c, matchedAuthor: matched } : c;
    });
}

/** Search plain books by TITLE and AUTHOR in one go (Google Books, 0 tokens): title matches first, then the
 * author's works (tagged `matchedAuthor`). Author results must really be BY that name — a "Stoner (Book
 * Analysis)" by Bright Summaries is dropped. [] on quota/error. */
export async function searchBooks(query: string, fetchImpl: FetchLike = fetch, apiKey?: string): Promise<MangaCandidate[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const [byTitle, byAuthor] = await Promise.all([
    gbCollect({ q: `intitle:"${q}"` }, BOOK_PAGE_STARTS, fetchImpl, apiKey),
    q.length >= 3 ? gbCollect({ q: `inauthor:"${q}"` }, BOOK_PAGE_STARTS, fetchImpl, apiKey) : Promise.resolve([]),
  ]);
  const qn = gbNorm(q);
  // ONE pool, grouped and ranked together by edition count: for an author query the author's real works
  // (many editions) outrank books merely titled after the name (a "John Williams" biography), and for a
  // title query the book itself outranks one-off namesakes.
  const seen = new Set<string>();
  const pool = [
    ...byTitle.filter((it) => gbNorm(cleanBookTitle(it.volumeInfo?.title ?? '')).includes(qn)),
    ...byAuthor.filter((it) => authorNameMatches(q, it.volumeInfo?.authors ?? [])),
  ].filter((it) => {
    const key = it.id ?? `${it.volumeInfo?.title ?? ''}|${it.volumeInfo?.subtitle ?? ''}`;
    return seen.has(key) ? false : (seen.add(key), true);
  });
  return groupBookWorks(pool, q).slice(0, 16);
}

/** Search manga metadata by title → a ranked list of candidates (best match first).
 * Tries AniList; falls back to Jikan only if AniList returns nothing. Empty array =
 * neither knows it. */
export async function searchManga(title: string, fetchImpl: FetchLike = fetch): Promise<MangaCandidate[]> {
  const q = title.trim();
  if (q.length < 2) return [];
  const ani = await fromAniList(q, fetchImpl);
  if (ani.length > 0) return ani;
  return fromJikan(q, fetchImpl);
}
