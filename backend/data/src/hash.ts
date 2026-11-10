import { createHash } from 'node:crypto';

/**
 * The one SHA-256 helper for every dedupe-key hash in the importers/ingest pipeline
 * (file bytes, prose text, source-row keys). These hashes are DEDUPE KEYS in the DB —
 * changing this function's output for any existing input would make previously
 * imported files/rows re-import as new data.
 */
export function hashHex(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}
