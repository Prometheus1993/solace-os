// Build an unsigned Solace.app into desktop/dist (macOS, for this machine only).
// The app does not contain Solace itself: it starts the API server and web UI from THIS repo folder, so the
// folder's location is recorded inside the app (repo-root.json). Move the repo → build again.
import { packager } from '@electron/packager';
import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const desktop = resolve(import.meta.dirname, '..');

const [appPath] = await packager({
  dir: desktop,
  name: 'Solace',
  platform: 'darwin',
  arch: process.arch,
  out: join(desktop, 'dist'),
  overwrite: true,
  appBundleId: 'local.solace.desktop',
  ignore: [/^\/dist/, /^\/test/, /^\/scripts/, /^\/tsconfig\.json$/],
  afterCopy: [
    ({ buildPath }) => writeFile(join(buildPath, 'repo-root.json'), JSON.stringify({ repoRoot: resolve(desktop, '..') })),
  ],
});
console.log(`Built ${appPath}/Solace.app`);
