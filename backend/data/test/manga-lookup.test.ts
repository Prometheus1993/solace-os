import { describe, expect, it } from 'vitest';
import { applyEnglishCounts, authorNameMatches, englishVolumeCountsByAuthor, mergeTitleAndAuthorHits, searchBooks, searchManga, searchMangaByAuthor, searchMangaEnglishEditions, enrichEnglishEditions, type MangaCandidate } from '../src/index.ts';

// A scriptable fake fetch: route by URL to a canned { ok, body } response.
function fakeFetch(routes: (url: string) => { ok: boolean; body: unknown }): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const { ok, body } = routes(url);
    return { ok, json: async () => body } as Response;
  }) as unknown as typeof fetch;
}

const aniPage = (media: unknown[]) => ({ data: { Page: { media } } });

describe('searchManga', () => {
  it('maps an AniList FINISHED series (Story author, real volume count → not ongoing)', async () => {
    const fetchImpl = fakeFetch((url) => {
      if (url.includes('anilist')) {
        return {
          ok: true,
          body: aniPage([
            {
              title: { romaji: 'DEATH NOTE', english: 'Death Note', native: 'デスノート' },
              format: 'MANGA',
              status: 'FINISHED',
              volumes: 12,
              coverImage: { extraLarge: 'http://cover/dn.jpg', large: null },
              staff: {
                edges: [
                  { role: 'Story', node: { name: { full: 'Tsugumi Ooba' } } },
                  { role: 'Art', node: { name: { full: 'Takeshi Obata' } } },
                ],
              },
            },
          ]),
        };
      }
      return { ok: true, body: { data: [] } };
    });
    const list = await searchManga('death note', fetchImpl);
    expect(list).toHaveLength(1);
    const r = list[0]!;
    expect(r.source).toBe('anilist');
    expect(r.title).toBe('Death Note');
    expect(r.native).toBe('デスノート');
    expect(r.author).toBe('Tsugumi Ooba'); // the Story edge, not Art
    expect(r.totalVolumes).toBe(12);
    expect(r.isOngoing).toBe(false); // FINISHED
    expect(r.isSeries).toBe(true);
    expect(r.coverUrl).toBe('http://cover/dn.jpg');
  });

  it('returns ALL AniList candidates (best match first) for a cover picker', async () => {
    const fetchImpl = fakeFetch((url) =>
      url.includes('anilist')
        ? {
            ok: true,
            body: aniPage([
              { title: { romaji: 'SLAM DUNK', english: 'Slam Dunk', native: 'スラムダンク' }, format: 'MANGA', status: 'FINISHED', volumes: 31, coverImage: { extraLarge: 'http://c/sd.jpg' }, staff: { edges: [{ role: 'Story & Art', node: { name: { full: 'Takehiko Inoue' } } }] } },
              { title: { romaji: 'REAL', english: null, native: 'リアル' }, format: 'MANGA', status: 'RELEASING', volumes: null, coverImage: { large: 'http://c/real.jpg' }, staff: { edges: [{ role: 'Story & Art', node: { name: { full: 'Takehiko Inoue' } } }] } },
            ]),
          }
        : { ok: true, body: { data: [] } },
    );
    const list = await searchManga('slam dunk', fetchImpl);
    expect(list.map((c) => c.title)).toEqual(['Slam Dunk', 'REAL']);
    expect(list[1]!.title).toBe('REAL'); // falls back to romaji when english is null
    expect(list[1]!.isOngoing).toBe(true); // RELEASING
    expect(list[1]!.totalVolumes).toBeNull(); // never coerced to 0
  });

  it('flags a ONE_SHOT (isSeries=false)', async () => {
    const fetchImpl = fakeFetch((url) =>
      url.includes('anilist')
        ? { ok: true, body: aniPage([{ title: { romaji: 'Goodbye, Eri', english: null, native: null }, format: 'ONE_SHOT', status: 'FINISHED', volumes: 1, coverImage: {}, staff: { edges: [] } }]) }
        : { ok: true, body: { data: [] } },
    );
    const list = await searchManga('goodbye eri', fetchImpl);
    expect(list[0]!.isSeries).toBe(false);
  });

  it('falls back to Jikan when AniList finds nothing, flipping the "Surname, Given" name', async () => {
    const fetchImpl = fakeFetch((url) => {
      if (url.includes('anilist')) return { ok: true, body: aniPage([]) }; // not found
      return {
        ok: true,
        body: {
          data: [
            {
              title: 'Fullmetal Alchemist',
              title_english: 'Fullmetal Alchemist',
              title_japanese: '鋼の錬金術師',
              type: 'Manga',
              volumes: 27,
              status: 'Finished',
              authors: [{ name: 'Arakawa, Hiromu' }],
              images: { jpg: { large_image_url: 'http://mal/fma.jpg' } },
            },
          ],
        },
      };
    });
    const list = await searchManga('fullmetal alchemist', fetchImpl);
    expect(list).toHaveLength(1);
    const r = list[0]!;
    expect(r.source).toBe('jikan');
    expect(r.author).toBe('Hiromu Arakawa'); // "Arakawa, Hiromu" → "Hiromu Arakawa"
    expect(r.native).toBe('鋼の錬金術師');
    expect(r.totalVolumes).toBe(27);
    expect(r.isOngoing).toBe(false); // Finished
  });

  it('returns an empty array when neither source has a match', async () => {
    const fetchImpl = fakeFetch((url) => (url.includes('anilist') ? { ok: true, body: aniPage([]) } : { ok: true, body: { data: [] } }));
    expect(await searchManga('zzzznotarealtitle', fetchImpl)).toEqual([]);
  });

  it('skips lookups for too-short titles', async () => {
    let called = false;
    const fetchImpl = fakeFetch(() => {
      called = true;
      return { ok: true, body: aniPage([]) };
    });
    expect(await searchManga('a', fetchImpl)).toEqual([]);
    expect(called).toBe(false);
  });

  it('maps AniList genres and whitelists related works (one-shots/prequels/sequels), dropping anime/novel/meta', async () => {
    const node = (english: string, format: string) => ({ title: { romaji: null, english, native: null }, format, coverImage: { large: `http://c/${english}.jpg` } });
    const fetchImpl = fakeFetch((url) =>
      url.includes('anilist')
        ? {
            ok: true,
            body: aniPage([
              {
                title: { romaji: 'BLUE LOCK', english: 'Blue Lock', native: 'ブルーロック' },
                format: 'MANGA',
                status: 'RELEASING',
                volumes: null,
                genres: ['Sports', 'Drama'],
                coverImage: { extraLarge: 'http://c/bl.jpg' },
                staff: { edges: [{ role: 'Story', node: { name: { full: 'Muneyuki Kaneshiro' } } }] },
                relations: {
                  edges: [
                    { relationType: 'PREQUEL', node: node('Blue Lock: Episode Nagi', 'MANGA') },
                    { relationType: 'SIDE_STORY', node: node('A Blue Lock One-Shot', 'ONE_SHOT') }, // kept: whitelisted type
                    { relationType: 'OTHER', node: node('Bonus One-Shot', 'ONE_SHOT') }, // dropped: OTHER isn't a reading-order relation, even as a one-shot
                    { relationType: 'CHARACTER', node: node('Jump Super Stars', 'ONE_SHOT') }, // dropped: CHARACTER crossover one-shot (junk)
                    { relationType: 'ADAPTATION', node: node('Blue Lock (Anime)', 'TV') }, // dropped: anime
                    { relationType: 'SOURCE', node: node('A Light Novel', 'NOVEL') }, // dropped: novel
                    { relationType: 'CHARACTER', node: node('Some Character Link', 'MANGA') }, // dropped: meta type
                  ],
                },
              },
            ]),
          }
        : { ok: true, body: { data: [] } },
    );
    const c = (await searchManga('blue lock', fetchImpl))[0]!;
    expect(c.genres).toEqual(['Sports', 'Drama']);
    const rel = c.relations ?? [];
    expect(rel.map((r) => r.title)).toEqual(['Blue Lock: Episode Nagi', 'A Blue Lock One-Shot']); // OTHER/CHARACTER one-shots dropped
    expect(rel.find((r) => r.title === 'Blue Lock: Episode Nagi')?.relationType).toBe('PREQUEL');
    expect(rel.every((r) => r.coverUrl?.startsWith('http://c/'))).toBe(true);
  });
});

// Google Books "items" with the minimal volumeInfo shape the adapter reads.
const gbItem = (title: string, publisher: string, opts: { authors?: string[]; cover?: string } = {}) => ({
  volumeInfo: {
    title,
    publisher,
    language: 'en',
    authors: opts.authors ?? ['Muneyuki Kaneshiro'],
    imageLinks: { thumbnail: opts.cover ?? 'http://books.google.com/books/content?id=x&zoom=1&edge=curl' },
  },
});
const gbBody = (items: unknown[]) => ({ items });
const isGB = (url: string) => url.includes('googleapis.com/books');

describe('searchMangaEnglishEditions (Google Books)', () => {
  it('groups English standard volumes → count = highest volume, not the JP total', async () => {
    const fetchImpl = fakeFetch((url) =>
      isGB(url) ? { ok: true, body: gbBody([gbItem('Blue Lock 3', 'Kodansha Comics'), gbItem('Blue Lock 1', 'Kodansha Comics'), gbItem('Blue Lock 2', 'Kodansha Comics')]) } : { ok: true, body: {} },
    );
    const list = await searchMangaEnglishEditions('blue lock', fetchImpl);
    expect(list).toHaveLength(1);
    const c = list[0]!;
    expect(c.source).toBe('googlebooks');
    expect(c.language).toBe('en');
    expect(c.edition).toBe('Standard');
    expect(c.totalVolumes).toBe(3); // English releases, NOT the 31 JP volumes
    expect(c.publisher).toBe('Kodansha Comics');
    expect(c.title).toBe('Blue Lock');
    expect(c.coverUrl).toMatch(/^https:/); // upgraded, no edge=curl
    expect(c.coverUrl).not.toMatch(/edge=curl/);
  });

  it('splits standard vs omnibus/3-in-1 into separate candidates (standard first)', async () => {
    const fetchImpl = fakeFetch((url) =>
      isGB(url)
        ? {
            ok: true,
            body: gbBody([
              gbItem('Naruto, Vol. 1', 'VIZ Media'),
              gbItem('Naruto, Vol. 2', 'VIZ Media'),
              gbItem('Naruto (3-in-1 Edition), Vol. 1', 'VIZ Media'),
              gbItem('Naruto (3-in-1 Edition), Vol. 5', 'VIZ Media'),
            ]),
          }
        : { ok: true, body: {} },
    );
    const list = await searchMangaEnglishEditions('naruto', fetchImpl);
    expect(list[0]!.edition).toBe('Standard');
    expect(list.find((c) => c.edition === 'Standard')?.totalVolumes).toBe(2);
    const omni = list.find((c) => c.edition === '3-in-1');
    expect(omni?.totalVolumes).toBe(5); // the "3-in-1" token is NOT read as volume 3
    expect(omni?.title).toBe('Naruto — 3-in-1');
  });

  it('drops noise: unknown-publisher entries with no volume signal', async () => {
    const fetchImpl = fakeFetch((url) =>
      isGB(url) ? { ok: true, body: gbBody([gbItem('Blue Lock 1', 'Kodansha Comics'), gbItem('Blue Lock: The Unofficial Fan Companion', 'Random House')]) } : { ok: true, body: {} },
    );
    const list = await searchMangaEnglishEditions('blue lock', fetchImpl);
    expect(list).toHaveLength(1);
    expect(list[0]!.totalVolumes).toBe(1); // the fan companion is filtered out
  });

  it('degrades to [] on a quota error (so the lookup still shows AniList)', async () => {
    const fetchImpl = fakeFetch(() => ({ ok: false, body: { error: { code: 429 } } }));
    expect(await searchMangaEnglishEditions('blue lock', fetchImpl)).toEqual([]);
  });

  it('skips too-short queries', async () => {
    let called = false;
    const fetchImpl = fakeFetch(() => {
      called = true;
      return { ok: true, body: gbBody([]) };
    });
    expect(await searchMangaEnglishEditions('a', fetchImpl)).toEqual([]);
    expect(called).toBe(false);
  });

  it("prefers Google Books' own series volume (bookDisplayNumber) over the title", async () => {
    // Cover titles are messy ("Blue Lock" with no number), but seriesInfo carries the real index.
    const item = (display: string) => ({
      id: `bl-${display}`,
      volumeInfo: { title: 'Blue Lock', publisher: 'Kodansha Comics', language: 'en', authors: ['Muneyuki Kaneshiro'], seriesInfo: { bookDisplayNumber: display } },
    });
    const fetchImpl = fakeFetch((url) => (isGB(url) ? { ok: true, body: gbBody([item('1'), item('36')]) } : { ok: true, body: {} }));
    const list = await searchMangaEnglishEditions('blue lock', fetchImpl);
    expect(list).toHaveLength(1);
    expect(list[0]!.totalVolumes).toBe(36); // from bookDisplayNumber, not the un-numbered title
  });

  it('aggregates volumes ACROSS pages (the highest English volume of a long completed run)', async () => {
    // The newest page rarely holds the back-catalogue's max — only paginating finds vol 70.
    const startIndex = (url: string) => Number(new URL(url).searchParams.get('startIndex') ?? '0');
    const fetchImpl = fakeFetch((url) => {
      if (!isGB(url)) return { ok: true, body: {} };
      const si = startIndex(url);
      if (si === 0) return { ok: true, body: gbBody([gbItem('Naruto, Vol. 1', 'VIZ Media'), gbItem('Naruto, Vol. 2', 'VIZ Media')]) };
      if (si === 20) return { ok: true, body: gbBody([gbItem('Naruto, Vol. 70', 'VIZ Media')]) };
      return { ok: true, body: gbBody([]) };
    });
    const list = await searchMangaEnglishEditions('naruto', fetchImpl);
    expect(list[0]!.totalVolumes).toBe(70); // page 0 alone would say 2
  });

  it('drops an edition matched by name but with no countable volume (no null candidates)', async () => {
    const fetchImpl = fakeFetch((url) =>
      isGB(url) ? { ok: true, body: gbBody([gbItem('Bleach, Vol. 1', 'VIZ Media'), gbItem('Bleach Complete Box Set', 'VIZ Media')]) } : { ok: true, body: {} },
    );
    const list = await searchMangaEnglishEditions('bleach', fetchImpl);
    expect(list).toHaveLength(1); // no "Bleach — Box Set" candidate with totalVolumes=null
    expect(list[0]!.edition).toBe('Standard');
    expect(list.every((c) => c.totalVolumes != null)).toBe(true);
  });

  it('picks the real manga publisher over a reseller mislabel', async () => {
    const fetchImpl = fakeFetch((url) =>
      isGB(url) ? { ok: true, body: gbBody([gbItem('Attack on Titan 1', 'National Geographic Books'), gbItem('Attack on Titan 2', 'Kodansha Comics')]) } : { ok: true, body: {} },
    );
    const list = await searchMangaEnglishEditions('attack on titan', fetchImpl);
    expect(list[0]!.publisher).toBe('Kodansha Comics'); // not the first-seen "National Geographic Books"
    expect(list[0]!.totalVolumes).toBe(2);
  });
});

describe('enrichEnglishEditions (genres on every edition)', () => {
  const gb = (title: string): MangaCandidate => ({ title, romaji: null, native: null, author: null, totalVolumes: 1, isOngoing: false, isSeries: true, coverUrl: null, source: 'googlebooks', edition: title.includes('Omnibus') ? 'Omnibus' : 'Standard', publisher: 'Kodansha Comics', language: 'en' });
  const ani: MangaCandidate = { title: 'Blue Lock', romaji: 'BLUE LOCK', native: 'ブルーロック', author: null, totalVolumes: null, isOngoing: true, isSeries: true, coverUrl: null, source: 'anilist', genres: ['Sports', 'Drama'], relations: [{ relationType: 'PREQUEL', title: 'Episode Nagi', format: 'MANGA', coverUrl: null }] };

  it('copies AniList genres + relations onto same-series English editions, not onto a different series', () => {
    const out = enrichEnglishEditions([gb('Blue Lock'), gb('Blue Lock — Omnibus'), gb('Naruto')], [ani]);
    expect(out[0]!.genres).toEqual(['Sports', 'Drama']); // exact title match
    expect(out[1]!.genres).toEqual(['Sports', 'Drama']); // "Blue Lock — Omnibus" ⊃ "Blue Lock"
    expect(out[1]!.relations?.[0]?.title).toBe('Episode Nagi');
    expect(out[2]!.genres ?? null).toBeNull(); // Naruto: no match → unchanged
  });

  it('never overwrites metadata an English candidate already has, and no-ops without AniList', () => {
    const already: MangaCandidate = { ...gb('Blue Lock'), genres: ['Thriller'] };
    expect(enrichEnglishEditions([already], [ani])[0]!.genres).toEqual(['Thriller']); // kept
    const english = [gb('Blue Lock')];
    expect(enrichEnglishEditions(english, [])).toBe(english); // no AniList → returns input as-is
  });
});

describe('searchMangaByAuthor (AniList staff)', () => {
  const work = (id: number, english: string, format = 'MANGA', extra: Record<string, unknown> = {}) => ({
    id,
    title: { romaji: english.toUpperCase(), english, native: null },
    format,
    status: 'FINISHED',
    volumes: 3,
    genres: ['Action'],
    coverImage: { large: `http://c/${id}.jpg` },
    staff: { edges: [{ role: 'Story & Art', node: { name: { full: 'Tatsuki Fujimoto' } } }] },
    ...extra,
  });
  const staffPage = (staff: unknown[]) => ({ ok: true, body: { data: { Page: { staff } } } });
  const fujimoto = {
    name: { full: 'Tatsuki Fujimoto', native: '藤本タツキ', alternative: [] },
    staffMedia: {
      edges: [
        { staffRole: 'Story & Art', node: work(1, 'Chainsaw Man', 'MANGA', { status: 'RELEASING', volumes: null }) },
        { staffRole: 'Story & Art', node: work(2, 'Look Back', 'ONE_SHOT') },
        { staffRole: 'Original Creator', node: work(3, 'Chainsaw Man: Buddy Stories', 'NOVEL') }, // novel → dropped
        { staffRole: 'Assistant', node: work(4, 'Somebody Elses Manga') }, // not his work → dropped
        { staffRole: 'Art', node: work(2, 'Look Back', 'ONE_SHOT') }, // same work, 2nd credit → once
      ],
    },
  };

  it('returns the creator\'s works tagged with matchedAuthor — novels, non-creator credits and duplicates dropped', async () => {
    let sentBody = '';
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      sentBody = String(init?.body ?? '');
      return { ok: true, json: async () => staffPage([fujimoto]).body } as Response;
    }) as unknown as typeof fetch;
    const list = await searchMangaByAuthor('fujimoto', fetchImpl);
    expect(JSON.parse(sentBody).variables).toEqual({ search: 'fujimoto' });
    expect(list.map((c) => c.title)).toEqual(['Chainsaw Man', 'Look Back']);
    expect(list.every((c) => c.matchedAuthor === 'Tatsuki Fujimoto' && c.source === 'anilist')).toBe(true);
    expect(list[0]).toMatchObject({ isOngoing: true, totalVolumes: null, author: 'Tatsuki Fujimoto', genres: ['Action'] });
    expect(list[1]!.isSeries).toBe(false); // ONE_SHOT
  });

  it('ignores a fuzzy staff hit whose name does not actually match the query (a title search stays clean)', async () => {
    const fetchImpl = fakeFetch(() => staffPage([{ ...fujimoto, name: { full: 'Kouki Blue', native: null, alternative: [] } }]));
    expect(await searchMangaByAuthor('blue lock', fetchImpl)).toEqual([]);
  });

  it('degrades to [] on an HTTP error, a thrown fetch, or a too-short query', async () => {
    expect(await searchMangaByAuthor('fujimoto', fakeFetch(() => ({ ok: false, body: {} })))).toEqual([]);
    const boom = (async () => { throw new Error('network'); }) as unknown as typeof fetch;
    expect(await searchMangaByAuthor('fujimoto', boom)).toEqual([]);
    expect(await searchMangaByAuthor('od', fakeFetch(() => staffPage([fujimoto])))).toEqual([]);
  });
});

describe('authorNameMatches', () => {
  const names = ['Tatsuki Fujimoto', '藤本タツキ', 'Nagato wa Ore'];
  it('matches a surname, a full name in either order, a prefix, any case/accents, and the native name', () => {
    for (const q of ['fujimoto', 'Tatsuki Fujimoto', 'FUJIMOTO TATSUKI', 'tatsuki fuji', '藤本タツキ']) expect({ q, ok: authorNameMatches(q, names) }).toEqual({ q, ok: true });
    expect(authorNameMatches('otomo', ['Katsuhiro Ōtomo'])).toBe(true);
  });
  it('rejects a title-like query or a word that only appears mid-name', () => {
    for (const q of ['chainsaw man', 'moto', 'blue lock', '']) expect({ q, ok: authorNameMatches(q, names) }).toEqual({ q, ok: false });
  });
});

describe('mergeTitleAndAuthorHits', () => {
  const c = (title: string, extra: Partial<MangaCandidate> = {}): MangaCandidate => ({ title, romaji: null, native: null, author: null, totalVolumes: null, isOngoing: false, isSeries: true, coverUrl: null, source: 'anilist', ...extra });
  it('keeps title hits first, appends only NEW author works, and caps', () => {
    const merged = mergeTitleAndAuthorHits([c('Chainsaw Man')], [c('Chainsaw Man', { matchedAuthor: 'X' }), c('Fire Punch', { matchedAuthor: 'X' }), c('Look Back', { matchedAuthor: 'X' })], 2);
    expect(merged.map((m) => [m.title, m.matchedAuthor ?? null])).toEqual([['Chainsaw Man', null], ['Fire Punch', 'X']]);
  });
  it('does not collapse distinct native-only titles into one "duplicate"', () => {
    const merged = mergeTitleAndAuthorHits([c('ルックバック')], [c('さよなら絵梨', { matchedAuthor: 'X' }), c('ファイアパンチ', { matchedAuthor: 'X' })], 10);
    expect(merged).toHaveLength(3);
  });
});

// Google Books item helper for the book / English-count tests.
const bookItem = (id: string, title: string, authors: string[], language = 'en', extra: Record<string, unknown> = {}) => ({
  id,
  volumeInfo: { title, authors, language, publisher: 'Pub', imageLinks: { thumbnail: `http://gb/${id}.jpg` }, ...extra },
});
const gbRoute = (byQuery: (q: string) => unknown[]) =>
  fakeFetch((url) => {
    const u = new URL(url);
    const start = Number(u.searchParams.get('startIndex') ?? '0');
    return { ok: true, body: { items: start === 0 ? byQuery(u.searchParams.get('q') ?? '') : [] } };
  });

describe('searchBooks (plain books by title AND author)', () => {
  const williams = (q: string) =>
    q.startsWith('inauthor:')
      ? [
          bookItem('a1', 'Augustus', ['John Williams'], 'nl'),
          bookItem('a2', 'Augustus', ['John Williams'], 'en', { categories: ['Fiction'] }),
          bookItem('s1', 'Stoner', ['John Williams']),
          bookItem('s2', 'Stoner', ['John Williams'], 'de'),
          bookItem('b1', "Butcher's crossing / druk 1", ['John Williams'], 'nl'),
          bookItem('b2', 'Butcher’s Crossing (Spanish Edition)', ['John Williams'], 'es'),
          bookItem('x1', 'Marketing in Practice', ['John E. Williams']),
        ]
      : [bookItem('bio', 'John Williams', ['Tim Greiving']), bookItem('guide', 'Stoner by John Williams', ['Bright Summaries'])];

  it('groups editions per work (English edition as representative), ranks the author\'s works first for a full name, tags ✎', async () => {
    const list = await searchBooks('John Williams', gbRoute(williams));
    expect(list.slice(0, 3).map((c) => c.title).sort()).toEqual(['Augustus', "Butcher's crossing", 'Stoner']);
    const augustus = list.find((c) => c.title === 'Augustus')!;
    expect(augustus).toMatchObject({ language: 'en', author: 'John Williams', matchedAuthor: 'John Williams', totalVolumes: 1, isSeries: false, source: 'googlebooks', genres: ['Fiction'] });
    expect(list.find((c) => c.title === 'John Williams')?.matchedAuthor).toBeUndefined(); // a biography, not by him
    expect(list.findIndex((c) => c.title === 'John Williams')).toBeGreaterThan(2);
  });

  it('a title query ranks the book itself first and never tags it ✎', async () => {
    const fetchImpl = gbRoute((q) => (q.startsWith('intitle:') ? [bookItem('t1', 'The Vegan Stoner Cookbook', ['S. Conrique']), bookItem('t2', 'Stoner', ['John Williams']), bookItem('t3', 'Stoner', ['John Williams'], 'sv')] : []));
    const list = await searchBooks('Stoner', fetchImpl);
    expect(list[0]).toMatchObject({ title: 'Stoner', author: 'John Williams' });
    expect(list[0]!.matchedAuthor).toBeUndefined();
  });

  it('counts only EXPLICIT volume markers — "Fahrenheit 451" is one book, "Mushoku Tensei Vol. 3" a series', async () => {
    const fetchImpl = gbRoute((q) => (q.startsWith('intitle:') ? [bookItem('f', 'Fahrenheit 451', ['Ray Bradbury']), bookItem('m1', 'Fahrenheit 451 Vol. 1', ['X']), bookItem('m3', 'Fahrenheit 451 Vol. 3', ['X'])] : []));
    const list = await searchBooks('Fahrenheit 451', fetchImpl);
    expect(list.map((c) => [c.author, c.totalVolumes, c.isSeries])).toEqual(expect.arrayContaining([['X', 3, true]]));
    expect(list.every((c) => c.totalVolumes !== 451)).toBe(true);
  });
});

describe('English volume counts for author-found manga', () => {
  it('collects the author\'s ENGLISH standard volumes per series (other languages / omnibus / other authors ignored)', async () => {
    const fetchImpl = gbRoute(() => [
      bookItem('c18', 'Chainsaw Man, Vol. 18', ['Tatsuki Fujimoto'], 'en', { seriesInfo: { bookDisplayNumber: '18' } }),
      bookItem('c22', 'Chainsaw Man, Vol. 22', ['Tatsuki Fujimoto']),
      bookItem('c24de', 'Chainsaw Man 24', ['Tatsuki Fujimoto'], 'de'),
      bookItem('om', 'Chainsaw Man Omnibus 9', ['Tatsuki Fujimoto']),
      bookItem('lb', 'Look Back', ['Tatsuki Fujimoto']),
      bookItem('other', 'Chainsaw Man, Vol. 99', ['Someone Else']),
    ]);
    const counts = await englishVolumeCountsByAuthor('Tatsuki Fujimoto', fetchImpl);
    expect(counts.get('chainsaw man')?.volumes).toBe(22);
    expect(counts.get('look back')?.volumes).toBe(1);
  });

  it('applies counts on an EXACT title only — a side work never inherits the main series\' count', () => {
    const w = (title: string, totalVolumes: number | null): MangaCandidate => ({ title, romaji: null, native: null, author: null, totalVolumes, isOngoing: false, isSeries: true, coverUrl: null, source: 'anilist', matchedAuthor: 'Takehiko Inoue' });
    const counts = new Map([['vagabond', { volumes: 37, publisher: 'VIZ Media' }]]);
    const [main, side] = applyEnglishCounts([w('Vagabond', null), w('Vagabond: Saigo no Manga-ten', 2)], counts);
    expect(main).toMatchObject({ totalVolumes: 37, language: 'en', publisher: 'VIZ Media' });
    expect(side).toMatchObject({ totalVolumes: 2 });
    expect(side!.language).toBeUndefined();
  });
});
