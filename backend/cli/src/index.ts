import { LegacyDbError } from '@solace/data';
import { openContext } from './context.ts';
import { systemClock } from './clock.ts';
import { seed } from './commands/seed.ts';
import { recompute } from './commands/recompute.ts';

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
  recompute   Recompute the three stat tracks into stat_history
  help        Show this help`);
}

async function main(argv: string[]): Promise<number> {
  const command = argv[0];

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return 0;
  }

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
