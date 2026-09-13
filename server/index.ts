import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { MockChatAdapter, MockObligationAdapter, MockOrganizationAdapter, MockRequirementAdapter, MockSourceAdapter } from '../src/data/mock-adapters.js';
import { EnhetsregisteretAdapter, EnhetsregisteretError } from '../src/data/enhetsregisteret-adapter.js';
import { OpenAIChatAdapter, OpenAIChatError } from '../src/data/openai-chat-adapter.js';
import { OppgaveregisteretAdapter, OppgaveregisteretError } from '../src/data/oppgaveregisteret-adapter.js';

const app = Fastify({ logger: true });
const organizationProvider = process.env.ENHETSREGISTERET_MODE ?? 'live';
const obligationProvider = process.env.OPPGAVEREGISTERET_MODE ?? 'live';
const organizations = organizationProvider === 'live'
  ? new EnhetsregisteretAdapter({
      baseUrl: process.env.ENHETSREGISTERET_API,
      timeoutMs: Number(process.env.ENHETSREGISTERET_TIMEOUT_MS ?? 10000),
    })
  : new MockOrganizationAdapter();
const obligations = obligationProvider === 'live'
  ? new OppgaveregisteretAdapter({
      baseUrl: process.env.OPPGAVEREGISTERET_API,
      pageSize: Number(process.env.OPPGAVEREGISTERET_PAGE_SIZE ?? 100),
      timeoutMs: Number(process.env.OPPGAVEREGISTERET_TIMEOUT_MS ?? 10000),
    })
  : new MockObligationAdapter();
const sources = new MockSourceAdapter();
const requirements = new MockRequirementAdapter();
const aiProvider = process.env.AI_PROVIDER ?? 'mock';
const chat = aiProvider === 'openai'
  ? new OpenAIChatAdapter({
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL,
      maxOutputTokens: Number(process.env.OPENAI_MAX_OUTPUT_TOKENS ?? 12000),
      maxContextChars: Number(process.env.OPENAI_MAX_CONTEXT_CHARS ?? 1000000),
      timeoutMs: Number(process.env.OPENAI_TIMEOUT_MS ?? 60000),
      storeResponses: process.env.OPENAI_STORE_RESPONSES === 'true',
    })
  : new MockChatAdapter();
const runtimeMode = obligationProvider === 'live' ? 'oppgaveregisteret' : process.env.APP_MODE ?? 'mock';

const sourcesForOrganization = async (query: string, orgNumber?: string) => {
  const availableSources = await sources.search(query);
  if (!orgNumber) return availableSources;
  const normalizedOrgNumber = orgNumber.replace(/\s/g, '');
  return availableSources.map((source) => source.id === 'source-brreg-org'
    ? {
        ...source,
        url: `https://data.brreg.no/enhetsregisteret/api/enheter/${encodeURIComponent(normalizedOrgNumber)}`,
        relevantExcerpt: `Offisielle virksomhetsopplysninger fra Enhetsregisteret for organisasjonsnummer ${normalizedOrgNumber}.`,
      }
    : source);
};

await app.register(cors, { origin: true });

app.get('/api/health', async () => ({ ok: true, mode: runtimeMode, aiProvider, organizationProvider, obligationProvider }));

app.get('/api/organizations/search', async (request, reply) => {
  const { q = '' } = request.query as { q?: string };
  if (!q.trim()) return [];
  try {
    return await organizations.searchByName(q);
  } catch (error) {
    if (error instanceof EnhetsregisteretError) return reply.code(502).send({ code: 'ENHETSREGISTERET_UNAVAILABLE', message: 'Enhetsregisteret er ikke tilgjengelig akkurat nå. Prøv igjen senere.' });
    throw error;
  }
});

app.get('/api/organizations/:orgNumber', async (request, reply) => {
  const { orgNumber } = request.params as { orgNumber: string };
  try {
    const organization = await organizations.findByOrgNumber(orgNumber);
    if (!organization) return reply.code(404).send({ message: 'Virksomheten finnes ikke i Enhetsregisteret.' });
    return organization;
  } catch (error) {
    if (error instanceof EnhetsregisteretError) return reply.code(502).send({ code: 'ENHETSREGISTERET_UNAVAILABLE', message: 'Enhetsregisteret er ikke tilgjengelig akkurat nå. Prøv igjen senere.' });
    throw error;
  }
});

app.get('/api/organizations/:orgNumber/obligations', async (request, reply) => {
  const { orgNumber } = request.params as { orgNumber: string };
  try {
    const organization = await organizations.findByOrgNumber(orgNumber);
    if (!organization) return reply.code(404).send({ message: 'Virksomheten finnes ikke i Enhetsregisteret.' });
    return await obligations.listForOrganization(organization);
  } catch (error) {
    if (error instanceof EnhetsregisteretError) {
      return reply.code(502).send({ code: 'ENHETSREGISTERET_UNAVAILABLE', message: 'Enhetsregisteret er ikke tilgjengelig akkurat nå. Prøv igjen senere.' });
    }
    if (error instanceof OppgaveregisteretError) {
      return reply.code(502).send({ code: 'OPPGAVEREGISTERET_UNAVAILABLE', message: 'Oppgaveregisteret er ikke tilgjengelig akkurat nå. Prøv igjen senere.' });
    }
    throw error;
  }
});

app.get('/api/sources', async (request) => {
  const { q = '', orgNumber } = request.query as { q?: string; orgNumber?: string };
  return sourcesForOrganization(q, orgNumber);
});

app.get('/api/reported-requirements', async () => requirements.list());

app.post('/api/reported-requirements', async (request, reply) => {
  const body = request.body as any;
  if (!body?.title || !body?.description) return reply.code(400).send({ message: 'Tittel og beskrivelse er obligatorisk.' });
  return reply.code(201).send(await requirements.create({
    title: body.title,
    description: body.description,
    reportedBy: body.reportedBy || 'Demo-bruker',
    suspectedAgency: body.suspectedAgency,
    suspectedLegalBasis: body.suspectedLegalBasis,
    targetGroup: body.targetGroup,
    frequency: body.frequency,
    deadline: body.deadline,
    evidenceLinks: body.evidenceLinks ?? [],
    aiSuggestions: body.aiSuggestions ?? ['Avklar kilden og om innspillet allerede finnes i Oppgaveregisteret.'],
    confidence: 0.42,
    reviewStatus: 'new',
  }));
});

app.patch('/api/reported-requirements/:id', async (request, reply) => {
  const { id } = request.params as { id: string };
  const { reviewStatus } = request.body as { reviewStatus: string };
  const allowed = ['new', 'needs_more_info', 'forwarded', 'confirmed', 'rejected', 'duplicate'];
  if (!allowed.includes(reviewStatus)) return reply.code(400).send({ message: 'Ugyldig status.' });
  const updated = await requirements.updateStatus(id, reviewStatus as any);
  return updated ? updated : reply.code(404).send({ message: 'Innspillet finnes ikke.' });
});

app.post('/api/chat', async (request, reply) => {
  const { question, orgNumber = '' } = request.body as { question?: string; orgNumber?: string };
  if (!question?.trim()) return reply.code(400).send({ message: 'Spørsmålet kan ikke være tomt.' });
  try {
    const organization = await organizations.findByOrgNumber(orgNumber);
    if (!organization) return { answer: 'Velg en virksomhet før du spør.', uncertainty: 'Ingen virksomhet valgt.', sourceIds: [], followUpQuestions: [] };
    const [organizationObligations, availableSources, reportedRequirements] = await Promise.all([
      obligations.listForOrganization(organization),
      sourcesForOrganization('', organization.orgNumber),
      requirements.list(),
    ]);
    return await chat.answer(question, {
      organization,
      obligations: organizationObligations,
      sources: availableSources,
      reportedRequirements,
    });
  } catch (error) {
    if (error instanceof EnhetsregisteretError) {
      return reply.code(502).send({ code: 'ENHETSREGISTERET_UNAVAILABLE', message: 'Enhetsregisteret er ikke tilgjengelig akkurat nå. Prøv igjen senere.' });
    }
    if (error instanceof OpenAIChatError) {
      return reply.code(502).send({ code: 'AI_UNAVAILABLE', message: error.message });
    }
    if (error instanceof OppgaveregisteretError) {
      return reply.code(502).send({ code: 'OPPGAVEREGISTERET_UNAVAILABLE', message: 'Oppgaveregisteret er ikke tilgjengelig akkurat nå. Prøv igjen senere.' });
    }
    throw error;
  }
});

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(currentDir, '../dist');
if (process.env.NODE_ENV === 'production') {
  await app.register(fastifyStatic, { root: distDir });
  app.setNotFoundHandler((request, reply) => {
    if (request.raw.url?.startsWith('/api/')) return reply.code(404).send({ message: 'API-rute finnes ikke.' });
    return reply.sendFile('index.html');
  });
}

const port = Number(process.env.PORT ?? 3001);
await app.listen({ port, host: process.env.HOST ?? '0.0.0.0' });
