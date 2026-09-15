import assert from 'node:assert/strict';
import test from 'node:test';
import { FallbackSupportRegistryAdapter, MockSupportRegistryAdapter, SupportRegistryError } from '../src/data/support-registry-adapter.js';
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
