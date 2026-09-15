import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateRecurringStatus, statusForDate } from '../src/domain/task-status.js';
import { isMutedForDate } from '../src/domain/task-visibility.js';

const dates = ['2026-09-05', '2026-10-05', '2026-11-05'];

test('status for én gjentakende frist endrer ikke de andre fristene', () => {
  const statusByDate = { '2026-09-05': 'completed' as const };

  assert.equal(statusForDate('in_progress', '2026-09-05', statusByDate), 'completed');
  assert.equal(statusForDate('in_progress', '2026-10-05', statusByDate), 'not_started');
  assert.equal(statusForDate('in_progress', undefined, statusByDate), 'in_progress');
  assert.equal(aggregateRecurringStatus('in_progress', dates, statusByDate), 'in_progress');
});

test('serie blir ferdig først når alle kjente frister er ferdige', () => {
  assert.equal(aggregateRecurringStatus('not_started', dates, {
    '2026-09-05': 'completed',
    '2026-10-05': 'completed',
    '2026-11-05': 'completed',
  }), 'completed');
});

test('historiske forekomster kan dempes uten å skjule hele oppgaven', () => {
  const obligation = { isMuted: false, mutedBefore: '2026-07-01' };

  assert.equal(isMutedForDate(obligation, '2026-06-05'), true);
  assert.equal(isMutedForDate(obligation, '2026-07-05'), false);
  assert.equal(isMutedForDate({ isMuted: false, organizationMutedBefore: '2026-07-01' }, '2026-06-05'), true);
  assert.equal(isMutedForDate({ isMuted: false, organizationMutedBefore: '2026-07-01' }, '2026-07-05'), false);
  assert.equal(isMutedForDate({ isMuted: true }, '2026-10-05'), true);
});
