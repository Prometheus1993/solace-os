import { resolve } from 'node:path';
import { LegacyDbError, readPriceTable } from '@solace/data';
import { openContext } from './context.ts';
import { systemClock } from './clock.ts';
import { seed } from './commands/seed.ts';
import { recompute } from './commands/recompute.ts';
import { prepareDemoDb, seedDemo } from './commands/seed-demo.ts';

// Load a local .env (project root) so env vars (e.g. GOOGLE_BOOKS_API_KEY) can live in a file
// instead of being exported every shell. Node 22's process.loadEnvFile().
try {
  (process as unknown as { loadEnvFile?: (path?: string) => void }).loadEnvFile?.();
} catch {
  // no .env present — env vars can still come from the shell
}

function printHelp(): void {
  console.log(`solace — local-first personal OS (dev runtime)

Usage: npm run cli <command>

Commands:
  seed        Create the DB, run migrations, write the baseline (idempotent)
  seed --demo [--reset]
              Fill data/demo.sqlite (only that file) with fake demo data; --reset deletes it first
  recompute   Recompute the three stat tracks into stat_history
  help        Show this help`);
}

/** `seed --demo`: data/demo.sqlite only, whatever SOLACE_DB says; refuses to touch an existing demo DB without --reset. */
async function seedDemoCommand(reset: boolean): Promise<number> {
  const table = readPriceTable(resolve(process.cwd(), 'config', 'price-table.example.json'));
  if (!table) throw new Error('config/price-table.example.json is missing or malformed.');
  const path = prepareDemoDb(reset);
  const ctx = openContext(path);
  try {
    await seedDemo(ctx.repo, systemClock(), table);
    console.log(`Demo data written to ${path}. Start it with: npm run demo`);
    return 0;
  } finally {
    ctx.db.close();
  }
}

async function main(argv: string[]): Promise<number> {
  const command = argv[0];

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return 0;
  }

  if (command === 'seed' && argv.includes('--demo')) return seedDemoCommand(argv.includes('--reset'));

  const ctx = openContext();
  try {
    switch (command) {
      case 'seed':
        await seed(ctx.repo);
        return 0;
      case 'recompute':
        await recompute(ctx.repo, systemClock());
        return 0;
      default:
        console.error(`Unknown command: ${command}\n`);
        printHelp();
        return 1;
    }
  } finally {
    ctx.db.close();
  }
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(err instanceof LegacyDbError ? err.message : err);
    process.exit(1);
  });
