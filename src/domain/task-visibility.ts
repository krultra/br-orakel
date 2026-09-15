import type { Obligation } from './types.js';

/**
 * Returns whether an occurrence should be shown as locally muted.
 * This never changes the official obligation or removes it from the catalogue.
 */
export function isMutedForDate(obligation: Pick<Obligation, 'isMuted'> & Partial<Pick<Obligation, 'mutedBefore'>>, date?: string): boolean {
  const occurrenceDate = date?.slice(0, 10);
  const cutoffDate = obligation.mutedBefore?.slice(0, 10);
  return obligation.isMuted === true || Boolean(occurrenceDate && cutoffDate && /^\d{4}-\d{2}-\d{2}$/.test(occurrenceDate) && /^\d{4}-\d{2}-\d{2}$/.test(cutoffDate) && occurrenceDate < cutoffDate);
}
