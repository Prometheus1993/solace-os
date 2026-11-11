import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Clock, UnixSeconds } from '@solace/core';
import { createSkySource, LegacyDbError, isDemoEnv, migrate, openDatabase, OpenMeteoClient, resolveDbPath, skyLocation, SqliteRepository } from '@solace/data';
import { createSerializer, type Deps } from './deps.ts';
import { dispatch, isLoopbackBind, mergeRoutes } from './http.ts';
import { archivesRoutes } from './routes/archives.ts';
import { examRoutes } from './routes/exams.ts';
import { schoolTaskRoutes } from './routes/school-tasks.ts';
import { strengthRoutes } from './routes/strength.ts';
import { trainingRoutes } from './routes/training.ts';
import { createSyncRunner, demoSyncDisabled } from './sync-runner.ts';

// The server is a READ-ONLY DTO + Garmin sync + narrow manual-entry write endpoints. This file only boots it:
// env, DB, CORS, and the route table. The routes live in ./routes/, one file per area; ./http.ts is the
// shared exact-match dispatch + body parsing + error → status mapping.

// Load the project-root .env (Node 22 built-in) so GOOGLE_BOOKS_API_KEY can
// live in a file instead of the shell. Mirrors backend/cli/src/index.ts.
try {
  (process as unknown as { loadEnvFile?: (path?: string) => void }).loadEnvFile?.();
} catch {
  // no .env present — env vars can still come from the shell
}

// Demo mode (`npm run demo`): resolveDbPath pins data/demo.sqlite; sync is disabled; the user's own Google Books key
// and price table never leak in (the demo uses the made-up example price table), and the desk sky uses the
// default location instead of the user's own.
const demo = isDemoEnv();
if (demo) {
  delete process.env['GOOGLE_BOOKS_API_KEY'];
  delete process.env['SOLACE_LAT'];
  delete process.env['SOLACE_LON'];
  process.env['SOLACE_PRICE_TABLE'] = resolve(process.cwd(), 'config', 'price-table.example.json');
}

const PORT = Number(process.env['PORT'] ?? 8787);
// Bind localhost-only by default — this is a single-user dashboard whose writable API (weight / goals /
// Garmin-sync / life-sim writes) has no auth. Set HOST=0.0.0.0 to deliberately expose it on the LAN.
const HOST = process.env['HOST'] ?? '127.0.0.1';
// Default to the project DB; SOLACE_DB overrides it (used by tests to point at a throwaway DB).
let dbPath: string;
try {
  dbPath = resolveDbPath();
} catch (err) {
  if (!(err instanceof LegacyDbError)) throw err;
  console.error(err.message);
  process.exit(1);
}
mkdirSync(dirname(dbPath), { recursive: true });

const db = openDatabase(dbPath);
migrate(db);
const repo = new SqliteRepository(db);

const clock: Clock = {
  now: () => Math.floor(Date.now() / 1000) as UnixSeconds,
  today: () => new Date().toLocaleDateString('sv-SE'),
};

const weather = new OpenMeteoClient(repo);
const location = skyLocation();
const sky = location ? createSkySource(() => weather.getSky(location.lat, location.lon), clock) : () => Promise.resolve(null);
const serialize = createSerializer();
const sync = createSyncRunner({ repo, clock, weather, serialize, doSync: demo ? demoSyncDisabled : undefined });
const deps: Deps = { repo, clock, weather, sky, serialize, sync };
const routes = mergeRoutes(trainingRoutes(deps), examRoutes(deps), schoolTaskRoutes(deps), archivesRoutes(deps), strengthRoutes(deps));

const exposed = !isLoopbackBind(HOST);
const ALLOWED_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const server = createServer((req, res) => {
  // Reflect CORS ONLY for localhost origins — never `*`. The web app reaches the API same-origin via the
  // Vite proxy (no CORS needed), so a wildcard would only let an arbitrary website the user visits read
  // this no-auth dashboard's personal data cross-origin.
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGIN.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  dispatch(routes, req, res, { exposed });
});

// Defence-in-depth: a single malformed request must never take the process down. Handler errors are already
// mapped to responses by dispatch; this is the last-resort net (the server holds no in-flight transaction).
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException] request handler threw:', err);
});

server.listen(PORT, HOST, () => {
  console.log(`Solace API → http://${HOST}:${PORT}  (db: ${dbPath})`);
});
