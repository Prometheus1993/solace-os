import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LegacyDbError, resolveDbPath } from '../src/db/default-db-path.ts';

function project(files: string[]): string {
  const cwd = mkdtempSync(join(tmpdir(), 'solace-dbpath-'));
  mkdirSync(join(cwd, 'data'));
  for (const f of files) writeFileSync(join(cwd, 'data', f), '');
  return cwd;
}

describe('resolveDbPath', () => {
  it('uses SOLACE_DB as-is, even next to a legacy ragnarok.sqlite', () => {
    const cwd = project(['ragnarok.sqlite']);
    expect(resolveDbPath({ SOLACE_DB: '/x/t.sqlite' }, cwd)).toBe('/x/t.sqlite');
  });

  it('defaults to data/solace.sqlite on a fresh project', () => {
    const cwd = project([]);
    expect(resolveDbPath({}, cwd)).toBe(join(cwd, 'data', 'solace.sqlite'));
  });

  it('refuses when only the legacy ragnarok.sqlite exists, and creates nothing', () => {
    const cwd = project(['ragnarok.sqlite']);
    expect(() => resolveDbPath({}, cwd)).toThrow(LegacyDbError);
    expect(() => resolveDbPath({}, cwd)).toThrow(/Upgrading from ragnarok/);
  });

  it('allows the default path once solace.sqlite exists', () => {
    const cwd = project(['ragnarok.sqlite', 'solace.sqlite']);
    expect(resolveDbPath({}, cwd)).toBe(join(cwd, 'data', 'solace.sqlite'));
  });
});
