import assert from 'node:assert/strict';
import test from 'node:test';
import { FallbackConceptAdapter, FdkConceptAdapter } from '../src/data/fdk-concept-adapter.js';
import { MockConceptAdapter } from '../src/data/mock-adapters.js';

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
});

test('FDK-adapteren mapper søketreff og detaljoppslag til begrepsmodellen', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const adapter = new FdkConceptAdapter({
    searchUrl: 'https://search.example.test/search',
    resourceUrl: 'https://resource.example.test/v1',
    fetcher: async (url, init) => {
      requests.push({ url, init });
      if (url.includes('/search')) return jsonResponse({ hits: [{
        id: 'concept-1',
        uri: 'https://catalog.example.test/concepts/concept-1',
        title: { nb: 'arbeidstaker' },
        additionalTitles: [{ nb: 'ansatt' }],
        description: { nb: 'En person som utfører arbeid.' },
        organization: { id: '974761076', name: 'SKATTEETATEN' },
        relations: [{ uri: 'https://catalog.example.test/concepts/employee', type: 'generalizes' }],
      }] });
      return jsonResponse({
        id: 'concept-1',
        uri: 'https://catalog.example.test/concepts/concept-1',
        prefLabel: { nb: 'arbeidstaker' },
        definition: { text: { nb: 'En person som utfører arbeid i en annens tjeneste.' } },
        publisher: { id: '974761076', name: 'Skatteetaten' },
        status: { nb: 'gjeldende' },
        genericRelation: [{ generalizes: 'https://catalog.example.test/concepts/employee' }],
      });
    },
  });

  const [searchResult] = await adapter.search('ansatt', 5);
  assert.equal(searchResult.term, 'arbeidstaker');
  assert.deepEqual(searchResult.alternativeTerms, ['ansatt']);
  assert.equal(searchResult.trustLevel, 'OFFICIAL_GUIDANCE');
  assert.equal(searchResult.relatedConcepts[0]?.relation, 'generalizes');

  const detailed = await adapter.getById('concept-1');
  assert.equal(detailed?.definition, 'En person som utfører arbeid i en annens tjeneste.');
  assert.equal(detailed?.status, 'gjeldende');
  assert.equal(requests[0]?.init?.method, 'POST');
  assert.match(String(requests[0]?.init?.body), /"query":"ansatt"/);
});

test('FDK-adapteren returnerer null for ukjent detalj', async () => {
  const adapter = new FdkConceptAdapter({ fetcher: async () => jsonResponse({}, 404) });
  assert.equal(await adapter.getById('missing'), null);
  assert.equal(await adapter.getByUri('https://example.test/missing'), null);
});

test('fallback-adapteren holder begrepssøk tilgjengelig ved feil i FDK', async () => {
  const primary = new FdkConceptAdapter({ fetcher: async () => { throw new Error('offline'); } });
  const fallback = new MockConceptAdapter();
  const adapter = new FallbackConceptAdapter(primary, fallback);
  const results = await adapter.search('internkontroll');
  assert.equal(results[0]?.term, 'internkontroll');
});
