import assert from 'node:assert/strict';
import test from 'node:test';
import { parseFormattedAnswer } from '../src/format-answer.js';

test('formattering av KI-svar avslutter nummererte og punktvise lister', () => {
  const blocks = parseFormattedAnswer('# Oversikt\n\nStart. 1. Første steg 2. Andre steg\n\n- Et punkt\n- Et annet punkt');

  assert.deepEqual(blocks, [
    { kind: 'heading', level: 1, text: 'Oversikt' },
    { kind: 'paragraph', text: 'Start.' },
    { kind: 'ordered', items: ['Første steg', 'Andre steg'] },
    { kind: 'unordered', items: ['Et punkt', 'Et annet punkt'] },
  ]);
});
