/**
 * Strength-load conventions — the logic most likely
 * to give wrong numbers if read literally. Logged values are NOT real loads:
 *
 *   Convention valid FROM 2022-01-01 ONWARD:
 *     - Dumbbell exercises: logged = ONE dumbbell  -> real = logged x 2
 *     - Barbell presses/lifts: logged EXCLUDES the bar -> real = logged + 20 kg
 *     - Machines & cables: as-is
 *   Pre-2022: convention unknown -> NOT comparable, excluded from trends.
 *   After the total-weight switch date: athlete logs TOTAL weight -> as-is.
 *
 * Unit normalisation (lbs->kg) MUST already have happened: the +20 / x2 are kg.
 */
import type { Equipment, LoggingConvention } from '../domain/types.ts';
import type { AuditStub } from './audit.ts';

const BARBELL_BAR_KG = 20;

export interface ClassifiedExercise {
  exerciseName: string;
  equipment: Equipment;
}

/**
 * Equipment is encoded in the trailing parentheses of the title, e.g.
 * "Bench Press (Barbell)" / "Lateral Raise (Dumbbell)" / "Seated Row (Machine)".
 */
export function classifyEquipment(exerciseTitleRaw: string): ClassifiedExercise {
  const trimmed = exerciseTitleRaw.trim();
  // Match the LAST parenthetical group at end of string, so exercise names that
  // themselves contain parentheses (e.g. "Exercise (Detail) (Barbell)") still
  // resolve equipment from the trailing tag.
  const tagMatch = /\(([^()]*)\)\s*$/.exec(trimmed);
  if (!tagMatch) {
    return { exerciseName: trimmed, equipment: 'other' };
  }
  const tag = (tagMatch[1] ?? '').trim().toLowerCase();
  const name = trimmed.slice(0, tagMatch.index).trim();
  const exerciseName = name.length > 0 ? name : trimmed;

  let equipment: Equipment;
  if (tag.includes('dumbbell')) equipment = 'dumbbell';
  else if (tag.includes('barbell')) equipment = 'barbell';
  else if (tag.includes('machine')) equipment = 'machine';
  else if (tag.includes('cable')) equipment = 'cable';
  else equipment = 'other';

  return { exerciseName, equipment };
}

/**
 * Classify equipment from a free-text exercise NAME (an export with
 * no "(Equipment)" tag). Example: "Bench Press" 60kg +20 = 80 and
 * "Incline Db Bench Press" 20kg x2 = 40.
 *
 * Conservative on purpose: only the unambiguous barbell presses/lifts get +20,
 * "Db" gets x2, machine/cable are as-is, and everything else stays as-logged
 * rather than risk a wrong correction on historical context data.
 */
export function classifyEquipmentFromName(name: string): Equipment {
  const n = name.toLowerCase();
  if (/\bdb\b|dumbbell/.test(n)) return 'dumbbell';
  if (/\bkb\b|kettlebell/.test(n)) return 'other'; // kettlebell: logged weight is real
  if (/cable/.test(n)) return 'cable';
  if (/machine|leg press|pulldown|pull[\s-]?down|pec (deck|fly)|smith/.test(n)) return 'machine';
  if (/ez[\s-]?bar/.test(n)) return 'other'; // EZ-bar weight differs from a 20kg bar
  if (/pull[\s-]?up|chin[\s-]?up|push[\s-]?up|\bdip\b|plank|hanging/.test(n)) return 'other'; // bodyweight
  if (/bench press|overhead press|military press|\bohp\b|back squat|front squat|\bsquat\b|deadlift|barbell|hip thrust|bent[\s-]?over row|barbell row|romanian/.test(n)) {
    return 'barbell';
  }
  return 'other';
}

/**
 * The date-only portion (YYYY-MM-DD) of an ISO date/datetime string.
 * Fails loud on malformed input — a silently wrong date would mis-apply the
 * convention era and corrupt trend math (e.g. "2026-4-4" sorts wrong as a string).
 */
const dateOnly = (iso: string): string => {
  const d = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    throw new Error(`Invalid ISO date (expected YYYY-MM-DD[...]): "${iso}"`);
  }
  return d;
};

export interface SessionConvention {
  pre2022: boolean;
  isAfterSwitch: boolean;
  loggingConvention: LoggingConvention;
}

export interface SessionConventionConfig {
  conventionStart: string;
  switchDate: string;
}

export function determineSessionConvention(sessionDateIso: string, config: SessionConventionConfig): SessionConvention {
  const d = dateOnly(sessionDateIso);
  const pre2022 = d < dateOnly(config.conventionStart);
  // "from the next session AFTER the switch date" => strictly after. The exact
  // inclusive/exclusive boundary is configurable.
  const isAfterSwitch = d > dateOnly(config.switchDate);
  return {
    pre2022,
    isAfterSwitch,
    loggingConvention: isAfterSwitch ? 'total_weight' : 'one_dumbbell_plus_bar',
  };
}

export interface LoadConventionResult {
  /** Real load in kg, or null when not comparable (pre-2022) or no weight. */
  realLoadKg: number | null;
  correctionApplied: string;
  excludedFromTrend: boolean;
  comparable: boolean;
  pre2022: boolean;
  loggingConvention: LoggingConvention;
  audits: AuditStub[];
}

export interface ApplyLoadParams {
  /** Unit-normalised weight in kg (lbs already converted). */
  weightKg: number;
  equipment: Equipment;
  sessionDateIso: string;
  conventionStart: string;
  switchDate: string;
}

export function applyLoadConvention(params: ApplyLoadParams): LoadConventionResult {
  const { weightKg, equipment, sessionDateIso, conventionStart, switchDate } = params;
  const session = determineSessionConvention(sessionDateIso, { conventionStart, switchDate });

  if (session.pre2022) {
    return {
      realLoadKg: null,
      correctionApplied: 'pre-2022: convention unknown, excluded from trends',
      excludedFromTrend: true,
      comparable: false,
      pre2022: true,
      loggingConvention: session.loggingConvention,
      audits: [
        {
          conversionType: 'pre2022_excluded',
          inputValue: weightKg,
          outputValue: null,
          ruleReference: `session ${dateOnly(sessionDateIso)} < convention start ${dateOnly(conventionStart)}`,
        },
      ],
    };
  }

  if (session.isAfterSwitch) {
    return {
      realLoadKg: weightKg,
      correctionApplied: `total weight (post-switch ${dateOnly(switchDate)}), as-logged`,
      excludedFromTrend: false,
      comparable: true,
      pre2022: false,
      loggingConvention: 'total_weight',
      audits: [
        {
          conversionType: 'total_weight_passthrough',
          inputValue: weightKg,
          outputValue: weightKg,
          ruleReference: `session ${dateOnly(sessionDateIso)} > switch ${dateOnly(switchDate)} => total weight, no +20/x2`,
        },
      ],
    };
  }

  // In-convention era [conventionStart, switchDate]: apply by equipment.
  const base = {
    excludedFromTrend: false,
    comparable: true,
    pre2022: false,
    loggingConvention: 'one_dumbbell_plus_bar' as const,
  };

  switch (equipment) {
    case 'dumbbell': {
      const real = weightKg * 2;
      return {
        ...base,
        realLoadKg: real,
        correctionApplied: 'dumbbell: logged is one DB, real = x2',
        audits: [
          {
            conversionType: 'dumbbell_x2',
            inputValue: weightKg,
            outputValue: real,
            ruleReference: `${weightKg}kg per dumbbell x2 = ${real}kg`,
          },
        ],
      };
    }
    case 'barbell': {
      const real = weightKg + BARBELL_BAR_KG;
      return {
        ...base,
        realLoadKg: real,
        correctionApplied: `barbell: +${BARBELL_BAR_KG}kg bar`,
        audits: [
          {
            conversionType: 'barbell_plus20',
            inputValue: weightKg,
            outputValue: real,
            ruleReference: `${weightKg}kg + ${BARBELL_BAR_KG}kg bar = ${real}kg`,
          },
        ],
      };
    }
    default: {
      // machine, cable, other: logged value is the real load.
      return {
        ...base,
        realLoadKg: weightKg,
        correctionApplied: `${equipment}: as-is (no correction)`,
        audits: [
          {
            conversionType: 'machine_cable_as_is',
            inputValue: weightKg,
            outputValue: weightKg,
            ruleReference: `${equipment}: logged value is the real load`,
          },
        ],
      };
    }
  }
}
