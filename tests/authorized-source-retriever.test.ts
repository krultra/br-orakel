import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthorizedSourceRetriever, selectSourceCandidates } from '../src/data/authorized-source-retriever.js';
import type { Source } from '../src/domain/types.js';

const source = (id: string, url: string, title: string, sourceType: Source['sourceType'] = 'guidance'): Source => ({
  id, url, title, sourceType, officiality: 'OFFICIAL_GUIDANCE', authority: 'OFFICIAL_GUIDANCE', retrievedAt: '2026-09-15T10:00:00.000Z', relevantExcerpt: title,
});

test('retriever velger få allowlistede kilder og hopper over store datasett', () => {
  const candidates = selectSourceCandidates('Hva gjelder mva og ansatte?', [
    source('mva', 'https://www.skatteetaten.no/mva', 'Mva-melding'),
    source('dataset', 'https://storage.googleapis.com/example/data.parquet', 'Virksomhetsdatasett', 'dataset'),
    source('random', 'https://example.org/mva', 'Tilfeldig nettside'),
  ], 2);
  assert.deepEqual(candidates.map((item) => item.id), ['mva']);
});

test('retriever begrenser innhold og returnerer relevant kontekst', async () => {
  let calledUrl = '';
  const retriever = new AuthorizedSourceRetriever({
    maxSources: 1,
    maxBytesPerSource: 80,
    maxCharsPerSource: 40,
    fetcher: async (url) => {
      calledUrl = url;
      return new Response('<html><script>hemmelig</script><body>Dette er relevant veiledning for mva.</body></html>', { headers: { 'content-type': 'text/html' } });
    },
  });
  const [context] = await retriever.retrieve('mva', [source('mva', 'https://www.skatteetaten.no/mva', 'Mva-melding')]);
  assert.equal(calledUrl, 'https://www.skatteetaten.no/mva');
  assert.equal(context.sourceId, 'mva');
  assert.match(context.text, /relevant veiledning/);
  assert.doesNotMatch(context.text, /hemmelig/);
  assert.ok(context.text.length <= 40);
});

test('retriever faller stille tilbake ved HTTP-feil', async () => {
  const retriever = new AuthorizedSourceRetriever({ fetcher: async () => new Response('feil', { status: 503 }) });
  assert.deepEqual(await retriever.retrieve('mva', [source('mva', 'https://www.skatteetaten.no/mva', 'Mva-melding')]), []);
});
