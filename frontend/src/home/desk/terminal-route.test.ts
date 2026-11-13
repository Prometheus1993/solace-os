import { describe, expect, it } from 'vitest';
import { canonicalRoute, parseTerminalHash, terminalHash } from './terminal-route.ts';

describe('parseTerminalHash', () => {
  it('opens the terminal on the folder and view a canonical hash names', () => {
    expect(parseTerminalHash('#body/vitals')).toEqual({ folder: 'body', view: 'vitals' });
    expect(parseTerminalHash('#body/running')).toEqual({ folder: 'body', view: 'running' });
    expect(parseTerminalHash('#study/exam-term')).toEqual({ folder: 'study', view: 'exam-term' });
    expect(parseTerminalHash('#shelf/manga')).toEqual({ folder: 'shelf', view: 'manga' });
    expect(parseTerminalHash('#shelf/key')).toEqual({ folder: 'shelf', view: 'key' });
  });
  it('opens a folder on its first view when no view (or an unknown one) is named', () => {
    expect(parseTerminalHash('#body')).toEqual({ folder: 'body', view: 'overview' });
    expect(parseTerminalHash('#study')).toEqual({ folder: 'study', view: 'school-term' });
    expect(parseTerminalHash('#shelf/nope')).toEqual({ folder: 'shelf', view: 'books' });
    expect(parseTerminalHash('#body/missions')).toEqual({ folder: 'body', view: 'overview' });
  });
  it('maps the older area and view aliases', () => {
    expect(parseTerminalHash('#training/running')).toEqual({ folder: 'body', view: 'running' });
    expect(parseTerminalHash('#training/body')).toEqual({ folder: 'body', view: 'vitals' });
    expect(parseTerminalHash('#body/body')).toEqual({ folder: 'body', view: 'vitals' });
    expect(parseTerminalHash('#body/status')).toEqual({ folder: 'body', view: 'overview' });
    expect(parseTerminalHash('#school/schoolperiode')).toEqual({ folder: 'study', view: 'school-term' });
    expect(parseTerminalHash('#school/examenperiode')).toEqual({ folder: 'study', view: 'exam-term' });
    expect(parseTerminalHash('#archives/manga')).toEqual({ folder: 'shelf', view: 'manga' });
  });
  it('carries a series id on the books and manga views only', () => {
    expect(parseTerminalHash('#shelf/books/12')).toEqual({ folder: 'shelf', view: 'books', seriesId: 12 });
    expect(parseTerminalHash('#archives/manga/7')).toEqual({ folder: 'shelf', view: 'manga', seriesId: 7 });
    expect(parseTerminalHash('#shelf/manga/abc')).toEqual({ folder: 'shelf', view: 'manga' });
    expect(parseTerminalHash('#body/running/3')).toEqual({ folder: 'body', view: 'running' });
  });
  it('leaves the terminal closed for the desk, its alias and unknown hashes', () => {
    for (const hash of ['', '#', '#desk', '#home', '#desk/x', '#nope/x']) expect(parseTerminalHash(hash)).toBeNull();
  });
});

describe('terminalHash and canonicalRoute', () => {
  it('round-trips a target', () => {
    expect(terminalHash({ folder: 'shelf', view: 'books', seriesId: 12 })).toBe('shelf/books/12');
    expect(terminalHash({ folder: 'body', view: 'vitals' })).toBe('body/vitals');
  });
  it('rewrites old hashes to the canonical one', () => {
    expect(canonicalRoute('#training/body')).toBe('body/vitals');
    expect(canonicalRoute('#home')).toBe('desk');
    expect(canonicalRoute('#school')).toBe('study/school-term');
    expect(canonicalRoute('#archives/books/4')).toBe('shelf/books/4');
  });
  it('leaves canonical and unknown hashes alone', () => {
    expect(canonicalRoute('#body/overview')).toBe('body/overview');
    expect(canonicalRoute('#desk')).toBe('desk');
    expect(canonicalRoute('#nope/x')).toBe('nope/x');
    expect(canonicalRoute('')).toBe('');
  });
});
