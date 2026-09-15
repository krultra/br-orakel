import assert from 'node:assert/strict';
import test from 'node:test';
import { classifySourceUrl, isAuthorizedSourceUrl, withSourceAuthority } from '../src/data/authorized-sources.js';

test('kildepolicyen klassifiserer godkjente domener og subdomener', () => {
  assert.equal(classifySourceUrl('https://data.brreg.no/oppgaveregisteret/api/docs/index.html'), 'AUTHORITATIVE');
  assert.equal(classifySourceUrl('https://www.skatteetaten.no/bedrift/'), 'OFFICIAL_GUIDANCE');
  assert.equal(classifySourceUrl('https://subdomain.digdir.no/veiledning'), 'OFFICIAL_GUIDANCE');
  assert.equal(isAuthorizedSourceUrl('https://lovdata.no/dokument/NL/lov/1997-02-28-19'), true);
});

test('kildepolicyen avviser lookalike-, http- og tilfeldige domener', () => {
  assert.equal(classifySourceUrl('https://brreg.no.example.org/'), 'UNVERIFIED');
  assert.equal(classifySourceUrl('http://brreg.no/'), 'UNVERIFIED');
  assert.equal(isAuthorizedSourceUrl('https://example.org/veiledning'), false);
});

test('eksisterende kilde får policyklassifisering uten å overskrive eksplisitt verdi', () => {
  const source = { id: 'source', title: 'BRREG', url: 'https://data.brreg.no/', sourceType: 'register' as const, officiality: 'OFFICIAL' as const, retrievedAt: '2026-09-15T10:00:00.000Z', relevantExcerpt: 'Utdrag' };
  assert.equal(withSourceAuthority(source).authority, 'AUTHORITATIVE');
  assert.equal(withSourceAuthority({ ...source, authority: 'DISCOVERY' }).authority, 'DISCOVERY');
});
