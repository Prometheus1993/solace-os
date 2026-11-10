import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { loadScratchpad, saveScratchpad, SCRATCHPAD_KEY, MOODS, TRACKS, nextRadioTrack } from './desk-personal-state.ts';

describe('personal desk data', () => {
  it('restores notes verbatim, including whitespace and unicode', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value); } };
    expect(loadScratchpad(storage)).toEqual({ text: '', error: false });
    const text = '  Next idea: 夜\n\nA small reminder.\n';
    expect(saveScratchpad(storage, text)).toBe(true);
    expect(loadScratchpad(storage)).toEqual({ text, error: false });
    expect(store.get(SCRATCHPAD_KEY)).toBe(text);
    expect(saveScratchpad(storage, '')).toBe(true);
    expect(loadScratchpad(storage).text).toBe('');
  });
  it('reports denied reads and failed writes instead of claiming notes were saved', () => {
    expect(loadScratchpad({ getItem: () => { throw new Error('Denied'); } })).toEqual({ text: '', error: true });
    expect(saveScratchpad({ setItem: () => { throw new Error('Quota'); } }, 'Keep this draft')).toBe(false);
  });
  it.each(MOODS)('cycles every %s track once and wraps without changing mood', mood => {
    const indices = TRACKS.flatMap((track, index) => track.mood === mood ? [index] : []);
    expect(indices.length).toBeGreaterThan(1);
    let index = indices[0];
    const seen = new Set<number>();
    for (let i = 0; i < indices.length; i++) {
      seen.add(index); expect(TRACKS[index].mood).toBe(mood); index = nextRadioTrack(index, mood);
    }
    expect([...seen]).toEqual(indices);
    expect(index).toBe(indices[0]);
    expect(nextRadioTrack(-1, mood)).toBe(indices[0]);
  });
  it('ships every selectable track with matching provenance and intact audio bytes', () => {
    const root = new URL('../../../public/music/open-lofi/', import.meta.url);
    const manifest = JSON.parse(readFileSync(new URL('provenance.json', root), 'utf8')) as { license: string; tracks: { file: string; bytes: number; sha256: string }[] };
    expect(manifest.license).toBe('CC0-1.0');
    for (const track of TRACKS) {
      const record = manifest.tracks.find(item => item.file === track.file);
      expect(record).toBeDefined();
      const bytes = readFileSync(new URL(track.file, root));
      expect(bytes.length).toBe(record!.bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(record!.sha256);
      // Source MP3 files begin with an MPEG frame or ID3 metadata.
      expect(bytes.subarray(0, 3).toString() === 'ID3' || bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0).toBe(true);
    }
  });
});
