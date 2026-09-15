import type { Obligation } from './types.js';

/**
 * Returns whether an occurrence should be shown as locally muted.
 * This never changes the official obligation or removes it from the catalogue.
 */
export function isMutedForDate(obligation: Pick<Obligation, 'isMuted'> & Partial<Pick<Obligation, 'mutedBefore'>>, date?: string): boolean {
  return obligation.isMuted === true || Boolean(date && obligation.mutedBefore && date < obligation.mutedBefore);
}
