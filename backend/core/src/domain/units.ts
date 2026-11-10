/**
 * Branded scalar units + pure conversion helpers.
 *
 * Every number that crosses a module boundary carries its unit in the TYPE so a
 * "kg vs lbs" or "semicircles vs degrees" mix-up is a compile error, not a
 * silent ~2.2x or wildly-wrong-GPS bug.
 *
 * This file is pure: no I/O, no Date, no Math.random.
 */

declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

export type Kg = Brand<number, 'Kg'>;
export type Bpm = Brand<number, 'Bpm'>;
/** Metres per second (FIT speed / enhanced_speed). */
export type MetersPerSecond = Brand<number, 'MetersPerSecond'>;
/** Seconds since the Unix epoch (1970-01-01). */
export type UnixSeconds = Brand<number, 'UnixSeconds'>;
export type Degrees = Brand<number, 'Degrees'>;
export type DegreesC = Brand<number, 'DegreesC'>;

// --- Constructors (explicit, so the brand is applied deliberately) ---------

export const kg = (n: number): Kg => n as Kg;
export const bpm = (n: number): Bpm => n as Bpm;

// --- Conversions -----------------------------------------------------------

/** International avoirdupois pound. lbs -> kg. */
export const LB_TO_KG = 0.453_592_37;

/**
 * FIT timestamps count seconds since the FIT epoch (1989-12-31 00:00:00 UTC).
 * Unix epoch is 1970-01-01, so the offset is 631065600 seconds.
 */
export const FIT_EPOCH_OFFSET_S = 631_065_600;

/** degrees = semicircles * (180 / 2^31). Signed: negative = S/W. */
export const SEMICIRCLE_TO_DEGREE = 180 / 2 ** 31;
