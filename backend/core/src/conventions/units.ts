/**
 * Weight unit normalisation. This MUST run before any strength-load convention
 * (+20 bar / x2 dumbbell are stated in kg).
 *
 * The per-import unit is configurable (an export column may be named
 * weight_lbs). When it is lbs, this is a lossy conversion and emits an audit row.
 */
import { LB_TO_KG } from '../domain/units.ts';
import type { AuditStub } from './audit.ts';

export interface NormalizedWeight {
  kg: number;
  audits: AuditStub[];
}

export function normalizeWeight(rawWeight: number, unit: 'kg' | 'lbs'): NormalizedWeight {
  if (unit === 'lbs') {
    const kg = rawWeight * LB_TO_KG;
    return {
      kg,
      audits: [
        {
          conversionType: 'unit_lbs_to_kg',
          inputValue: rawWeight,
          outputValue: kg,
          ruleReference: `lbs->kg: ${rawWeight} x ${LB_TO_KG} = ${kg.toFixed(3)}`,
        },
      ],
    };
  }
  // kg passthrough is not a lossy transform → no audit row.
  return { kg: rawWeight, audits: [] };
}
