import { join } from 'node:path';

// Pure helpers for "reuse a running Solace, or start our own": no Electron, no real I/O (the caller injects it).

/** What answers on a port: Solace itself, something else, or nothing. */
export type PortState = 'solace' | 'foreign' | 'free';
/** Reuse a running Solace, start our own child, or refuse because another program holds the port. */
export type StartDecision = 'reuse' | 'start' | 'conflict';

export function decideStart(state: PortState): StartDecision {
  if (state === 'solace') return 'reuse';
  return state === 'free' ? 'start' : 'conflict';
}

/** True when the body is a Solace `GET /api/dashboard` answer: the dashboard, or its "Not seeded" error (empty DB). */
export function isSolaceApi(body: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return false;
  }
  if (typeof parsed !== 'object' || parsed === null) return false;
  const dto = parsed as Record<string, unknown>;
  if (typeof dto['error'] === 'string' && dto['error'].startsWith('Not seeded')) return true;
  return typeof dto['generatedAt'] === 'string' && Array.isArray(dto['missions']) && typeof dto['lifeSimSummary'] === 'object';
}

/** True when the body is the Solace web UI's index.html. */
export function isSolaceWeb(body: string): boolean {
  return body.includes('<title>Solace');
}

type FetchLike = (url: string, init: { signal: AbortSignal }) => Promise<{ text(): Promise<string> }>;

/** One GET on the port: no answer = free; an answer is Solace or foreign, judged by `isSolace`. */
export async function probe(fetchFn: FetchLike, url: string, isSolace: (body: string) => boolean): Promise<PortState> {
  try {
    const res = await fetchFn(url, { signal: AbortSignal.timeout(3000) });
    return isSolace(await res.text()) ? 'solace' : 'foreign';
  } catch {
    return 'free';
  }
}

export interface Ports {
  api: number;
  web: number;
}

/** `PORT` is the same variable the API server reads; `SOLACE_WEB_PORT` moves the web UI. Defaults = `npm start`. */
export function portsFromEnv(env: Record<string, string | undefined>): Ports {
  return { api: Number(env['PORT'] ?? 8787), web: Number(env['SOLACE_WEB_PORT'] ?? 5174) };
}

export interface FsLike {
  exists(path: string): boolean;
  /** Entry names of a directory; empty when it does not exist. */
  list(dir: string): string[];
}

/** The Node 22 bin directory, found the way start.sh finds it: the Homebrew node@22 keg, else nvm's newest v22. */
export function findNode22Bin(home: string, fs: FsLike): string | null {
  const keg = '/opt/homebrew/opt/node@22/bin';
  if (fs.exists(join(keg, 'node'))) return keg;
  const nvm = join(home, '.nvm', 'versions', 'node');
  const newest = fs
    .list(nvm)
    .filter((name) => /^v22\.\d+\.\d+$/.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .at(-1);
  if (newest === undefined) return null;
  const bin = join(nvm, newest, 'bin');
  return fs.exists(join(bin, 'node')) ? bin : null;
}
