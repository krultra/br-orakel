import assert from 'node:assert/strict';
import test from 'node:test';
import { redactCommunityText } from '../src/domain/community-content.js';

test('redactCommunityText removes organization and contact identifiers', () => {
  const result = redactCommunityText('Fjordgløtt Mat og Handel AS (999999999), Kari, kari@example.com, 91234567', [
    'Fjordgløtt Mat og Handel AS',
    '999999999',
    'Kari',
  ]);
  assert.equal(result, '[fjernet] ([fjernet]), [fjernet], [e-post fjernet], [telefonnummer fjernet]');
});

