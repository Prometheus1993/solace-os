import { describe, expect, it } from 'vitest';
import { AREA_IDS, canonicalHash, resolveArea } from './areas.ts';

describe('resolveArea', () => {
  it('knows the four canonical areas', () => {
    expect(AREA_IDS).toEqual(['desk', 'body', 'study', 'shelf']);
    for (const id of AREA_IDS) expect(resolveArea(id)).toBe(id);
  });
  it('maps every pre-rename area id to its new area', () => {
    expect(resolveArea('home')).toBe('desk');
    expect(resolveArea('training')).toBe('body');
    expect(resolveArea('school')).toBe('study');
    expect(resolveArea('archives')).toBe('shelf');
  });
  it('returns null for anything else (these were never area ids)', () => {
    for (const id of ['combat', 'missions', '', 'nope']) expect(resolveArea(id)).toBeNull();
  });
});

describe('canonicalHash', () => {
  it('renames only the first segment and keeps the rest', () => {
    expect(canonicalHash('#training/running')).toBe('body/running');
    expect(canonicalHash('#training/body')).toBe('body/body');
    expect(canonicalHash('#school/schoolperiode')).toBe('study/schoolperiode');
    expect(canonicalHash('#archives/books/12')).toBe('shelf/books/12');
    expect(canonicalHash('#home')).toBe('desk');
  });
  it('leaves canonical and unknown hashes alone', () => {
    expect(canonicalHash('#body/vitals')).toBe('body/vitals');
    expect(canonicalHash('#desk')).toBe('desk');
    expect(canonicalHash('#nope/x')).toBe('nope/x');
    expect(canonicalHash('')).toBe('');
  });
});
