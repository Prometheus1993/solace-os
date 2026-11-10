import type { IncomingMessage, ServerResponse } from 'node:http';

// The request plumbing every route shares: an exact-match route table, body parsing, and ONE place that
// turns a thrown error into a response (BadRequest → 400, anything else → a generic 500).

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export interface Request {
  req: IncomingMessage;
  res: ServerResponse;
  /** The raw request URL, query string included. */
  url: string;
}
export type Handler = (r: Request) => Promise<void>;
/** Pathname → method → handler. Keys are EXACT pathnames: dispatch only strips the `?query`, so
 *  `DELETE /api/series-lookup?id=5` can never reach `/api/series`. That prefix-match bug deleted real rows
 *  twice while routing was a hand-written `startsWith` chain; a table lookup can't reintroduce it. */
export type Routes = Record<string, Partial<Record<Method, Handler>>>;

/** A client mistake. Thrown anywhere in a handler, it becomes a 400 carrying the message. */
export class BadRequest extends Error {}

export const json = (res: ServerResponse, status: number, body: unknown): void => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
};

// Bounded so a runaway/accidental huge body can't grow the buffer until the process OOMs.
const MAX_BODY_BYTES = 25 * 1024 * 1024;
export const readBody = (req: IncomingMessage): Promise<Buffer> =>
  new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (c: Buffer) => {
      total += c.length;
      if (total > MAX_BODY_BYTES) {
        req.destroy();
        reject(new BadRequest('request body too large'));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolveBody(Buffer.concat(chunks)));
    req.on('error', reject);
  });

export type Body = Record<string, unknown>;
/** The request body as a JSON object (an empty body is `{}`). Anything else is a 400. */
export async function jsonBody(req: IncomingMessage): Promise<Body> {
  const text = (await readBody(req)).toString('utf8') || '{}';
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BadRequest('invalid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new BadRequest('invalid JSON');
  return parsed as Body;
}

/** The `?id=` a PATCH/DELETE targets. */
export function requireId(url: string): number {
  const m = /[?&]id=(\d+)/.exec(url);
  if (!m) throw new BadRequest('need ?id=');
  return Number(m[1]);
}

/** Run a repo write whose failure is the caller's fault (a CHECK or FK constraint): a 400 with the cause. */
export async function asBadRequest<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (e) {
    throw new BadRequest(String(e));
  }
}

/** Combine route tables; the same path in two tables is a boot-time error, never a silent override. */
export function mergeRoutes(...tables: Routes[]): Routes {
  const out: Routes = {};
  for (const table of tables) {
    for (const [path, methods] of Object.entries(table)) {
      if (Object.hasOwn(out, path)) throw new Error(`duplicate route ${path}`);
      out[path] = methods;
    }
  }
  return out;
}

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);
const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/** The hostname of a `host[:port]` string, lower-cased; undefined when it does not parse. */
const hostnameOf = (hostPort: string): string | undefined => {
  try {
    return new URL(`http://${hostPort}`).hostname;
  } catch {
    return undefined;
  }
};

/** True when `bindHost` (the HOST the server listens on) is a loopback address, i.e. not deliberately exposed. */
export const isLoopbackBind = (bindHost: string): boolean => bindHost === '::1' || LOOPBACK_HOSTNAMES.has(hostnameOf(bindHost) ?? '');

export interface GuardOptions {
  /** The server is deliberately exposed (HOST is not loopback): any Host header is legitimate. */
  exposed: boolean;
}

/** Cross-site protection that CORS alone cannot give: a browser sends a cross-origin "simple" POST (even
 *  text/plain) without a preflight, so CORS headers never stop the write. Returns true when the request must be
 *  refused.
 *  1. Writes: an `Origin` that is neither localhost nor same-origin with the Host header is refused (this
 *     includes `Origin: null`). No Origin (CLI, curl, same-origin navigations) passes.
 *  2. DNS rebinding: unless exposed, the Host header must be a loopback name, so evil.example re-pointed at
 *     127.0.0.1 cannot read or write through the user's browser. */
function isForbidden(req: IncomingMessage, opts: GuardOptions): boolean {
  // A request with no Host header at all (HTTP/1.0 tooling) cannot come from a browser, so it is not rebinding.
  const host = req.headers.host;
  if (host !== undefined && !opts.exposed && !LOOPBACK_HOSTNAMES.has(hostnameOf(host) ?? '')) return true;
  const origin = req.headers.origin;
  if (origin === undefined || !WRITE_METHODS.has(req.method ?? '')) return false;
  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return true;
  }
  return !LOOPBACK_HOSTNAMES.has(originUrl.hostname) && originUrl.host !== host?.toLowerCase();
}

export function dispatch(routes: Routes, req: IncomingMessage, res: ServerResponse, opts: GuardOptions = { exposed: false }): void {
  if (isForbidden(req, opts)) {
    json(res, 403, { error: 'forbidden origin' });
    return;
  }
  const url = req.url ?? '';
  const path = url.split('?', 1)[0] ?? '';
  const methods = Object.hasOwn(routes, path) ? routes[path] : undefined;
  const method = req.method ?? '';
  const handler = methods && Object.hasOwn(methods, method) ? methods[method as Method] : undefined;
  if (!handler) {
    const known = Object.entries(routes).map(([p, m]) => `${Object.keys(m).join('/')} ${p}`);
    json(res, 404, { error: `Not found. Routes: ${known.join('; ')}` });
    return;
  }
  void handler({ req, res, url }).catch((err: unknown) => {
    if (res.headersSent) {
      console.error('[api] error after the response was sent', err);
      return;
    }
    if (err instanceof BadRequest) {
      json(res, 400, { error: err.message });
      return;
    }
    // Log the detail locally, return a generic 500: a DB/file error can carry an absolute path, and the
    // localhost user still sees the real cause in the server console.
    console.error('[api]', err);
    json(res, 500, { error: 'internal error' });
  });
}
