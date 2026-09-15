import type { ObligationAdapter } from '../domain/adapters.js';
import type { AutomaticCompletionPolicy, CompletionSource, Obligation, Organization, SubmissionMode, TrustLevel } from '../domain/types.js';

const DEFAULT_BASE_URL = 'https://data.brreg.no/oppgaveregisteret/api';
const REGISTER_SOURCE_ID = 'source-oppgaveregisteret';

type JsonRecord = Record<string, unknown>;
type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export interface OppgaveregisteretAdapterOptions {
  baseUrl?: string;
  fetcher?: Fetcher;
  pageSize?: number;
  maxPages?: number;
  timeoutMs?: number;
}

export class OppgaveregisteretError extends Error {
  constructor(message: string, public readonly url: string, public readonly status?: number) {
    super(message);
    this.name = 'OppgaveregisteretError';
  }
}

const isRecord = (value: unknown): value is JsonRecord => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const text = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized || undefined;
};

const records = (value: unknown): JsonRecord[] => Array.isArray(value) ? value.filter(isRecord) : [];

const unique = (values: Array<string | undefined>): string[] => [...new Set(values.filter((value): value is string => Boolean(value)))];

const usableIndustryCode = (value: string): boolean => /^\d{2}\.\d{1,3}$/.test(value) && value !== '00.000';

const nestedText = (value: unknown, key: string): string | undefined => isRecord(value) ? text(value[key]) : undefined;

const usableEventLabel = (value: string | undefined): string | undefined => value && !/^\(beskrives\)$/i.test(value.trim()) ? value : undefined;

const categoryValues = (value: unknown): string[] => records(value).flatMap((item) => [text(item.verdi), text(item.kode)]).filter((value): value is string => Boolean(value));

const submissionMetadata = (name: string, reportingForms: string[]): Pick<Obligation, 'submissionMode' | 'completionSource' | 'automaticCompletionPolicy'> => {
  const normalized = [name, ...reportingForms].join(' ').toLocaleLowerCase('nb-NO');
  // A system submission may be encoded in the obligation name (as for
  // "A-Melding innsendelse fra system") or in a reporting-form value. A
  // generic value such as "Elektronisk" is deliberately not enough: a person
  // can submit electronically. Only explicit system/integration wording
  // activates the demo rule for automatic completion after the deadline.
  const isSystemSubmission = [
    /innsendelse\s+fra\s+system/,
    /systeminnsending/,
    /fra\s+system/,
    /maskinell/,
    /sluttbrukersystem/,
    /system\s*[- ]?til\s*[- ]?system/,
    /\bapi\b/,
    /integrasjon/,
  ].some((pattern) => pattern.test(normalized));
  const submissionMode: SubmissionMode = isSystemSubmission ? 'system' : 'unknown';
  const completionSource: CompletionSource = isSystemSubmission ? 'rule' : 'unknown';
  const automaticCompletionPolicy: AutomaticCompletionPolicy = isSystemSubmission ? 'after_deadline' : 'none';
  return { submissionMode, completionSource, automaticCompletionPolicy };
};

const formUsage = (value: unknown): JsonRecord[] => records(value);

const deadlineDates = (usage: JsonRecord[], year = new Date().getFullYear()): string[] => unique(
  usage.flatMap((item) => records(item.tidsfrister).map((deadline) => {
    const day = text(deadline.date);
    const month = text(deadline.month);
    if (!day || !month) return undefined;
    const dayNumber = Number(day);
    const monthNumber = Number(month);
    if (!Number.isInteger(dayNumber) || !Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12 || dayNumber < 1 || dayNumber > 31) return undefined;
    return `${year}-${String(monthNumber).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
  })),
).sort();

const parsePage = (payload: unknown): JsonRecord[] => {
  if (!isRecord(payload) || !Array.isArray(payload.skjema)) {
    throw new Error('Uventet respons fra Oppgaveregisteret: mangler skjema-array.');
  }
  return records(payload.skjema);
};

function mapObligation(raw: JsonRecord): Obligation | null {
  const name = text(raw.navn);
  const registerId = text(raw.nummer);
  const guid = text(raw.guid);
  if (!name || !registerId) return null;

  const owner = isRecord(raw.eier) ? raw.eier : {};
  const responsibleAgency = text(owner.etatsnavn) ?? 'Ikke oppgitt etat';
  const purpose = nestedText(raw.formaal, 'fritekst');
  const attachmentText = nestedText(raw.vedleggskrav, 'fritekst');
  const attachmentCategories = categoryValues(isRecord(raw.vedleggskrav) ? raw.vedleggskrav.kategorier : undefined);
  const legalBasis = records(raw.lovhjemler).map((item) => unique([text(item.tittel), text(item.henvisning)]).join(' ')).filter(Boolean);
  const targetGroup = isRecord(raw.maalgruppe) ? raw.maalgruppe : {};
  const industryGroups = records(targetGroup.naeringsgrupper);
  const targetCriteria = unique([
    ...industryGroups.flatMap((group) => [
      ...records(group.organisasjonsformer).flatMap((item) => [text(item.kode), text(item.verdi)]),
      ...records(group.naeringskoder).flatMap((item) => [text(item.kode), text(item.verdi)]),
    ]),
    targetGroup.gjelderKunVedAnsatte === true ? 'arbeidsgiveransvar' : undefined,
  ]);
  const requiredData = unique([
    ...records(raw.skjemainnhold).flatMap((item) => [text(item.verdi), text(item.kode)]),
    text(raw.skjemainnholdAndreOpplysninger),
  ]);
  const usage = formUsage(raw.bruksomraader);
  const eventUsage = usage.find((item) => text(item.navn)?.toLowerCase().includes('hendelsesrapportering'));
  const eventLabel = usableEventLabel(nestedText(eventUsage?.hendelseskategori, 'navn'));
  const reportingForms = categoryValues(raw.rapporteringsformer);
  const submission = submissionMetadata(name, reportingForms);
  const knownDeadlineDates = deadlineDates(usage);
  const description = unique([purpose, ...usage.map((item) => text(item.kommentar))]).join(' ');
  const officialStatus: TrustLevel = text(raw.statustype)?.toUpperCase() === 'PUBLISERT' ? 'OFFICIAL' : 'UNDER_REVIEW';
  const electronicMinutes = isRecord(raw.tidsbruk) && typeof raw.tidsbruk.elektronisk === 'number' ? raw.tidsbruk.elektronisk : undefined;
  const paperMinutes = isRecord(raw.tidsbruk) && typeof raw.tidsbruk.papir === 'number' ? raw.tidsbruk.papir : undefined;
  return {
    id: `oppgaveregisteret-${guid ?? registerId}`,
    name,
    description: description || 'Oppgaveplikt registrert i Oppgaveregisteret.',
    officialStatus,
    responsibleAgency,
    legalBasis: legalBasis.join('; ') || 'Ikke oppgitt',
    targetCriteria,
    reportingWindowStart: knownDeadlineDates[0],
    deadline: knownDeadlineDates[0],
    deadlineDates: knownDeadlineDates,
    frequency: eventUsage ? 'Ved hendelse' : 'Ikke angitt',
    estimatedMinutes: electronicMinutes ?? paperMinutes ?? 0,
    requiredData,
    attachments: unique([attachmentText, ...attachmentCategories]),
    sourceLinks: [REGISTER_SOURCE_ID],
    reportingForms,
    ...submission,
    status: 'not_started',
    trigger: eventUsage ? 'event' : 'periodic',
    eventLabel,
    registerId,
  };
}

export class OppgaveregisteretAdapter implements ObligationAdapter {
  private readonly baseUrl: string;
  private readonly fetcher: Fetcher;
  private readonly pageSize: number;
  private readonly maxPages: number;
  private readonly timeoutMs: number;

  constructor(options: OppgaveregisteretAdapterOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.fetcher = options.fetcher ?? fetch;
    this.pageSize = Math.max(1, Math.min(options.pageSize ?? 100, 160));
    this.maxPages = Math.max(1, options.maxPages ?? 50);
    this.timeoutMs = Math.max(100, options.timeoutMs ?? 10_000);
  }

  async listForOrganization(organization: Organization): Promise<Obligation[]> {
    const collected: JsonRecord[] = [];

    // The pilot API currently rejects multiple comma-separated industry codes.
    // Query each code separately and deduplicate by register id below.
    const industryCodes = organization.industryCodes.filter(usableIndustryCode);
    const industryQueries: Array<string | undefined> = industryCodes.length > 0 ? industryCodes : [undefined];
    let successfulIndustryQueries = 0;
    let lastIndustryFilterError: unknown;
    for (const industryCode of industryQueries) {
      let start = 0;
      try {
        for (let page = 0; page < this.maxPages; page += 1) {
          const url = new URL(`${this.baseUrl}/skjema`);
          url.searchParams.set('start', String(start));
          url.searchParams.set('antall', String(this.pageSize));
          url.searchParams.set('organisasjonsformer', organization.organizationForm);
          if (industryCode) url.searchParams.set('naeringskoder', industryCode);
          // A dataset-backed organization may not contain employee information.
          // In that case do not silently exclude employer obligations.
          if (organization.hasEmployees !== undefined) {
            url.searchParams.set('ekskluderArbeidsgiver', String(!organization.hasEmployees));
          }

          const pageItems = await this.fetchPage(url);
          successfulIndustryQueries += 1;
          collected.push(...pageItems);
          if (pageItems.length < this.pageSize) break;
          start += pageItems.length;
        }
      } catch (error) {
        // The register's own industry-code catalogue can lag behind other
        // official classifications. Do not discard matches for valid codes.
        if (industryCode && error instanceof OppgaveregisteretError && error.status === 400) {
          lastIndustryFilterError = error;
          continue;
        }
        throw error;
      }
    }

    if (successfulIndustryQueries === 0 && lastIndustryFilterError) throw lastIndustryFilterError;

    const mapped = collected.map(mapObligation).filter((item): item is Obligation => item !== null);
    return [...new Map(mapped.map((item) => [item.id, item])).values()];
  }

  private async fetchPage(url: URL): Promise<JsonRecord[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(url.toString(), {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) throw new OppgaveregisteretError(`Oppgaveregisteret svarte med HTTP ${response.status}.`, url.toString(), response.status);
      return parsePage(await response.json());
    } catch (error) {
      if (error instanceof OppgaveregisteretError) throw error;
      if (error instanceof Error && error.name === 'AbortError') throw new OppgaveregisteretError(`Tidsavbrudd mot Oppgaveregisteret etter ${this.timeoutMs} ms.`, url.toString());
      throw new OppgaveregisteretError(`Kunne ikke lese Oppgaveregisteret: ${error instanceof Error ? error.message : 'ukjent feil'}.`, url.toString());
    } finally {
      clearTimeout(timeout);
    }
  }
}
