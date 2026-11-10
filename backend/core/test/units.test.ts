import { describe, expect, it } from 'vitest';
import { kg } from '../src/domain/units.ts';

describe('kg', () => {
  it('kg constructor is a no-op brand (the athlete logs kg)', () => {
    expect(kg(60)).toBe(60);
  });
});
