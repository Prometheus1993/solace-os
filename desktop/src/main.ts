import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, Notification, shell } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { GARMIN_REAUTH_BODY, isMorning, planNotifications, type MissionDay } from './notifications.ts';
import { decideStart, findNode22Bin, isSolaceApi, isSolaceWeb, portsFromEnv, probe, type PortState } from './services.ts';
import { parseSettings, type Settings } from './settings.ts';

// Solace as a Mac app. This does what start.sh does: it runs the API server and the Vite web UI as child processes
// from the repo root (on Node 22, so better-sqlite3 needs no rebuild), then shows the web UI in one window.
// A Solace that already answers on a port is reused and left alone on quit. The environment passes through
// unchanged, so the database rules (SOLACE_DB, default path, legacy guard) are exactly those of `npm run server`.

/** Global show/hide shortcut: Control+Option+Command+S. Not a macOS system shortcut. */
const SHORTCUT = 'Control+Alt+Command+S';
const NOTIFY_INTERVAL_MS = 10 * 60 * 1000;
const START_TIMEOUT_MS = 60_000;

const ports = portsFromEnv(process.env);
const apiUrl = `http://127.0.0.1:${ports.api}/api/dashboard`;
const webUrl = `http://localhost:${ports.web}/`;
// A packaged app lives outside the repo; `npm run desktop:build` records where the repo is.
const repoRoot = app.isPackaged
  ? (JSON.parse(readFileSync(join(import.meta.dirname, '..', 'repo-root.json'), 'utf8')) as { repoRoot: string }).repoRoot
  : resolve(import.meta.dirname, '..', '..');
const settingsPath = join(app.getPath('userData'), 'settings.json');

let settings: Settings;
let win: BrowserWindow | undefined;
let quitting = false;
/** Only the children this app started. A reused server is never in here. */
const started: ChildProcess[] = [];

function saveSettings(): void {
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

/** Start one child in its own process group, so quitting can stop it together with everything it spawned. */
function startChild(command: string, args: string[], env: NodeJS.ProcessEnv): ChildProcess {
  const child = spawn(command, args, { cwd: repoRoot, env, detached: true, stdio: ['ignore', 'ignore', 'pipe'] });
  started.push(child);
  return child;
}

function stopStartedChildren(): void {
  for (const child of started) {
    if (child.pid !== undefined && child.exitCode === null && child.signalCode === null) process.kill(-child.pid, 'SIGTERM');
  }
}

/** Reuse a running Solace on the port, or start our own child and wait until it answers. Never restarts a child. */
async function ensureService(name: string, port: number, probeNow: () => Promise<PortState>, start: () => ChildProcess): Promise<void> {
  const decision = decideStart(await probeNow());
  if (decision === 'reuse') {
    console.log(`[solace] ${name}: reusing the one already running on port ${port}`);
    return;
  }
  if (decision === 'conflict') throw new Error(`Port ${port} is in use by a program that is not Solace.`);

  const child = start();
  console.log(`[solace] ${name}: started (pid ${child.pid})`);
  let stderr = '';
  child.stderr!.on('data', (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(-2000);
  });
  const stopped = (): string => `The ${name} stopped (exit code ${child.exitCode}).\n\n${stderr.trim()}`;
  let ready = false;
  child.on('exit', () => {
    if (ready && !quitting) dialog.showErrorBox('Solace', stopped());
  });

  const deadline = Date.now() + START_TIMEOUT_MS;
  while ((await probeNow()) !== 'solace') {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(stopped());
    if (Date.now() > deadline) throw new Error(`The ${name} did not answer within ${START_TIMEOUT_MS / 1000} seconds.`);
    await new Promise((done) => setTimeout(done, 300));
  }
  ready = true;
}

async function startServices(): Promise<void> {
  const node22 = findNode22Bin(homedir(), { exists: existsSync, list: (dir) => (existsSync(dir) ? readdirSync(dir) : []) });
  if (node22 === null) throw new Error('No Node 22 found (Homebrew node@22 keg or ~/.nvm/versions/node/v22.*).');
  const tsx = join(repoRoot, 'node_modules', '.bin', 'tsx');
  if (!existsSync(tsx)) throw new Error(`Dependencies are missing. Run "npm install" in ${repoRoot}.`);
  // Same PATH as start.sh: Node 22 first, then Homebrew (uv for the Garmin sync).
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: `${node22}:/opt/homebrew/bin:${process.env['PATH'] ?? ''}` };

  await ensureService('API server', ports.api, () => probe(fetch, apiUrl, isSolaceApi), () =>
    startChild(tsx, ['backend/server/src/index.ts'], env),
  );
  await ensureService('web UI', ports.web, () => probe(fetch, webUrl, isSolaceWeb), () =>
    startChild(join(node22, 'npm'), ['run', 'dev', '-w', 'web', '--', '--port', String(ports.web), '--strictPort'], {
      ...env,
      SOLACE_API: env['SOLACE_API'] ?? `http://localhost:${ports.api}`,
    }),
  );
}

function toggleWindow(): void {
  if (win === undefined) return;
  if (win.isVisible() && win.isFocused()) {
    win.hide();
  } else {
    win.show();
    win.focus();
  }
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    title: 'Solace',
    backgroundColor: '#B6B19C',
    alwaysOnTop: settings.alwaysOnTop,
    webPreferences: { preload: join(import.meta.dirname, 'preload.cjs') },
  });
  // Closing the window only hides it: the app and its servers keep running until Cmd+Q.
  win.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    win!.hide();
  });
  // Links that open a new window go to the default browser, not into the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  void win.loadURL(webUrl);
}

function buildMenu(): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'Solace',
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { label: 'Show / Hide Solace', accelerator: SHORTCUT, registerAccelerator: false, click: toggleWindow },
          {
            label: 'Launch at Login',
            type: 'checkbox',
            checked: settings.launchAtLogin,
            // Needs a real Solace.app: in development this would register the bare Electron binary.
            enabled: app.isPackaged,
            click: (item) => {
              settings.launchAtLogin = item.checked;
              app.setLoginItemSettings({ openAtLogin: item.checked });
              saveSettings();
            },
          },
          {
            label: 'Always on Top',
            type: 'checkbox',
            checked: settings.alwaysOnTop,
            click: (item) => {
              settings.alwaysOnTop = item.checked;
              win?.setAlwaysOnTop(item.checked);
              saveSettings();
            },
          },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' },
    ]),
  );
}

/** Show the exam/resit and Garmin-token notifications that are due. Reads only; never triggers a sync. */
async function notifyTick(): Promise<void> {
  const now = new Date();
  let missions: MissionDay[] = [];
  if (isMorning(now.getHours())) {
    try {
      // An empty database answers without missions.
      missions = ((await (await fetch(apiUrl)).json()) as { missions?: MissionDay[] }).missions ?? [];
    } catch {
      return; // API not reachable right now: the next tick tries again
    }
  }
  // Local stat of the token store only (the folder's mtime = the last sign-in); no call to Garmin.
  const tokenStore = statSync(join(homedir(), '.garminconnect'), { throwIfNoEntry: false });
  const plan = planNotifications({
    missions,
    today: now.toLocaleDateString('sv-SE'),
    hour: now.getHours(),
    tokenMtimeMs: tokenStore?.mtimeMs ?? null,
    nowMs: now.getTime(),
    notified: settings.notified,
  });
  for (const note of plan.show) new Notification({ title: note.title, body: note.body }).show();
  if (plan.notified.join() !== settings.notified.join()) {
    settings.notified = plan.notified;
    saveSettings();
  }
}

async function main(): Promise<void> {
  await app.whenReady();
  settings = parseSettings(existsSync(settingsPath) ? readFileSync(settingsPath, 'utf8') : null);
  if (app.isPackaged && app.getLoginItemSettings().openAtLogin !== settings.launchAtLogin) {
    app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin });
  }
  buildMenu();

  try {
    await startServices();
  } catch (err) {
    console.error(`[solace] could not start: ${(err as Error).message}`);
    dialog.showErrorBox('Solace could not start', (err as Error).message);
    app.quit();
    return;
  }

  createWindow();
  if (!globalShortcut.register(SHORTCUT, toggleWindow)) console.error(`[solace] could not register the shortcut ${SHORTCUT}`);
  // The web UI calls this (through preload.cjs) when a Garmin sync answers with the `auth` error.
  ipcMain.on('garmin-auth-expired', () => {
    new Notification({ title: 'Garmin login expired', body: GARMIN_REAUTH_BODY }).show();
  });
  void notifyTick();
  setInterval(() => void notifyTick(), NOTIFY_INTERVAL_MS);
}

if (app.requestSingleInstanceLock()) {
  app.on('second-instance', () => win?.show());
  app.on('activate', () => win?.show());
  app.on('window-all-closed', () => {}); // stay running without a window
  app.on('before-quit', () => {
    quitting = true;
  });
  app.on('will-quit', stopStartedChildren);
  void main();
} else {
  app.quit();
}
