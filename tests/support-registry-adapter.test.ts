import assert from 'node:assert/strict';
import test from 'node:test';
import { DemoAwareSupportRegistryAdapter, FallbackSupportRegistryAdapter, MockSupportRegistryAdapter, SupportRegistryError } from '../src/data/support-registry-adapter.js';
import type { SupportRegistryAdapter } from '../src/domain/adapters.js';

test('støtteregisterets mockadapter holder støttedata adskilt fra rapporteringsplikter', async () => {
  const result = await new MockSupportRegistryAdapter().listForOrganization('938497257');
  assert.equal(result.sourceType, 'mock');
  assert.equal(result.awards.length, 2);
  assert.equal(result.awards[0]?.trustLevel, 'OFFICIAL');
  assert.equal(result.awards[0]?.organizationNumber, '938497257');
});

test('støtteregisteret faller tilbake til mockdata når lokal provider ikke er tilgjengelig', async () => {
  const unavailable: SupportRegistryAdapter = {
    listForOrganization: async () => { throw new SupportRegistryError('ikke tilgjengelig', 'data/raw'); },
  };
  const result = await new FallbackSupportRegistryAdapter(unavailable, new MockSupportRegistryAdapter()).listForOrganization('986954244');
  assert.equal(result.sourceType, 'mock');
  assert.equal(result.awards.length, 1);
});

test('demoorganisasjonen bruker støtte-mockdata også når datasettet er tilgjengelig', async () => {
  const primary: SupportRegistryAdapter = {
    listForOrganization: async (organizationNumber) => ({
      organizationNumber,
      awards: [],
      sourceUrl: 'https://example.test',
      sourceType: 'dataset',
      retrievedAt: new Date().toISOString(),
      coverageNote: 'test',
    }),
  };
  const adapter = new DemoAwareSupportRegistryAdapter(primary, new MockSupportRegistryAdapter());

  const demo = await adapter.listForOrganization('999 999 999');
  assert.equal(demo.sourceType, 'mock');
  assert.equal(demo.awards.length, 4);
  assert.equal(demo.awards.every((award) => award.organizationNumber === '999999999'), true);

  const real = await adapter.listForOrganization('938497257');
  assert.equal(real.sourceType, 'dataset');
  assert.equal(real.awards.length, 0);
});
