import type { CopyPatch, SeriesPatch, VolumePatch } from '@solace/core';
import { READ_STATUSES, SERIES_READING_STATUSES, SERIES_STATUSES, SERIES_TYPES, VOLUME_FORMATS } from '@solace/core';
import {
  enrichEnglishEditions,
  GOOGLE_BOOKS_KEY_PATTERN,
  GOOGLE_BOOKS_KEY_SETTING,
  mergeTitleAndAuthorHits,
  priceTablePath,
  quoteNextVolume,
  readPriceTable,
  recordVolumeBought,
  resolveBooksKey,
  searchBooks,
  searchManga,
  searchMangaByAuthor,
  searchMangaEnglishEditions,
  testBooksKey,
  withEnglishCounts,
} from '@solace/data';
import type { Deps } from '../deps.ts';
import { asBadRequest, BadRequest, json, jsonBody, requireId, type Body, type Routes } from '../http.ts';
import { inEnum, intNonNeg, isoOf, need, num, optPosInt, posInt, ranged, readDir, str, strArr } from '../validate.ts';

/** ARCHIVES (manga + books + LN): the cover-picker lookup, the Series/Volume/Copy/Purchase model
 *  (migration v13), and the Next-to-buy "Bought vol N?" flow. No recompute — none of it feeds the stats. */
export function archivesRoutes({ repo, clock, fetch: fetchImpl = fetch }: Deps): Routes {
  // Read per request: the file is small and a price-table edit applies without a restart.
  const priceTable = () => readPriceTable(priceTablePath());

  // A copy's read_date: an explicit valid ISO date wins (an invalid one is a 400, null/'' clears it);
  // otherwise status 'read' stamps today's local date and any other status leaves it NULL.
  const readDateOf = (b: Body, status: string): string | null => {
    if ('readDate' in b) {
      const raw = b['readDate'];
      return raw == null || raw === '' ? null : need(isoOf(raw), 'readDate must be YYYY-MM-DD');
    }
    return status === 'read' ? clock.today() : null;
  };

  // The Google Books key status. NEVER the key itself: `last4` is the only part that may be shown.
  const keyStatus = async () => {
    const eff = await resolveBooksKey(repo);
    return eff ? { configured: true, source: eff.source, last4: eff.key.slice(-4) } : { configured: false, source: null };
  };

  return {
    // Metadata lookup for the add-a-series form: a LIST of candidates (covers + native/romaji titles) so the UI
    // shows a cover picker. No DB write — pure prefill.
    '/api/manga-lookup': {
      GET: async ({ res, url }) => {
        const m = /[?&]title=([^&]*)/.exec(url);
        // decodeURIComponent throws URIError on malformed input (a lone `%`, `%ZZ`): a 400, not a crash.
        let title = '';
        try {
          title = m && m[1] != null ? decodeURIComponent(m[1]).trim() : '';
        } catch {
          throw new BadRequest('bad title encoding');
        }
        if (title.length < 2) throw new BadRequest('need ?title= (min 2 chars)');
        // Every lookup failure is a generic message: the Books lookup URL embeds the API key, never echo it.
        try {
          json(res, 200, await lookup(title, /[?&]kind=book(?:&|$)/.test(url), fetchImpl, (await resolveBooksKey(repo))?.key));
        } catch {
          json(res, 500, { error: 'lookup failed' });
        }
      },
    },

    // The Google Books API key, settable in the app (.env wins, see resolveBooksKey). Never logged, never returned.
    '/api/settings/google-books': {
      GET: async ({ res }) => json(res, 200, await keyStatus()),
      PUT: async ({ req, res }) => {
        const b = await jsonBody(req);
        const key = typeof b['key'] === 'string' ? b['key'].trim() : '';
        if (!GOOGLE_BOOKS_KEY_PATTERN.test(key)) {
          throw new BadRequest('That is not a Google Books key. It must be a Google Cloud API key starting with "AIza" (39 characters); AI Studio / Gemini keys ("AQ.…") do not work.');
        }
        await repo.setSetting(GOOGLE_BOOKS_KEY_SETTING, key, new Date().toISOString());
        json(res, 200, await keyStatus());
      },
      DELETE: async ({ res }) => {
        await repo.deleteSetting(GOOGLE_BOOKS_KEY_SETTING);
        json(res, 200, await keyStatus());
      },
    },

    '/api/settings/google-books/test': {
      POST: async ({ res }) => {
        const eff = await resolveBooksKey(repo);
        json(res, 200, eff ? await testBooksKey(eff.key, fetchImpl) : { ok: false, message: 'no key' });
      },
    },

    '/api/series': {
      POST: async ({ req, res }) => {
        const b = await jsonBody(req);
        const canonicalTitle = need(str(b['canonicalTitle']), 'need a canonicalTitle');
        // Validate the ownedVolumes/readVolumes convenience fields UP FRONT (before creating the Series),
        // so a nonsense count never leaves a half-created series behind.
        const ownedVolumes = 'ownedVolumes' in b ? need(intNonNeg(b['ownedVolumes']), 'ownedVolumes must be a non-negative integer') : null;
        const readVolumes = 'readVolumes' in b ? need(intNonNeg(b['readVolumes']), 'readVolumes must be a non-negative integer') : null;
        const type = inEnum(b['type'], SERIES_TYPES) ?? 'manga';
        const series = await asBadRequest(() =>
          repo.addSeries({
            canonicalTitle,
            author: str(b['author']),
            altTitles: strArr(b['altTitles']),
            type,
            anilistId: intNonNeg(b['anilistId']),
            mangadexId: str(b['mangadexId']),
            mangaupdatesId: str(b['mangaupdatesId']),
            malId: intNonNeg(b['malId']),
            publicationStatus: inEnum(b['publicationStatus'], SERIES_STATUSES) ?? 'completed',
            readingStatus: inEnum(b['readingStatus'], SERIES_READING_STATUSES) ?? 'active',
            // A book is a single-volume Series, so its finished-ness must be derivable: default
            // totalVolumesKnown to 1 (mirrors add-book-quick) unless the caller supplied one.
            // Without this a fully-read book can NEVER derive finished (seriesFinished needs a total).
            totalVolumesKnown: 'totalVolumesKnown' in b ? intNonNeg(b['totalVolumesKnown']) : type === 'book' ? 1 : null,
            englishPublisher: str(b['englishPublisher']),
            readingDirection: readDir(b['readingDirection']),
            coverUrl: str(b['coverUrl']),
            genres: strArr(b['genres']),
            notes: str(b['notes']),
            sourceHash: str(b['sourceHash']),
          }),
        );
        // Placeholder Volume+Copy rows (mirrors migration v13's backfill semantics + the old
        // add-manga --owned/--read). Already validated above; if an insert somehow throws we still
        // report the created series id rather than leaving the caller without it.
        try {
          const newVolume = (volumeNumber: number | null) =>
            repo.addVolume({ seriesId: series.id, volumeNumber, title: null, isbn13: null, isbn10: null, publisher: null, releaseDateEn: null, releaseDateJp: null, pageCount: null, coverUrl: null, coverSource: null, format: 'single' });
          const newCopy = (volumeId: number, owned: boolean, read: boolean) =>
            repo.addCopy({ volumeId, owned, acquiredDate: null, condition: null, readStatus: read ? 'read' : 'unread', readDate: null, rating: null, notes: null, purchaseId: null });
          if (type === 'book') {
            // A book ALWAYS gets its single volume+copy, even when neither field is supplied.
            const vol = await newVolume(null);
            await newCopy(vol.id, (ownedVolumes ?? 1) > 0, (readVolumes ?? 0) > 0);
          } else {
            // manga/LN: numbered volumes 1..max(owned, read); NONE when both are 0/absent.
            const owned = ownedVolumes ?? 0;
            const read = readVolumes ?? 0;
            for (let i = 1; i <= Math.max(owned, read); i++) {
              const vol = await newVolume(i);
              await newCopy(vol.id, i <= owned, i <= read);
            }
          }
        } catch (e) {
          console.error('[api] series placeholder volume/copy creation failed', e);
        }
        json(res, 200, { ok: true, id: series.id });
      },

      PATCH: async ({ req, res, url }) => {
        const id = requireId(url);
        const b = await jsonBody(req);
        const p: SeriesPatch = {};
        const canonicalTitle = str(b['canonicalTitle']);
        if (canonicalTitle) p.canonicalTitle = canonicalTitle;
        if ('author' in b) p.author = str(b['author']);
        if ('altTitles' in b) p.altTitles = strArr(b['altTitles']);
        const type = inEnum(b['type'], SERIES_TYPES);
        if (type) p.type = type;
        if ('anilistId' in b) p.anilistId = intNonNeg(b['anilistId']);
        if ('mangadexId' in b) p.mangadexId = str(b['mangadexId']);
        if ('mangaupdatesId' in b) p.mangaupdatesId = str(b['mangaupdatesId']);
        if ('malId' in b) p.malId = intNonNeg(b['malId']);
        const publicationStatus = inEnum(b['publicationStatus'], SERIES_STATUSES);
        if (publicationStatus) p.publicationStatus = publicationStatus;
        const readingStatus = inEnum(b['readingStatus'], SERIES_READING_STATUSES);
        if (readingStatus) p.readingStatus = readingStatus;
        if ('totalVolumesKnown' in b) p.totalVolumesKnown = intNonNeg(b['totalVolumesKnown']);
        if ('englishPublisher' in b) p.englishPublisher = str(b['englishPublisher']);
        if ('readingDirection' in b) p.readingDirection = readDir(b['readingDirection']);
        if ('coverUrl' in b) p.coverUrl = str(b['coverUrl']);
        if ('genres' in b) p.genres = strArr(b['genres']);
        if ('notes' in b) p.notes = str(b['notes']);
        if ('sourceHash' in b) p.sourceHash = str(b['sourceHash']);
        const updated = await asBadRequest(() => repo.updateSeries(id, p));
        if (updated) json(res, 200, { ok: true });
        else json(res, 404, { error: 'not found' });
      },

      // Cascades the series' volumes + copies (ON DELETE CASCADE).
      DELETE: async ({ res, url }) => {
        json(res, 200, { ok: true, deleted: await repo.deleteSeries(requireId(url)) });
      },
    },

    '/api/volumes': {
      POST: async ({ req, res }) => {
        const b = await jsonBody(req);
        const seriesId = need(posInt(b['seriesId']), 'need a positive-integer seriesId');
        const volume = await asBadRequest(() =>
          repo.addVolume({
            seriesId,
            volumeNumber: num(b['volumeNumber']),
            title: str(b['title']),
            isbn13: str(b['isbn13']),
            isbn10: str(b['isbn10']),
            publisher: str(b['publisher']),
            releaseDateEn: isoOf(b['releaseDateEn']),
            releaseDateJp: isoOf(b['releaseDateJp']),
            pageCount: intNonNeg(b['pageCount']),
            coverUrl: str(b['coverUrl']),
            coverSource: str(b['coverSource']),
            format: inEnum(b['format'], VOLUME_FORMATS) ?? 'single',
          }),
        );
        json(res, 200, { ok: true, id: volume.id });
      },

      PATCH: async ({ req, res, url }) => {
        const id = requireId(url);
        const b = await jsonBody(req);
        const p: VolumePatch = {};
        const seriesId = posInt(b['seriesId']);
        if (seriesId) p.seriesId = seriesId;
        if ('volumeNumber' in b) p.volumeNumber = num(b['volumeNumber']);
        if ('title' in b) p.title = str(b['title']);
        if ('isbn13' in b) p.isbn13 = str(b['isbn13']);
        if ('isbn10' in b) p.isbn10 = str(b['isbn10']);
        if ('publisher' in b) p.publisher = str(b['publisher']);
        if ('releaseDateEn' in b) p.releaseDateEn = isoOf(b['releaseDateEn']);
        if ('releaseDateJp' in b) p.releaseDateJp = isoOf(b['releaseDateJp']);
        if ('pageCount' in b) p.pageCount = intNonNeg(b['pageCount']);
        if ('coverUrl' in b) p.coverUrl = str(b['coverUrl']);
        if ('coverSource' in b) p.coverSource = str(b['coverSource']);
        const format = inEnum(b['format'], VOLUME_FORMATS);
        if (format) p.format = format;
        const updated = await asBadRequest(() => repo.updateVolume(id, p));
        if (updated) json(res, 200, { ok: true });
        else json(res, 404, { error: 'not found' });
      },

      DELETE: async ({ res, url }) => {
        json(res, 200, { ok: true, deleted: await repo.deleteVolume(requireId(url)) });
      },
    },

    '/api/copies': {
      PATCH: async ({ req, res, url }) => {
        const id = requireId(url);
        const b = await jsonBody(req);
        const p: CopyPatch = {};
        const volumeId = posInt(b['volumeId']);
        if (volumeId) p.volumeId = volumeId;
        if ('owned' in b) p.owned = b['owned'] === true;
        if ('acquiredDate' in b) p.acquiredDate = isoOf(b['acquiredDate']);
        if ('condition' in b) p.condition = str(b['condition']);
        const readStatus = inEnum(b['readStatus'], READ_STATUSES);
        if (readStatus) {
          p.readStatus = readStatus;
          p.readDate = readDateOf(b, readStatus);
        } else if ('readDate' in b) p.readDate = readDateOf(b, 'unread');
        if ('rating' in b) p.rating = ranged(b, 'rating', 1, 5);
        if ('notes' in b) p.notes = str(b['notes']);
        if ('purchaseId' in b) p.purchaseId = optPosInt(b, 'purchaseId');
        const updated = await asBadRequest(() => repo.updateCopy(id, p));
        if (updated) json(res, 200, { ok: true });
        else json(res, 404, { error: 'not found' });
      },
    },

    // "Did you buy this?" from the Next-to-buy card: GET quotes the series' next volume (price-table
    // estimate), POST marks one volume owned + records its Purchase (a typed price = a real receipt).
    '/api/buy-volume': {
      GET: async ({ res, url }) => {
        const seriesId = need(posInt(Number(new URL(url, 'http://localhost').searchParams.get('seriesId'))), 'need ?seriesId=');
        const quote = await quoteNextVolume(repo, seriesId, priceTable());
        if (quote) json(res, 200, quote);
        else json(res, 404, { error: 'not found' });
      },

      POST: async ({ req, res }) => {
        const b = await jsonBody(req);
        const seriesId = need(posInt(b['seriesId']), 'need a positive-integer seriesId');
        const volumeNumber = need(posInt(b['volumeNumber']), 'need a positive-integer volumeNumber');
        // A typed price is a real receipt: positive INTEGER cents. Absent/null → the price-table estimate.
        const priceCents = optPosInt(b, 'priceCents', 'priceCents must be a positive integer of cents');
        const r = await recordVolumeBought(repo, { seriesId, volumeNumber, priceCents, date: clock.today(), table: priceCents == null ? priceTable() : null });
        if (r.ok) json(res, 200, r);
        else if (r.reason === 'not_found') json(res, 404, { error: 'not found' });
        else json(res, 409, { error: `vol ${volumeNumber} is already owned` });
      },
    },
  };
}

/** Cover-picker candidates. `book` → Google Books by title AND author (the manga sources can't find a novel).
 *  Otherwise English print editions (Google Books: EN volume count + omnibus/deluxe) first, then the AniList/
 *  Jikan canonical entries, then the same query as an AUTHOR search (AniList staff) — all free. */
async function lookup(title: string, isBook: boolean, fetchImpl: typeof fetch, booksKey: string | undefined): Promise<{ found: boolean; candidates: unknown[] }> {
  // Books needs a DEDICATED Google Cloud API key (env or saved in the app) — the shared keyless quota 429s, and an
  // AI-Studio/Gemini key is rejected (401, wrong key type). On any failure the adapters return [].
  if (isBook) {
    const hits = await searchBooks(title, fetchImpl, booksKey);
    return { found: hits.length > 0, candidates: hits };
  }
  const [english, meta, byAuthor] = await Promise.all([
    searchMangaEnglishEditions(title, fetchImpl, booksKey),
    searchManga(title),
    // Author works come from AniList with the JAPANESE count — swap in the English count per series.
    searchMangaByAuthor(title).then((works) => withEnglishCounts(works, fetchImpl, booksKey)),
  ]);
  // Genres/relations come only from AniList — copy them onto same-series English editions so picking an EN
  // card still fills genres. Author works are appended after the title hits, only when the query names a creator.
  const hits = mergeTitleAndAuthorHits([...enrichEnglishEditions(english, meta), ...meta].slice(0, 8), byAuthor, 16);
  if (hits.length > 0) return { found: true, candidates: hits };
  return { found: false, candidates: [] };
}
