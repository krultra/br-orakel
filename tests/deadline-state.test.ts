import assert from 'node:assert/strict';
import test from 'node:test';
import { deadlineState } from '../src/domain/deadline-state.js';

const today = new Date(2026, 8, 16, 10, 0, 0);

test('viser forfalt når konkret frist passerte tidligere i inneværende måned', () => {
  assert.equal(deadlineState('not_started', '2026-09-05', false, today), 'overdue');
});

test('viser nær frist for dagens eller kommende frist innen to uker', () => {
  assert.equal(deadlineState('not_started', '2026-09-16', false, today), 'soon');
  assert.equal(deadlineState('not_started', '2026-09-25', false, today), 'soon');
});

test('automatisk innsending er normal før fristen, men forfalt etter fristen', () => {
  assert.equal(deadlineState('in_progress', '2026-09-20', true, today), 'normal');
  assert.equal(deadlineState('in_progress', '2026-09-05', true, today), 'overdue');
});
