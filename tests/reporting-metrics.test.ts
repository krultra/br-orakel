import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateReportingMinutes } from '../src/domain/reporting-metrics.js';
import type { Obligation } from '../src/domain/types.js';

const obligation = (overrides: Partial<Obligation> = {}): Obligation => ({
  id: 'test',
  name: 'Testoppgave',
  description: '',
  officialStatus: 'OFFICIAL',
  responsibleAgency: 'Testetat',
  legalBasis: 'Test',
  targetCriteria: [],
  deadlineDates: ['2026-09-05', '2026-10-05', '2027-01-05'],
  frequency: 'Månedlig',
  estimatedMinutes: 30,
  requiredData: [],
  attachments: [],
  sourceLinks: [],
  status: 'not_started',
  trigger: 'periodic',
  ...overrides,
});

test('estimates one occurrence per dated deadline in the selected window', () => {
  const result = estimateReportingMinutes([obligation()], new Date(2026, 8, 1), 2);
  assert.deepEqual(result, { minutes: 60, occurrenceCount: 2 });
});

test('excludes hidden, muted and per-occurrence hidden work from the estimate', () => {
  const result = estimateReportingMinutes([
    obligation({ hiddenByDate: { '2026-09-05': true } }),
    obligation({ id: 'muted', mutedBefore: '2027-01-01' }),
    obligation({ id: 'hidden', isHidden: true }),
  ], new Date(2026, 8, 1), 2);
  assert.deepEqual(result, { minutes: 30, occurrenceCount: 1 });
});
