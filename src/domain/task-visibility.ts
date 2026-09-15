import type { Obligation } from './types.js';

/**
 * Returns whether an occurrence should be shown as locally muted.
 * This never changes the official obligation or removes it from the catalogue.
 */
export function isMutedForDate(obligation: Pick<Obligation, 'isMuted'> & Partial<Pick<Obligation, 'mutedBefore' | 'organizationMutedBefore'>>, date?: string): boolean {
  const occurrenceDate = date?.slice(0, 10);
  const cutoffDates = [obligation.mutedBefore, obligation.organizationMutedBefore]
    .map((value) => value?.slice(0, 10))
    .filter((value): value is string => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value)));
  return obligation.isMuted === true || Boolean(occurrenceDate && /^\d{4}-\d{2}-\d{2}$/.test(occurrenceDate) && cutoffDates.some((cutoffDate) => occurrenceDate < cutoffDate));
}
