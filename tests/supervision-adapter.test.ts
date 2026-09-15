import assert from 'node:assert/strict';
import test from 'node:test';
import { MockSupervisionAdapter } from '../src/data/supervision-adapter.js';
import type { Organization } from '../src/domain/types.js';

const organization: Organization = {
  orgNumber: '999999999',
  name: 'Fjordgløtt Mat og Handel AS',
  organizationForm: 'AS',
  industryCodes: ['47.110', '56.101'],
  hasEmployees: true,
  municipality: 'Trondheim',
  sources: [],
};

test('tilsynsadapteren matcher temaer på virksomhetsdata uten å lage et tilsynsvarsel', async () => {
  const themes = await new MockSupervisionAdapter().listForOrganization(organization);
  const hms = themes.find((theme) => theme.id === 'supervision-arbeidstilsynet-hms');
  const food = themes.find((theme) => theme.id === 'supervision-mattilsynet-servering');
  assert.ok(hms?.relevanceReasons.some((reason) => reason.includes('ansatte')));
  assert.ok(food?.relevanceReasons.some((reason) => reason.includes('handel eller servering')));
  assert.equal(themes.every((theme) => !('date' in theme)), true);
  assert.ok(themes.every((theme) => theme.sourceLinks.length > 0));
});

test('tilsynsadapteren viser manglende informasjon når virksomhetsgrunnlaget er ufullstendig', async () => {
  const themes = await new MockSupervisionAdapter().listForOrganization({ ...organization, hasEmployees: undefined, industryCodes: [] });
  const hms = themes.find((theme) => theme.id === 'supervision-arbeidstilsynet-hms');
  assert.ok(hms?.missingInformation.some((item) => item.includes('ansatte')));
});
