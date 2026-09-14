import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { MockChatAdapter, MockObligationAdapter, MockOrganizationAdapter, MockRequirementAdapter, MockSourceAdapter } from '../src/data/mock-adapters.js';
import { EnhetsregisteretAdapter, EnhetsregisteretError } from '../src/data/enhetsregisteret-adapter.js';
import { DatasetOrganizationAdapter, DatasetOrganizationError } from '../src/data/dataset-organization-adapter.js';
import { OpenAIChatAdapter, OpenAIChatError } from '../src/data/openai-chat-adapter.js';
import { OppgaveregisteretAdapter, OppgaveregisteretError } from '../src/data/oppgaveregisteret-adapter.js';
import type { DemoUser, Obligation, TaskPreference, TaskRecurrence } from '../src/domain/types.js';
import { DemoStore } from './demo-store.js';

const app = Fastify({ logger: true });
const demoStore = new DemoStore(process.env.DEMO_STORE_PATH);
await demoStore.init();
const sessions = new Map<string, string>();
const organizationProvider = process.env.ENHETSREGISTERET_MODE ?? 'live';
const obligationProvider = process.env.OPPGAVEREGISTERET_MODE ?? 'live';
const organizations = organizationProvider === 'dataset'
  ? new DatasetOrganizationAdapter({ filePath: process.env.ENHETSREGISTERET_DATASET_PATH })
  : organizationProvider === 'live'
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

function sessionUser(request: { headers: { cookie?: string } }): DemoUser | null {
  const token = request.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith('br_orakel_session='))?.split('=')[1];
  const userId = token ? sessions.get(token) : undefined;
  return userId ? demoStore.getUser(userId) : null;
}

function setSession(reply: { header(name: string, value: string): unknown }, user: DemoUser): void {
  const token = randomBytes(32).toString('hex');
  sessions.set(token, user.id);
  reply.header('Set-Cookie', `br_orakel_session=${token}; Path=/; HttpOnly; SameSite=Lax`);
}

function clearSession(request: { headers: { cookie?: string } }, reply: { header(name: string, value: string): unknown }): void {
  const token = request.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith('br_orakel_session='))?.split('=')[1];
  if (token) sessions.delete(token);
  reply.header('Set-Cookie', 'br_orakel_session=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax');
}

function dateForYear(year: number, month: number, day: number): string | undefined {
  const date = new Date(year, month, day);
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day
    ? `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    : undefined;
}

function recurringDates(recurrence: TaskRecurrence): string[] {
  const start = new Date(`${recurrence.startDate}T00:00:00`);
  if (Number.isNaN(start.getTime())) return [];
  const year = start.getFullYear();
  const dates: string[] = [];
  const interval = Math.max(1, Math.floor(recurrence.interval || 1));
  const step = recurrence.frequency === 'monthly' ? interval : recurrence.frequency === 'quarterly' ? interval * 3 : interval * 12;
  for (let month = 0; month < 12; month += 1) {
    if (month % step !== start.getMonth() % step) continue;
    const date = dateForYear(year, month, Math.min(31, Math.max(1, recurrence.dayOfMonth)));
    if (date && date >= recurrence.startDate && (!recurrence.endDate || date <= recurrence.endDate)) dates.push(date);
  }
  return dates;
}

function normalizeTaskStatus(status: unknown): TaskPreference['status'] {
  if (status === 'not_started' || status === 'in_progress' || status === 'completed') return status;
  if (status === 'ready') return 'in_progress';
  if (status === 'submitted') return 'completed';
  if (status === 'not_applicable' || status === 'needs_clarification') return 'not_started';
  return undefined;
}

function applyPreference(obligation: Obligation, preference?: TaskPreference): Obligation {
  if (!preference) return obligation;
  const status = normalizeTaskStatus(preference.status);
  const today = new Date().toISOString().slice(0, 10);
  const isHidden = preference.hiddenForever === true || Boolean(preference.hiddenUntil && preference.hiddenUntil >= today);
  const withUserPreference = { ...obligation, ...(status ? { status } : {}), isHidden };
  if (!preference.activated || !preference.recurrence) return withUserPreference;
  const dates = recurringDates(preference.recurrence);
  return dates.length > 0 ? { ...withUserPreference, deadline: dates[0], reportingWindowStart: dates[0], deadlineDates: dates } : withUserPreference;
}

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

app.get('/api/auth/me', async (request, reply) => {
  const user = sessionUser(request);
  return user ?? reply.code(401).send({ message: 'Du er ikke logget inn.' });
});

app.post('/api/auth/register', async (request, reply) => {
  const body = request.body as { username?: string; displayName?: string; password?: string };
  if (!body?.username || !body.password) return reply.code(400).send({ message: 'Brukernavn og passord er obligatorisk.' });
  try {
    const user = await demoStore.createUser({ username: body.username, displayName: body.displayName ?? body.username, password: body.password });
    setSession(reply, user);
    return reply.code(201).send(user);
  } catch (error) {
    return reply.code(400).send({ message: error instanceof Error ? error.message : 'Kunne ikke opprette bruker.' });
  }
});

app.post('/api/auth/login', async (request, reply) => {
  const body = request.body as { username?: string; password?: string };
  const user = body?.username && body.password ? demoStore.authenticate(body.username, body.password) : null;
  if (!user) return reply.code(401).send({ message: 'Feil brukernavn eller passord.' });
  setSession(reply, user);
  return user;
});

app.post('/api/auth/logout', async (request, reply) => {
  clearSession(request, reply);
  return { ok: true };
});

app.get('/api/me/organizations', async (request, reply) => {
  const user = sessionUser(request);
  if (!user) return reply.code(401).send({ message: 'Du må logge inn før du velger virksomhet.' });
  const result = await Promise.all(user.organizationNumbers.map((orgNumber) => organizations.findByOrgNumber(orgNumber)));
  return result.filter((organization): organization is NonNullable<typeof organization> => Boolean(organization));
});

app.post('/api/me/organizations', async (request, reply) => {
  const user = sessionUser(request);
  if (!user) return reply.code(401).send({ message: 'Du må logge inn før du legger til virksomhet.' });
  const orgNumber = String((request.body as { orgNumber?: string })?.orgNumber ?? '').replace(/\s/g, '');
  const organization = await organizations.findByOrgNumber(orgNumber);
  if (!organization) return reply.code(404).send({ message: 'Virksomheten finnes ikke i Enhetsregisteret.' });
  return demoStore.addOrganization(user.id, organization.orgNumber);
});

app.delete('/api/me/organizations/:orgNumber', async (request, reply) => {
  const user = sessionUser(request);
  if (!user) return reply.code(401).send({ message: 'Du må logge inn før du endrer virksomheter.' });
  const { orgNumber } = request.params as { orgNumber: string };
  return demoStore.removeOrganization(user.id, orgNumber.replace(/\s/g, ''));
});

app.get('/api/organizations/search', async (request, reply) => {
  const { q = '' } = request.query as { q?: string };
  if (!q.trim()) return [];
  try {
    return await organizations.searchByName(q);
  } catch (error) {
    if (error instanceof DatasetOrganizationError) return reply.code(502).send({ code: 'DATASET_UNAVAILABLE', message: 'Det lokale hackathon-datasettet er ikke tilgjengelig akkurat nå.' });
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
    if (error instanceof DatasetOrganizationError) return reply.code(502).send({ code: 'DATASET_UNAVAILABLE', message: 'Det lokale hackathon-datasettet er ikke tilgjengelig akkurat nå.' });
    if (error instanceof EnhetsregisteretError) return reply.code(502).send({ code: 'ENHETSREGISTERET_UNAVAILABLE', message: 'Enhetsregisteret er ikke tilgjengelig akkurat nå. Prøv igjen senere.' });
    throw error;
  }
});

app.get('/api/organizations/:orgNumber/obligations', async (request, reply) => {
  const { orgNumber } = request.params as { orgNumber: string };
  try {
    const organization = await organizations.findByOrgNumber(orgNumber);
    if (!organization) return reply.code(404).send({ message: 'Virksomheten finnes ikke i Enhetsregisteret.' });
    const officialObligations = await obligations.listForOrganization(organization);
    const user = sessionUser(request);
    const preferences = user ? demoStore.preferences(user.id, organization.orgNumber) : [];
    return officialObligations.map((obligation) => applyPreference(obligation, preferences.find((item) => item.obligationId === obligation.id)));
  } catch (error) {
    if (error instanceof DatasetOrganizationError) {
      return reply.code(502).send({ code: 'DATASET_UNAVAILABLE', message: 'Det lokale hackathon-datasettet er ikke tilgjengelig akkurat nå.' });
    }
    if (error instanceof EnhetsregisteretError) {
      return reply.code(502).send({ code: 'ENHETSREGISTERET_UNAVAILABLE', message: 'Enhetsregisteret er ikke tilgjengelig akkurat nå. Prøv igjen senere.' });
    }
    if (error instanceof OppgaveregisteretError) {
      return reply.code(502).send({ code: 'OPPGAVEREGISTERET_UNAVAILABLE', message: 'Oppgaveregisteret er ikke tilgjengelig akkurat nå. Prøv igjen senere.' });
    }
    throw error;
  }
});

app.get('/api/organizations/:orgNumber/task-preferences', async (request, reply) => {
  const user = sessionUser(request);
  if (!user) return reply.code(401).send({ message: 'Du må logge inn før du endrer oppgaver.' });
  const { orgNumber } = request.params as { orgNumber: string };
  return demoStore.preferences(user.id, orgNumber.replace(/\s/g, ''));
});

app.put('/api/organizations/:orgNumber/task-preferences/:obligationId', async (request, reply) => {
  const user = sessionUser(request);
  if (!user) return reply.code(401).send({ message: 'Du må logge inn før du endrer oppgaver.' });
  const { orgNumber, obligationId } = request.params as { orgNumber: string; obligationId: string };
  const body = request.body as Partial<TaskPreference>;
  const existing = demoStore.preferences(user.id, orgNumber.replace(/\s/g, '')).find((item) => item.obligationId === obligationId);
  const status = body.status === undefined ? existing?.status : normalizeTaskStatus(body.status);
  if (body.status !== undefined && !status) return reply.code(400).send({ message: 'Ugyldig oppgavestatus.' });
  const preference: TaskPreference = {
    userId: user.id,
    orgNumber: orgNumber.replace(/\s/g, ''),
    obligationId,
    activated: body.activated ?? existing?.activated ?? false,
    comment: body.comment === undefined ? existing?.comment : typeof body.comment === 'string' ? body.comment.slice(0, 2000) : undefined,
    recurrence: body.recurrence ?? existing?.recurrence,
    status,
    hiddenUntil: body.hiddenForever !== undefined ? body.hiddenUntil : body.hiddenUntil ?? existing?.hiddenUntil,
    hiddenForever: body.hiddenForever ?? existing?.hiddenForever ?? false,
  };
  return demoStore.savePreference(user.id, preference);
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
    if (error instanceof DatasetOrganizationError) {
      return reply.code(502).send({ code: 'DATASET_UNAVAILABLE', message: 'Det lokale hackathon-datasettet er ikke tilgjengelig akkurat nå.' });
    }
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
