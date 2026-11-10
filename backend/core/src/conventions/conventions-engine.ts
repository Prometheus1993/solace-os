/**
 * The single correction funnel. Raw export values go in; corrected, audited
 * domain values come out. Nothing else in the system is allowed to apply a
 * unit/load/mileage correction — so every coaching number is traceable to one
 * place and one audit trail.
 */
import type { Equipment, LoggingConvention } from '../domain/types.ts';
import type { AuditStub } from './audit.ts';
import { normalizeWeight } from './units.ts';
import {
  applyLoadConvention,
  classifyEquipment,
  determineSessionConvention,
} from './strength-load.ts';

export interface StrengthConventionConfig {
  conventionStart: string;
  switchDate: string;
}

export interface RawStrengthSetInput {
  exerciseTitleRaw: string;
  rawWeight: number | null;
  rawWeightUnit: 'kg' | 'lbs';
  /** Session start as ISO date/datetime; only the date drives the convention. */
  sessionDateIso: string;
  /**
   * Pre-resolved equipment + name from the importer (classified
   * by name). When omitted, equipment is read from the title's "(Equipment)" tag.
   */
  equipment?: Equipment;
  exerciseName?: string;
}

export interface CorrectedStrengthSet {
  exerciseName: string;
  equipment: Equipment;
  weightKgNormalized: number | null;
  realLoadKg: number | null;
  correctionApplied: string;
  excludedFromTrend: boolean;
  comparable: boolean;
  pre2022: boolean;
  loggingConvention: LoggingConvention;
  /** Unit conversion first (if any), then the load convention. Order matters. */
  audits: AuditStub[];
}

export function correctStrengthSet(raw: RawStrengthSetInput, config: StrengthConventionConfig): CorrectedStrengthSet {
  const classified = classifyEquipment(raw.exerciseTitleRaw);
  const equipment = raw.equipment ?? classified.equipment;
  const exerciseName = raw.exerciseName ?? classified.exerciseName;

  // Bodyweight / no external load, or invalid negative weight: still resolve
  // session-level convention fields, but record no real load.
  if (raw.rawWeight == null || raw.rawWeight < 0) {
    const session = determineSessionConvention(raw.sessionDateIso, config);
    return {
      exerciseName,
      equipment,
      weightKgNormalized: null,
      realLoadKg: null,
      correctionApplied: raw.rawWeight == null ? 'no weight logged' : 'invalid negative weight: ignored',
      excludedFromTrend: session.pre2022,
      comparable: !session.pre2022,
      pre2022: session.pre2022,
      loggingConvention: session.loggingConvention,
      audits: [],
    };
  }

  // 1) Units FIRST (lbs->kg), because the load conventions are stated in kg.
  const norm = normalizeWeight(raw.rawWeight, raw.rawWeightUnit);
  // 2) THEN the date+equipment load convention.
  const load = applyLoadConvention({
    weightKg: norm.kg,
    equipment,
    sessionDateIso: raw.sessionDateIso,
    conventionStart: config.conventionStart,
    switchDate: config.switchDate,
  });

  return {
    exerciseName,
    equipment,
    weightKgNormalized: norm.kg,
    realLoadKg: load.realLoadKg,
    correctionApplied: load.correctionApplied,
    excludedFromTrend: load.excludedFromTrend,
    comparable: load.comparable,
    pre2022: load.pre2022,
    loggingConvention: load.loggingConvention,
    audits: [...norm.audits, ...load.audits],
  };
}
