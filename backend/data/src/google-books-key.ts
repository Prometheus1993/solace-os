import { GBOOKS_ENDPOINT } from './manga-lookup.ts';

/** app_settings key under which the in-app Google Books key is stored. */
export const GOOGLE_BOOKS_KEY_SETTING = 'google_books_api_key';
/** A Google Cloud API key. AI-Studio/Gemini keys ("AQ.…") are a different type and are rejected by Books. */
export const GOOGLE_BOOKS_KEY_PATTERN = /^AIza[0-9A-Za-z_-]{35}$/;

export type BooksKeySource = 'env' | 'app';

/** The effective key: a non-empty GOOGLE_BOOKS_API_KEY env var wins, else the one saved in the app, else none. */
export async function resolveBooksKey(
  repo: { getSetting(key: string): Promise<string | null> },
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ key: string; source: BooksKeySource } | null> {
  const fromEnv = env['GOOGLE_BOOKS_API_KEY']?.trim();
  if (fromEnv) return { key: fromEnv, source: 'env' };
  const fromApp = await repo.getSetting(GOOGLE_BOOKS_KEY_SETTING);
  return fromApp ? { key: fromApp, source: 'app' } : null;
}

export type BooksKeyTest = { ok: true } | { ok: false; status: number; message: string };

/** One small Google Books request with `key`. The messages are fixed text: the request URL embeds the key,
 *  so nothing from the response or the thrown error is ever passed on. Status 0 = no HTTP answer. */
export async function testBooksKey(key: string, fetchImpl: typeof fetch = fetch): Promise<BooksKeyTest> {
  const params = new URLSearchParams({ q: 'intitle:"test"', maxResults: '1', key });
  let status: number;
  try {
    const res = await fetchImpl(`${GBOOKS_ENDPOINT}?${params.toString()}`, { signal: AbortSignal.timeout(8000) });
    status = res.status;
  } catch {
    return { ok: false, status: 0, message: 'Could not reach Google Books (network error or timeout).' };
  }
  if (status >= 200 && status < 300) return { ok: true };
  if (status === 400 || status === 403) return { ok: false, status, message: 'Google rejected the key: it is wrong, or the Books API is not enabled for its project.' };
  if (status === 429) return { ok: false, status, message: 'Quota exceeded: Google is rate-limiting this key. Try again later.' };
  return { ok: false, status, message: `Google Books answered with an unexpected status (${status}).` };
}
