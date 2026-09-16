import assert from 'node:assert/strict';
import test from 'node:test';
import type { OrganizationAdapter } from '../src/domain/adapters.js';
import type { Organization } from '../src/domain/types.js';
import { DemoAwareOrganizationAdapter } from '../src/data/demo-aware-organization-adapter.js';
import { MockOrganizationAdapter } from '../src/data/mock-adapters.js';

const liveOrganization: Organization = {
  orgNumber: '123456789',
  name: 'Live Eksempel AS',
  organizationForm: 'AS',
  industryCodes: ['62.010'],
  municipality: 'Testby',
  sources: ['source-brreg-org'],
};

function stubLive(overrides: Partial<OrganizationAdapter> = {}): OrganizationAdapter {
  return {
    findByOrgNumber: async () => liveOrganization,
    searchByName: async () => [liveOrganization],
    ...overrides,
  };
}

test('demoadapteren finner mockvirksomheten på organisasjonsnummer i live-modus', async () => {
  let liveCalled = false;
  const adapter = new DemoAwareOrganizationAdapter(
    stubLive({ findByOrgNumber: async () => { liveCalled = true; return liveOrganization; } }),
    new MockOrganizationAdapter(),
  );

  const organization = await adapter.findByOrgNumber('999 999 999');

  assert.equal(organization?.name, 'Fjordgløtt Mat og Handel AS');
  assert.equal(liveCalled, false);
});

test('demoadapteren finner mockvirksomheten på navn uten livekall', async () => {
  let liveCalled = false;
  const adapter = new DemoAwareOrganizationAdapter(
    stubLive({ searchByName: async () => { liveCalled = true; return [liveOrganization]; } }),
    new MockOrganizationAdapter(),
  );

  const results = await adapter.searchByName('Fjordgløtt');

  assert.deepEqual(results.map((item) => item.orgNumber), ['999999999']);
  assert.equal(liveCalled, false);
});

test('demoadapteren videresender andre organisasjoner og livefeil', async () => {
  let requestedOrgNumber = '';
  const adapter = new DemoAwareOrganizationAdapter(
    stubLive({ findByOrgNumber: async (orgNumber) => { requestedOrgNumber = orgNumber; return liveOrganization; } }),
    new MockOrganizationAdapter(),
  );

  const organization = await adapter.findByOrgNumber('123 456 789');

  assert.equal(organization?.orgNumber, '123456789');
  assert.equal(requestedOrgNumber, '123 456 789');

  const failing = new DemoAwareOrganizationAdapter(
    stubLive({ searchByName: async () => { throw new Error('live unavailable'); } }),
    new MockOrganizationAdapter(),
  );
  await assert.rejects(() => failing.searchByName('En annen virksomhet'), /live unavailable/);
});
