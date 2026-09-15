import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { MockChatAdapter, MockConceptAdapter, MockObligationAdapter, MockOrganizationAdapter, MockRequirementAdapter, MockSourceAdapter } from '../src/data/mock-adapters.js';
import { EnhetsregisteretAdapter, EnhetsregisteretError } from '../src/data/enhetsregisteret-adapter.js';
import { DatasetOrganizationAdapter, DatasetOrganizationError } from '../src/data/dataset-organization-adapter.js';
import { OpenAIChatAdapter, OpenAIChatError } from '../src/data/openai-chat-adapter.js';
import { OppgaveregisteretAdapter, OppgaveregisteretError } from '../src/data/oppgaveregisteret-adapter.js';
import { FallbackConceptAdapter, FdkConceptAdapter, FdkConceptError } from '../src/data/fdk-concept-adapter.js';
import { MockSupervisionAdapter } from '../src/data/supervision-adapter.js';
import { authorizedSourceDomains, withSourceAuthority } from '../src/data/authorized-sources.js';
import { AuthorizedSourceRetriever } from '../src/data/authorized-source-retriever.js';
import type { ChatShareProposal, DemoUser, Obligation, OrganizationViewPreference, TaskPreference, TaskRecurrence, TaskStatus } from '../src/domain/types.js';
import { aggregateRecurringStatus } from '../src/domain/task-status.js';
import { redactCommunityText } from '../src/domain/community-content.js';
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
const supervision = new MockSupervisionAdapter();
const sources = new MockSourceAdapter();
const conceptMode = process.env.FDK_CONCEPT_MODE ?? 'live';
const concepts = conceptMode === 'mock'
  ? new MockConceptAdapter()
  : new FallbackConceptAdapter(
      new FdkConceptAdapter({
        searchUrl: process.env.FDK_CONCEPT_SEARCH_API,
        resourceUrl: process.env.FDK_CONCEPT_RESOURCE_API,
        timeoutMs: Number(process.env.FDK_CONCEPT_TIMEOUT_MS ?? 5000),
      }),
      new MockConceptAdapter(),
    );
const sourceRetriever = new AuthorizedSourceRetriever({
  timeoutMs: Number(process.env.SOURCE_RETRIEVAL_TIMEOUT_MS ?? 2500),
  maxSources: Number(process.env.SOURCE_RETRIEVAL_MAX_SOURCES ?? 2),
  maxBytesPerSource: Number(process.env.SOURCE_RETRIEVAL_MAX_BYTES ?? 500000),
  maxCharsPerSource: Number(process.env.SOURCE_RETRIEVAL_MAX_CHARS ?? 8000),
});
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
  const dates: string[] = [];
  const interval = Math.max(1, Math.floor(recurrence.interval || 1));
  const step = recurrence.frequency === 'monthly' ? interval : recurrence.frequency === 'quarterly' ? interval * 3 : interval * 12;
  const currentYear = new Date().getFullYear();
  for (let year = currentYear - 1; year <= currentYear + 2; year += 1) {
    for (let month = 0; month < 12; month += 1) {
      const monthIndex = (year - start.getFullYear()) * 12 + month;
      if (monthIndex < 0 || monthIndex % step !== start.getMonth() % step) continue;
      const date = dateForYear(year, month, Math.min(31, Math.max(1, recurrence.dayOfMonth)));
      if (date && date >= recurrence.startDate && (!recurrence.endDate || date <= recurrence.endDate)) dates.push(date);
    }
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

function validDateKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizedDateMap(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entries = Object.entries(value).filter(([date, item]) => validDateKey(date) && typeof item === 'string' && item.length > 0);
  return entries.length ? Object.fromEntries(entries) : {};
}

function automaticStatusByDate(obligation: Obligation, today: string): Record<string, TaskStatus> {
  if (obligation.submissionMode !== 'system' || obligation.automaticCompletionPolicy !== 'after_deadline') return {};
  const dates = obligation.deadlineDates?.length ? obligation.deadlineDates : obligation.deadline ? [obligation.deadline] : [];
  const result: Record<string, TaskStatus> = {};
  for (const date of dates) if (date < today) result[date] = 'completed';
  return result;
}

function applyPreference(obligation: Obligation, preference?: TaskPreference, organizationMutedBefore?: string): Obligation {
  const today = new Date().toISOString().slice(0, 10);
  const automaticStatuses = automaticStatusByDate(obligation, today);
  if (!preference) {
    const automaticStatus = obligation.deadline && automaticStatuses[obligation.deadline];
    return { ...obligation, isActivated: false, ...(organizationMutedBefore ? { organizationMutedBefore } : {}), ...(Object.keys(automaticStatuses).length ? { automaticStatusByDate: automaticStatuses } : {}), ...(automaticStatus ? { status: automaticStatus, completionSource: 'rule' } : {}) };
  }
  const status = normalizeTaskStatus(preference.status);
  const isHidden = preference.hiddenForever === true || Boolean(preference.hiddenUntil && preference.hiddenUntil >= today);
  const isMuted = preference.muted === true || Boolean(preference.mutedUntil && preference.mutedUntil >= today);
  // Before per-instance statuses existed, a completed series was stored as one
  // global status. Treat that legacy value as the official/base status until a
  // date-specific status is written, so one old click cannot hide future work.
  const automaticBaseStatus = obligation.deadline ? automaticStatuses[obligation.deadline] : undefined;
  const baseStatus = obligation.deadlineDates && obligation.deadlineDates.length > 1 && !preference.statusByDate && status === 'completed'
    ? obligation.status
    : status ?? automaticBaseStatus ?? obligation.status;
  const effectiveStatusByDate = { ...automaticStatuses, ...(preference.statusByDate ?? {}) };
  const withUserPreference = {
    ...obligation,
    isActivated: preference.activated === true,
    status: aggregateRecurringStatus(baseStatus, obligation.deadlineDates, Object.keys(effectiveStatusByDate).length ? effectiveStatusByDate : undefined),
    ...(preference.statusByDate ? { statusByDate: preference.statusByDate } : {}),
    ...(Object.keys(automaticStatuses).length ? { automaticStatusByDate: automaticStatuses } : {}),
    ...(preference.deadlineByDate ? { deadlineByDate: preference.deadlineByDate } : {}),
    ...(preference.commentByDate ? { localCommentByDate: preference.commentByDate } : {}),
    ...(preference.hiddenByDate ? {
      hiddenByDate: Object.fromEntries(Object.entries(preference.hiddenByDate).map(([date, hidden]) => [date, hidden.hiddenForever === true || Boolean(hidden.hiddenUntil && hidden.hiddenUntil >= today)])),
    } : {}),
    isHidden,
    isMuted,
    ...(preference.mutedUntil ? { mutedUntil: preference.mutedUntil } : {}),
    ...(preference.mutedBefore ? { mutedBefore: preference.mutedBefore } : {}),
    ...(organizationMutedBefore ? { organizationMutedBefore } : {}),
    ...(preference.deadlineOverride ? { localDeadline: preference.deadlineOverride } : {}),
    ...(preference.comment ? { localComment: preference.comment } : {}),
  };
  if (!preference.activated || !preference.recurrence) return withUserPreference;
  const dates = recurringDates(preference.recurrence);
  return dates.length > 0 ? { ...withUserPreference, deadline: dates[0], reportingWindowStart: dates[0], deadlineDates: dates } : withUserPreference;
}

const sourcesForOrganization = async (query: string, orgNumber?: string) => {
  const availableSources = (await sources.search(query)).map(withSourceAuthority);
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

app.get('/api/health', async () => ({ ok: true, mode: runtimeMode, aiProvider, organizationProvider, obligationProvider, conceptProvider: conceptMode === 'mock' ? 'mock' : 'fdk+mock-fallback', supervisionProvider: 'mock' }));

app.get('/api/auth/me', async (request, reply) => {
  const user = sessionUser(request);
  return user ?? reply.code(401).send({ message: 'Du er ikke logget inn.' });
});

app.get('/api/me/contributions', async (request, reply) => {
  const user = sessionUser(request);
  if (!user) return reply.code(401).send({ message: 'Du må logge inn før du kan se bidragspoeng.' });
  return demoStore.contributionSummary(user.id);
});

app.post('/api/feedback', async (request, reply) => {
  const user = sessionUser(request);
  if (!user) return reply.code(401).send({ message: 'Du må logge inn før du kan sende tilbakemelding.' });
  const message = (request.body as { message?: unknown })?.message;
  if (typeof message !== 'string' || message.trim().length < 3) return reply.code(400).send({ message: 'Skriv minst noen ord om forbedringsforslaget.' });
  return reply.code(201).send(await demoStore.saveProductFeedback(user.id, message));
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
    const organizationMutedBefore = user ? demoStore.organizationViewPreference(user.id, organization.orgNumber)?.mutedBefore : undefined;
    return officialObligations.map((obligation) => applyPreference(obligation, preferences.find((item) => item.obligationId === obligation.id), organizationMutedBefore));
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

app.get('/api/organizations/:orgNumber/supervision-themes', async (request, reply) => {
  const { orgNumber } = request.params as { orgNumber: string };
  try {
    const organization = await organizations.findByOrgNumber(orgNumber);
    if (!organization) return reply.code(404).send({ message: 'Virksomheten finnes ikke i Enhetsregisteret.' });
    return supervision.listForOrganization(organization);
  } catch (error) {
    if (error instanceof DatasetOrganizationError) return reply.code(502).send({ code: 'DATASET_UNAVAILABLE', message: 'Det lokale hackathon-datasettet er ikke tilgjengelig akkurat nå.' });
    if (error instanceof EnhetsregisteretError) return reply.code(502).send({ code: 'ENHETSREGISTERET_UNAVAILABLE', message: 'Enhetsregisteret er ikke tilgjengelig akkurat nå. Prøv igjen senere.' });
    throw error;
  }
});

app.get('/api/organizations/:orgNumber/view-preference', async (request, reply) => {
  const user = sessionUser(request);
  if (!user) return reply.code(401).send({ message: 'Du må logge inn før du kan lese visningsinnstillinger.' });
  const { orgNumber } = request.params as { orgNumber: string };
  return demoStore.organizationViewPreference(user.id, orgNumber.replace(/\s/g, '')) ?? { userId: user.id, orgNumber: orgNumber.replace(/\s/g, '') };
});

app.put('/api/organizations/:orgNumber/view-preference', async (request, reply) => {
  const user = sessionUser(request);
  if (!user) return reply.code(401).send({ message: 'Du må logge inn før du endrer visningsinnstillinger.' });
  const { orgNumber } = request.params as { orgNumber: string };
  const body = request.body as { mutedBefore?: unknown };
  const normalizedOrgNumber = orgNumber.replace(/\s/g, '');
  const mutedBefore = body && validDateKey(body.mutedBefore) ? body.mutedBefore : undefined;
  const preference: OrganizationViewPreference = { userId: user.id, orgNumber: normalizedOrgNumber, mutedBefore };
  return demoStore.saveOrganizationViewPreference(user.id, preference);
});

app.get('/api/organizations/:orgNumber/profile', async (request, reply) => {
  const user = sessionUser(request);
  if (!user) return reply.code(401).send({ message: 'Du må logge inn før du kan lese virksomhetsprofilen.' });
  const { orgNumber } = request.params as { orgNumber: string };
  return demoStore.organizationProfile(user.id, orgNumber.replace(/\s/g, ''));
});

app.put('/api/organizations/:orgNumber/profile', async (request, reply) => {
  const user = sessionUser(request);
  if (!user) return reply.code(401).send({ message: 'Du må logge inn før du kan endre virksomhetsprofilen.' });
  const { orgNumber } = request.params as { orgNumber: string };
  const normalizedOrgNumber = orgNumber.replace(/\s/g, '');
  const body = request.body as { inputs?: unknown };
  const rawInputs = Array.isArray(body?.inputs) ? body.inputs : [];
  const now = new Date().toISOString();
  const inputs = rawInputs.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as Record<string, unknown>;
    const label = typeof candidate.label === 'string' ? candidate.label.trim().slice(0, 120) : '';
    const value = typeof candidate.value === 'string' ? candidate.value.trim().slice(0, 2000) : '';
    if (!label || !value) return [];
    return [{
      id: typeof candidate.id === 'string' && candidate.id.length > 0 ? candidate.id : randomUUID(),
      label,
      value,
      status: candidate.status === 'USER_SUGGESTION' ? 'USER_SUGGESTION' as const : 'USER_INPUT' as const,
      updatedAt: now,
    }];
  }).slice(0, 50);
  return demoStore.saveOrganizationProfile(user.id, normalizedOrgNumber, inputs);
});

app.get('/api/organizations/:orgNumber/task-preferences', async (request, reply) => {
  const user = sessionUser(request);
  if (!user) return reply.code(401).send({ message: 'Du må logge inn før du endrer oppgaver.' });
  const { orgNumber } = request.params as { orgNumber: string };
  return demoStore.preferences(user.id, orgNumber.replace(/\s/g, ''));
});

app.post('/api/organizations/:orgNumber/task-preferences/activate-muted', async (request, reply) => {
  const user = sessionUser(request);
  if (!user) return reply.code(401).send({ message: 'Du må logge inn før du endrer oppgaver.' });
  const { orgNumber } = request.params as { orgNumber: string };
  const changed = await demoStore.activateAllMuted(user.id, orgNumber.replace(/\s/g, ''));
  return { changed };
});

app.put('/api/organizations/:orgNumber/task-preferences/:obligationId', async (request, reply) => {
  const user = sessionUser(request);
  if (!user) return reply.code(401).send({ message: 'Du må logge inn før du endrer oppgaver.' });
  const { orgNumber, obligationId } = request.params as { orgNumber: string; obligationId: string };
  const body = request.body as Partial<TaskPreference> & { occurrenceDate?: string; hiddenScope?: 'instance' | 'all' };
  const existing = demoStore.preferences(user.id, orgNumber.replace(/\s/g, '')).find((item) => item.obligationId === obligationId);
  const status = body.status === undefined ? existing?.status : normalizeTaskStatus(body.status);
  if (body.status !== undefined && !status) return reply.code(400).send({ message: 'Ugyldig oppgavestatus.' });
  const hasDeadlineOverride = Object.prototype.hasOwnProperty.call(body, 'deadlineOverride');
  const statusByDate = body.statusByDate === undefined ? existing?.statusByDate : Object.fromEntries(
    Object.entries(body.statusByDate).flatMap(([date, value]) => {
      const normalized = normalizeTaskStatus(value);
      return normalized ? [[date, normalized]] : [];
    }),
  );
  const occurrenceDate = validDateKey(body.occurrenceDate) ? body.occurrenceDate : undefined;
  const deadlineByDate = body.deadlineByDate === undefined ? { ...(existing?.deadlineByDate ?? {}) } : (normalizedDateMap(body.deadlineByDate) ?? {});
  const commentByDate = body.commentByDate === undefined ? { ...(existing?.commentByDate ?? {}) } : (normalizedDateMap(body.commentByDate) ?? {});
  if (occurrenceDate && Object.prototype.hasOwnProperty.call(body, 'deadlineOverride')) {
    if (typeof body.deadlineOverride === 'string' && body.deadlineOverride) deadlineByDate[occurrenceDate] = body.deadlineOverride;
    else delete deadlineByDate[occurrenceDate];
  }
  if (occurrenceDate && Object.prototype.hasOwnProperty.call(body, 'comment')) {
    if (typeof body.comment === 'string' && body.comment) commentByDate[occurrenceDate] = body.comment.slice(0, 2000);
    else delete commentByDate[occurrenceDate];
  }
  const hiddenByDate = body.hiddenByDate === undefined ? { ...(existing?.hiddenByDate ?? {}) } : { ...body.hiddenByDate };
  if (occurrenceDate && body.hiddenScope === 'instance' && (body.hiddenUntil !== undefined || body.hiddenForever !== undefined)) {
    if (body.hiddenForever === true || (typeof body.hiddenUntil === 'string' && body.hiddenUntil)) hiddenByDate[occurrenceDate] = { hiddenUntil: body.hiddenUntil, hiddenForever: body.hiddenForever };
    else delete hiddenByDate[occurrenceDate];
  }
  const instanceHiddenChange = Boolean(occurrenceDate && body.hiddenScope === 'instance' && (body.hiddenUntil !== undefined || body.hiddenForever !== undefined));
  const preference: TaskPreference = {
    userId: user.id,
    orgNumber: orgNumber.replace(/\s/g, ''),
    obligationId,
    activated: body.activated ?? existing?.activated ?? false,
    comment: body.comment === undefined ? existing?.comment : typeof body.comment === 'string' ? body.comment.slice(0, 2000) : undefined,
    recurrence: body.recurrence ?? existing?.recurrence,
    status,
    statusByDate,
    deadlineByDate,
    commentByDate,
    hiddenByDate,
    deadlineOverride: hasDeadlineOverride ? (typeof body.deadlineOverride === 'string' && body.deadlineOverride ? body.deadlineOverride : undefined) : existing?.deadlineOverride,
    hiddenUntil: instanceHiddenChange ? existing?.hiddenUntil : body.hiddenForever !== undefined ? body.hiddenUntil : body.hiddenUntil ?? existing?.hiddenUntil,
    hiddenForever: instanceHiddenChange ? existing?.hiddenForever ?? false : body.hiddenForever ?? existing?.hiddenForever ?? false,
    muted: body.muted ?? existing?.muted ?? false,
    mutedUntil: body.mutedUntil ?? existing?.mutedUntil,
    mutedBefore: Object.prototype.hasOwnProperty.call(body, 'mutedBefore')
      ? (validDateKey(body.mutedBefore) ? body.mutedBefore : undefined)
      : existing?.mutedBefore,
  };
  return demoStore.savePreference(user.id, preference);
});

app.get('/api/concepts', async (request, reply) => {
  const { q = '', limit = '10' } = request.query as { q?: string; limit?: string };
  if (!q.trim()) return [];
  try {
    return await concepts.search(q, Number(limit));
  } catch (error) {
    if (error instanceof FdkConceptError) return reply.code(502).send({ code: 'CONCEPTS_UNAVAILABLE', message: 'Begrepskatalogen er ikke tilgjengelig akkurat nå.' });
    throw error;
  }
});

app.get('/api/concepts/by-uri', async (request, reply) => {
  const { uri = '' } = request.query as { uri?: string };
  if (!uri.trim()) return reply.code(400).send({ message: 'Begreps-URI mangler.' });
  try {
    const concept = await concepts.getByUri(uri);
    return concept ?? reply.code(404).send({ message: 'Begrepet finnes ikke i begrepskatalogen.' });
  } catch (error) {
    if (error instanceof FdkConceptError) return reply.code(502).send({ code: 'CONCEPTS_UNAVAILABLE', message: 'Begrepskatalogen er ikke tilgjengelig akkurat nå.' });
    throw error;
  }
});

app.get('/api/concepts/:id', async (request, reply) => {
  const { id } = request.params as { id: string };
  try {
    const concept = await concepts.getById(id);
    return concept ?? reply.code(404).send({ message: 'Begrepet finnes ikke i begrepskatalogen.' });
  } catch (error) {
    if (error instanceof FdkConceptError) return reply.code(502).send({ code: 'CONCEPTS_UNAVAILABLE', message: 'Begrepskatalogen er ikke tilgjengelig akkurat nå.' });
    throw error;
  }
});

app.get('/api/sources', async (request) => {
  const { q = '', orgNumber } = request.query as { q?: string; orgNumber?: string };
  return sourcesForOrganization(q, orgNumber);
});

app.get('/api/sources/policy', async () => ({
  domains: authorizedSourceDomains,
  rule: 'Bare AUTHORITATIVE og OFFICIAL_GUIDANCE kan brukes som autoritativt kildegrunnlag. DISCOVERY og UNVERIFIED må merkes tydelig.',
}));

app.get('/api/reported-requirements', async () => requirements.list());

app.post('/api/reported-requirements', async (request, reply) => {
  const body = request.body as any;
  if (!body?.title || !body?.description) return reply.code(400).send({ message: 'Tittel og beskrivelse er obligatorisk.' });
  const created = await requirements.create({
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
  });
  const user = sessionUser(request);
  if (user) await demoStore.addContributionEvent(user.id, { type: 'requirement_reported', points: 3, referenceId: created.id, description: 'Sendte inn et mulig manglende rapporteringskrav.' });
  return reply.code(201).send(created);
});

app.patch('/api/reported-requirements/:id', async (request, reply) => {
  const { id } = request.params as { id: string };
  const { reviewStatus } = request.body as { reviewStatus: string };
  const allowed = ['new', 'needs_more_info', 'forwarded', 'confirmed', 'rejected', 'duplicate'];
  if (!allowed.includes(reviewStatus)) return reply.code(400).send({ message: 'Ugyldig status.' });
  const updated = await requirements.updateStatus(id, reviewStatus as any);
  return updated ? updated : reply.code(404).send({ message: 'Innspillet finnes ikke.' });
});

app.get('/api/chat/history', async (request, reply) => {
  const user = sessionUser(request);
  if (!user) return reply.code(401).send({ message: 'Du må logge inn før du kan lese loshistorikken.' });
  const { orgNumber = '', q = '' } = request.query as { orgNumber?: string; q?: string };
  return demoStore.chatExchanges(user.id, orgNumber.replace(/\s/g, ''), q);
});

app.patch('/api/chat/history/:id', async (request, reply) => {
  const user = sessionUser(request);
  if (!user) return reply.code(401).send({ message: 'Du må logge inn før du kan endre loshistorikken.' });
  const { id } = request.params as { id: string };
  const { feedback } = request.body as { feedback?: unknown };
  if (feedback !== undefined && feedback !== 'useful' && feedback !== 'not_useful') return reply.code(400).send({ message: 'Ugyldig tilbakemelding.' });
  const updated = await demoStore.updateChatFeedback(user.id, id, feedback as 'useful' | 'not_useful' | undefined);
  return updated ? updated : reply.code(404).send({ message: 'Losutvekslingen finnes ikke.' });
});

app.patch('/api/chat/history/:id/share', async (request, reply) => {
  const user = sessionUser(request);
  if (!user) return reply.code(401).send({ message: 'Du må logge inn før du kan dele et los-svar.' });
  const { id } = request.params as { id: string };
  const exchange = demoStore.chatExchange(user.id, id);
  if (!exchange) return reply.code(404).send({ message: 'Losutvekslingen finnes ikke.' });
  const status = (request.body as { status?: unknown })?.status;
  if (status !== 'consented' && status !== 'withdrawn') return reply.code(400).send({ message: 'Ugyldig delingsstatus.' });
  if (status === 'withdrawn') {
    const updated = await demoStore.updateChatShare(user.id, id, { status: 'withdrawn', withdrawnAt: new Date().toISOString() });
    return updated ? updated : reply.code(409).send({ message: 'Svar må være markert som nyttig før deling kan endres.' });
  }
  const organization = await organizations.findByOrgNumber(exchange.orgNumber);
  if (!organization) return reply.code(502).send({ message: 'Virksomheten kunne ikke lastes for anonymisering.' });
  const share: ChatShareProposal = {
    status: 'consented',
    redactedQuestion: redactCommunityText(exchange.question, [organization.orgNumber, organization.name, user.displayName]),
    redactedAnswer: redactCommunityText(exchange.answer, [organization.orgNumber, organization.name, user.displayName]),
    consentedAt: new Date().toISOString(),
  };
  const updated = await demoStore.updateChatShare(user.id, id, share);
  return updated ? updated : reply.code(409).send({ message: 'Svar må være markert som nyttig før deling kan endres.' });
});

app.delete('/api/chat/history/:id', async (request, reply) => {
  const user = sessionUser(request);
  if (!user) return reply.code(401).send({ message: 'Du må logge inn før du kan slette loshistorikken.' });
  const { id } = request.params as { id: string };
  const deleted = await demoStore.deleteChatExchange(user.id, id);
  return deleted ? { ok: true } : reply.code(404).send({ message: 'Losutvekslingen finnes ikke.' });
});

app.post('/api/chat', async (request, reply) => {
  const { question, orgNumber = '', conceptId } = request.body as { question?: string; orgNumber?: string; conceptId?: string };
  if (!question?.trim()) return reply.code(400).send({ message: 'Spørsmålet kan ikke være tomt.' });
  try {
    const organization = await organizations.findByOrgNumber(orgNumber);
    if (!organization) return { answer: 'Velg en virksomhet før du spør.', uncertainty: 'Ingen virksomhet valgt.', sourceIds: [], followUpQuestions: [] };
    const user = sessionUser(request);
    const [organizationObligations, availableSources, reportedRequirements, selectedConcept] = await Promise.all([
      obligations.listForOrganization(organization),
      sourcesForOrganization('', organization.orgNumber),
      requirements.list(),
      typeof conceptId === 'string' && conceptId.trim() ? concepts.getById(conceptId) : Promise.resolve(null),
    ]);
    const conceptSource = selectedConcept ? withSourceAuthority({
      id: `concept-source:${selectedConcept.id}`,
      title: `Begrep: ${selectedConcept.term} – ${selectedConcept.publisher}`,
      url: selectedConcept.sourceUrl,
      sourceType: 'guidance' as const,
      officiality: selectedConcept.trustLevel,
      retrievedAt: selectedConcept.retrievedAt,
      relevantExcerpt: selectedConcept.definition ?? 'Definisjon mangler i treffet.',
    }) : null;
    const evidenceSources = conceptSource ? [...availableSources, conceptSource] : availableSources;
    const retrievedContext = process.env.SOURCE_RETRIEVAL_ENABLED === 'false'
      ? []
      : await sourceRetriever.retrieve(question, availableSources);
    const retrievedBySourceId = new Map(retrievedContext.flatMap((item) => item.sourceId ? [[item.sourceId, item.text] as const] : []));
    const answer = await chat.answer(question, {
      organization,
      obligations: organizationObligations,
      sources: evidenceSources,
      reportedRequirements,
      userInputs: user ? demoStore.organizationProfile(user.id, organization.orgNumber).inputs : [],
      // A concept is added only when the user deliberately asks about one;
      // the complete public concept catalogue is never sent to the model.
      additionalContext: [
        ...retrievedContext,
        ...(selectedConcept ? [{
          id: `concept:${selectedConcept.id}`,
          title: `Begrep: ${selectedConcept.term}`,
          text: `${selectedConcept.definition ?? 'Definisjon mangler i treffet.'} Utgiver: ${selectedConcept.publisher}. Kilde: ${selectedConcept.sourceUrl}`,
          trustLevel: selectedConcept.trustLevel,
          sourceId: conceptSource?.id,
        }] : []),
      ],
    });
    if (!user) return answer;
    const saved = await demoStore.saveChatExchange({
      userId: user.id,
      orgNumber: organization.orgNumber,
      question: question.trim(),
      answer: answer.answer,
      uncertainty: answer.uncertainty,
      sourceIds: answer.sourceIds,
      sources: evidenceSources.filter((source) => answer.sourceIds.includes(source.id)).map((source) => {
        const retrievedExcerpt = retrievedBySourceId.get(source.id);
        return { ...source, ...(retrievedExcerpt ? { relevantExcerpt: retrievedExcerpt, retrievedAt: new Date().toISOString() } : {}) };
      }),
      followUpQuestions: answer.followUpQuestions,
      createdAt: new Date().toISOString(),
    });
    return { ...answer, exchangeId: saved.id, shareStatus: saved.share?.status };
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
