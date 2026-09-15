import assert from 'node:assert/strict';
import test from 'node:test';
import { MockChatAdapter, MockConceptAdapter, MockObligationAdapter, MockOrganizationAdapter, MockRequirementAdapter, MockSourceAdapter } from '../src/data/mock-adapters.js';

test('mock adapter finner demo-virksomheten på organisasjonsnummer', async () => {
  const organization = await new MockOrganizationAdapter().findByOrgNumber('999 999 999');
  assert.equal(organization?.name, 'Fjordgløtt Mat og Handel AS');
});

test('mock adapter finner demo-virksomheten på navn', async () => {
  const results = await new MockOrganizationAdapter().searchByName('fjordgløtt');
  assert.equal(results[0]?.orgNumber, '999999999');
});

test('oppgaver og chat bruker samme virksomhetskontekst', async () => {
  const organization = await new MockOrganizationAdapter().findByOrgNumber('999999999');
  assert.ok(organization);
  const obligations = await new MockObligationAdapter().listForOrganization(organization);
  assert.equal(obligations.length, 10);
  const sources = await new MockSourceAdapter().search('');
  const answer = await new MockChatAdapter().answer('Hva gjelder for ansatte?', { organization, obligations, sources });
  assert.ok(answer.sourceIds.length > 0);
  assert.match(answer.answer, /A-meldingen/);
});

test('begrepsadapteren finner lønn til kontekstuell oppslagshjelp', async () => {
  const results = await new MockConceptAdapter().search('lønn');
  assert.equal(results[0]?.term, 'lønn');
  assert.match(results[0]?.definition ?? '', /Godtgjørelse/);
  assert.equal(results[0]?.trustLevel, 'OFFICIAL_GUIDANCE');
});

test('brukerinnspill får egen status og kan oppdateres', async () => {
  const adapter = new MockRequirementAdapter();
  const before = await adapter.list();
  const created = await adapter.create({ title: 'Ny plikt', description: 'Beskrivelse', reportedBy: 'Test', evidenceLinks: [], aiSuggestions: [], confidence: 0.2, reviewStatus: 'new' });
  assert.equal((await adapter.list()).length, before.length + 1);
  const updated = await adapter.updateStatus(created.id, 'needs_more_info', { reviewedBy: 'cw-1', reviewedByName: 'Saksbehandler', note: 'Trenger dokumentasjon på hvem som har sendt forespørselen.' });
  assert.equal(updated?.reviewStatus, 'needs_more_info');
  assert.equal(updated?.reviewedByName, 'Saksbehandler');
  assert.equal(updated?.reviewHistory?.[0]?.note, 'Trenger dokumentasjon på hvem som har sendt forespørselen.');
  const dispatched = await adapter.dispatch(created.id, { targetAgency: 'Mattilsynet', message: 'Vurder om dette hører hjemme hos dere.', dispatchedBy: 'cw-1', dispatchedByName: 'Saksbehandler' });
  assert.equal(dispatched?.dispatches?.[0]?.status, 'queued');
});
