import assert from 'node:assert/strict';
import test from 'node:test';
import type { Response } from 'openai/resources/responses/responses';
import { MockObligationAdapter, MockOrganizationAdapter, MockSourceAdapter } from '../src/data/mock-adapters.js';
import { OpenAIChatAdapter, OpenAIChatError, type OpenAIResponseClient } from '../src/data/openai-chat-adapter.js';

test('OpenAIChatAdapter sender rik virksomhetskontekst og verifiserer kilde-ID-er', async () => {
  const organization = await new MockOrganizationAdapter().findByOrgNumber('999999999');
  assert.ok(organization);
  const obligations = await new MockObligationAdapter().listForOrganization(organization);
  const sources = await new MockSourceAdapter().search('');
  let receivedModel = '';
  let receivedInput = '';
  let receivedStore: boolean | undefined;

  const client: OpenAIResponseClient = {
    responses: {
      async create(body) {
        receivedModel = String(body.model ?? '');
        receivedInput = String(body.input);
        receivedStore = body.store ?? undefined;
        return {
          status: 'completed',
          output_text: JSON.stringify({
            answer: 'Bruk kildene under og avklar virksomhetens faktiske forhold.',
            uncertainty: 'Dette er veiledning, ikke en juridisk konklusjon.',
            sourceIds: [sources[0].id, 'not-a-real-source'],
            followUpQuestions: ['Har virksomheten ansatte?'],
          }),
        } as Response;
      },
    },
  };

  const answer = await new OpenAIChatAdapter({ client }).answer('Hva gjelder for oss?', {
    organization,
    obligations,
    sources,
    reportedRequirements: [],
    additionalContext: [{ id: 'knowledge-1', title: 'Ekstra veiledning', text: 'Bevar kilde-ID.', trustLevel: 'OFFICIAL_GUIDANCE' }],
  });

  assert.equal(receivedModel, 'gpt-5.6-luna');
  assert.match(receivedInput, /Fjordgløtt Mat og Handel AS/);
  assert.match(receivedInput, /Ekstra veiledning/);
  assert.equal(receivedStore, false);
  assert.deepEqual(answer.sourceIds, [sources[0].id]);
  assert.match(answer.uncertainty, /kunne ikke verifiseres/);
});

test('OpenAIChatAdapter avviser kontekst som er for stor i stedet for å kutte den stille', async () => {
  const client: OpenAIResponseClient = {
    responses: { async create() { throw new Error('skal ikke kalles'); } },
  };
  const adapter = new OpenAIChatAdapter({ client, maxContextChars: 10 });

  await assert.rejects(
    adapter.answer('Spørsmål', {
      organization: {
        orgNumber: '1',
        name: 'Eksempel',
        organizationForm: 'AS',
        industryCodes: [],
        hasEmployees: false,
        municipality: 'Malvik',
        sources: [],
      },
      obligations: [],
      sources: [],
    }),
    (error: unknown) => error instanceof OpenAIChatError && /større enn grensen/.test(error.message),
  );
});
