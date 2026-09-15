import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeConceptSelection, splitConceptText } from '../src/components/concept-text.js';

test('begrepshjelp markerer bare eksplisitt kuraterte ord', () => {
  const parts = splitConceptText('Rapportering av lønns- og ansettelsesforhold.', [{ label: 'lønns', query: 'lønn' }]);
  assert.deepEqual(parts.map((part) => part.text), ['Rapportering av ', 'lønns', '- og ansettelsesforhold.']);
  assert.equal(parts[1]?.link?.query, 'lønn');
});

test('markert begrep normaliseres før katalogoppslag', () => {
  assert.equal(normalizeConceptSelection('  lønns\n'), 'lønns');
  assert.equal(normalizeConceptSelection('  HMS. '), 'HMS');
  assert.equal(normalizeConceptSelection('x'), 'x');
});
