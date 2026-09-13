import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { MockChatAdapter, MockObligationAdapter, MockOrganizationAdapter, MockRequirementAdapter, MockSourceAdapter } from '../src/data/mock-adapters.js';
import { OppgaveregisteretAdapter, OppgaveregisteretError } from '../src/data/oppgaveregisteret-adapter.js';

const app = Fastify({ logger: true });
const organizations = new MockOrganizationAdapter();
const obligations = process.env.OPPGAVEREGISTERET_MODE === 'live'
  ? new OppgaveregisteretAdapter({
      baseUrl: process.env.OPPGAVEREGISTERET_API,
      pageSize: Number(process.env.OPPGAVEREGISTERET_PAGE_SIZE ?? 100),
      timeoutMs: Number(process.env.OPPGAVEREGISTERET_TIMEOUT_MS ?? 10000),
    })
  : new MockObligationAdapter();
const sources = new MockSourceAdapter();
const requirements = new MockRequirementAdapter();
const chat = new MockChatAdapter();
const runtimeMode = process.env.OPPGAVEREGISTERET_MODE === 'live' ? 'oppgaveregisteret' : process.env.APP_MODE ?? 'mock';

await app.register(cors, { origin: true });

app.get('/api/health', async () => ({ ok: true, mode: runtimeMode }));

app.get('/api/organizations/:orgNumber', async (request, reply) => {
  const { orgNumber } = request.params as { orgNumber: string };
  const organization = await organizations.findByOrgNumber(orgNumber);
  if (!organization) return reply.code(404).send({ message: 'Virksomheten finnes ikke i mock-adapteren.' });
  return organization;
});

app.get('/api/organizations/:orgNumber/obligations', async (request, reply) => {
  const { orgNumber } = request.params as { orgNumber: string };
  const organization = await organizations.findByOrgNumber(orgNumber);
  if (!organization) return reply.code(404).send({ message: 'Virksomheten finnes ikke i mock-adapteren.' });
  try {
    return await obligations.listForOrganization(organization);
  } catch (error) {
    if (error instanceof OppgaveregisteretError) {
      return reply.code(502).send({ code: 'OPPGAVEREGISTERET_UNAVAILABLE', message: 'Oppgaveregisteret er ikke tilgjengelig akkurat nå. Prøv igjen senere.' });
    }
    throw error;
  }
});

app.get('/api/sources', async (request) => {
  const { q = '' } = request.query as { q?: string };
  return sources.search(q);
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

app.post('/api/chat', async (request) => {
  const { question, orgNumber = '912345678' } = request.body as { question: string; orgNumber?: string };
  const organization = await organizations.findByOrgNumber(orgNumber);
  if (!organization) return { answer: 'Velg en virksomhet før du spør.', uncertainty: 'Ingen virksomhet valgt.', sourceIds: [], followUpQuestions: [] };
  const organizationObligations = await obligations.listForOrganization(organization);
  return chat.answer(question, organization, organizationObligations);
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
