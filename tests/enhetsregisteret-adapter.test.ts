import assert from 'node:assert/strict';
import test from 'node:test';
import { EnhetsregisteretAdapter, EnhetsregisteretError } from '../src/data/enhetsregisteret-adapter.js';

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

const rawOrganization = {
  organisasjonsnummer: '999999999',
  navn: 'Fjordgløtt Mat og Handel AS',
  organisasjonsform: { kode: 'AS', beskrivelse: 'Aksjeselskap' },
  registrertIMvaregisteret: true,
  registrertIForetaksregisteret: true,
  registreringsdatoEnhetsregisteret: '2019-03-12',
  antallAnsatte: 8,
  sisteInnsendteAarsregnskap: ['2025', '2024', '2025'],
  overordnetEnhet: '987654321',
  forretningsadresse: { kommune: 'Trondheim', kommunenummer: '5001' },
  postadresse: { kommune: 'Trondheim', kommunenummer: '5001' },
  naeringskode1: { kode: '47.110', beskrivelse: 'Butikkhandel' },
  naeringskode2: { kode: '56.101', beskrivelse: 'Restaurantvirksomhet' },
};

test('Enhetsregisteret-adapteren slår opp og normaliserer grunnlag for oppgaveregisteret', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const adapter = new EnhetsregisteretAdapter({
    fetcher: async (url, init) => {
      requests.push({ url, init });
      return jsonResponse(rawOrganization);
    },
  });

  const organization = await adapter.findByOrgNumber('999 999 999');

  assert.ok(organization);
  assert.equal(requests[0].url, 'https://data.brreg.no/enhetsregisteret/api/enheter/999999999');
  assert.equal(organization.orgNumber, '999999999');
  assert.equal(organization.organizationForm, 'AS');
  assert.equal(organization.organizationFormName, 'Aksjeselskap');
  assert.deepEqual(organization.industryCodes, ['47.110', '56.101']);
  assert.equal(organization.hasEmployees, true);
  assert.equal(organization.employeeCount, 8);
  assert.deepEqual(organization.submittedAnnualAccountYears, [2025, 2024]);
  assert.equal(organization.registeredInMvaRegister, true);
  assert.equal(organization.registeredInForetaksregister, true);
  assert.equal(organization.municipality, 'Trondheim');
  assert.equal(organization.municipalityNumber, '5001');
  assert.deepEqual(organization.sources, ['source-brreg-org']);
});

test('Enhetsregisteret-adapteren søker på virksomhetsnavn og mapper paginert resultat', async () => {
  let requestedUrl = '';
  const adapter = new EnhetsregisteretAdapter({
    fetcher: async (url) => {
      requestedUrl = url;
      return jsonResponse({ _embedded: { enheter: [rawOrganization] }, page: { number: 0, size: 5, totalElements: 1 } });
    },
  });

  const results = await adapter.searchByName('Fjordgløtt', 5);
  const url = new URL(requestedUrl);

  assert.equal(results.length, 1);
  assert.equal(results[0].name, 'Fjordgløtt Mat og Handel AS');
  assert.equal(url.searchParams.get('navn'), 'Fjordgløtt');
  assert.equal(url.searchParams.get('navnMetodeForSoek'), 'FORTLOEPENDE');
  assert.equal(url.searchParams.get('size'), '5');
});

test('Enhetsregisteret-adapteren returnerer null for ukjent eller fjernet virksomhet', async () => {
  for (const status of [404, 410]) {
    const adapter = new EnhetsregisteretAdapter({ fetcher: async () => jsonResponse({}, status) });
    assert.equal(await adapter.findByOrgNumber('999999999'), null);
  }
  const invalid = new EnhetsregisteretAdapter({ fetcher: async () => jsonResponse({}) });
  assert.equal(await invalid.findByOrgNumber('ikke-et-orgnr'), null);
});

test('Enhetsregisteret-adapteren eksponerer utilgjengelig register med status og URL', async () => {
  const adapter = new EnhetsregisteretAdapter({ fetcher: async (url) => jsonResponse({}, 503) });

  await assert.rejects(
    () => adapter.findByOrgNumber('999999999'),
    (error: unknown) => error instanceof EnhetsregisteretError
      && error.status === 503
      && error.url.endsWith('/enheter/999999999'),
  );
});
