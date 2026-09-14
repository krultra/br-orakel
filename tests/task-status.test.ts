import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateRecurringStatus, statusForDate } from '../src/domain/task-status.js';

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
