/**
 * Shoe mileage is ADDITIVE: the shoe's starting distance (`priorCountedKm`) plus
 * the km of runs logged with this shoe.
 */
import type { AuditStub } from './audit.ts';

export interface ShoeMileageInput {
  /** The shoe's starting distance. */
  priorCountedKm: number;
  /** Sum of the runs logged with this shoe since the reset (all runs in the DB). */
  fitRunsKm: number;
}

export interface ShoeMileageResult {
  /** Total distance: baseline + runs since the reset. */
  authoritativeKm: number;
  baselineKm: number;
  sinceResetKm: number;
  fitRunsKm: number;
  note: string;
  audits: AuditStub[];
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function reconcileShoeMileage(input: ShoeMileageInput): ShoeMileageResult {
  const { priorCountedKm, fitRunsKm } = input;
  const total = r1(priorCountedKm + fitRunsKm);
  return {
    authoritativeKm: total,
    baselineKm: priorCountedKm,
    sinceResetKm: r1(fitRunsKm),
    fitRunsKm,
    note: `${priorCountedKm} km before the 22 Jun 2026 reset + ${fitRunsKm.toFixed(1)} km logged since = ${total.toFixed(1)} km.`,
    audits: [
      {
        conversionType: 'shoe_dedupe',
        inputValue: fitRunsKm,
        outputValue: total,
        ruleReference: `additive: ${priorCountedKm}km at start + ${fitRunsKm.toFixed(1)}km logged since (pre-reset overlap wiped)`,
      },
    ],
  };
}
