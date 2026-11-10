import type { ConversionType } from '../domain/types.ts';

/**
 * A pure description of a single lossy transform. The conventions engine emits
 * these so tests (and callers) can see which rule applied; nothing persists them.
 */
export interface AuditStub {
  conversionType: ConversionType;
  inputValue: number | null;
  outputValue: number | null;
  ruleReference: string;
}
