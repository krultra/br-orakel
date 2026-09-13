import assert from 'node:assert/strict';
import test from 'node:test';
import { MockChatAdapter, MockObligationAdapter, MockOrganizationAdapter, MockRequirementAdapter, MockSourceAdapter } from '../src/data/mock-adapters.js';

test('mock adapter finner demo-virksomheten på organisasjonsnummer', async () => {
  const organization = await new MockOrganizationAdapter().findByOrgNumber('912 345 678');
  assert.equal(organization?.name, 'Fjordgløtt Mat og Handel AS');
});

test('oppgaver og chat bruker samme virksomhetskontekst', async () => {
  const organization = await new MockOrganizationAdapter().findByOrgNumber('912345678');
  assert.ok(organization);
  const obligations = await new MockObligationAdapter().listForOrganization(organization);
  assert.equal(obligations.length, 10);
  const sources = await new MockSourceAdapter().search('');
  const answer = await new MockChatAdapter().answer('Hva gjelder for ansatte?', { organization, obligations, sources });
  assert.ok(answer.sourceIds.length > 0);
  assert.match(answer.answer, /A-meldingen/);
});

test('brukerinnspill får egen status og kan oppdateres', async () => {
  const adapter = new MockRequirementAdapter();
  const before = await adapter.list();
  const created = await adapter.create({ title: 'Ny plikt', description: 'Beskrivelse', reportedBy: 'Test', evidenceLinks: [], aiSuggestions: [], confidence: 0.2, reviewStatus: 'new' });
  assert.equal((await adapter.list()).length, before.length + 1);
  const updated = await adapter.updateStatus(created.id, 'needs_more_info');
  assert.equal(updated?.reviewStatus, 'needs_more_info');
});
