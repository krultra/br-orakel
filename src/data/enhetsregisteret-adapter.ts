import type { OrganizationAdapter } from '../domain/adapters.js';
import type { Organization } from '../domain/types.js';

const DEFAULT_BASE_URL = 'https://data.brreg.no/enhetsregisteret/api';
const REGISTER_SOURCE_ID = 'source-brreg-org';

type JsonRecord = Record<string, unknown>;
type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export interface EnhetsregisteretAdapterOptions {
  baseUrl?: string;
  fetcher?: Fetcher;
  timeoutMs?: number;
}

export class EnhetsregisteretError extends Error {
  constructor(message: string, public readonly url: string, public readonly status?: number) {
    super(message);
    this.name = 'EnhetsregisteretError';
  }
}

const isRecord = (value: unknown): value is JsonRecord => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const text = (value: unknown): string | undefined => {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const normalized = String(value).trim();
  return normalized || undefined;
};

const nestedText = (value: unknown, key: string): string | undefined => isRecord(value) ? text(value[key]) : undefined;

const unique = (values: Array<string | undefined>): string[] => [...new Set(values.filter((value): value is string => Boolean(value)))];

const normalizeOrgNumber = (value: string): string => value.replace(/\s/g, '');

function mapOrganization(raw: JsonRecord): Organization {
  const orgNumber = normalizeOrgNumber(text(raw.organisasjonsnummer) ?? '');
  const name = text(raw.navn);
  const form = isRecord(raw.organisasjonsform) ? raw.organisasjonsform : {};
  const organizationForm = text(form.kode);
  if (!/^\d{9}$/.test(orgNumber) || !name || !organizationForm) {
    throw new Error('Uventet respons fra Enhetsregisteret: mangler organisasjonsnummer, navn eller organisasjonsform.');
  }

  const employeeCount = typeof raw.antallAnsatte === 'number' ? raw.antallAnsatte : undefined;
  const businessAddress = isRecord(raw.forretningsadresse) ? raw.forretningsadresse : {};
  const postalAddress = isRecord(raw.postadresse) ? raw.postadresse : {};
  const municipality = nestedText(businessAddress, 'kommune') ?? nestedText(postalAddress, 'kommune') ?? '';
  const municipalityNumber = nestedText(businessAddress, 'kommunenummer') ?? nestedText(postalAddress, 'kommunenummer');

  return {
    orgNumber,
    name,
    organizationForm,
    organizationFormName: text(form.beskrivelse),
    industryCodes: unique([
      nestedText(raw.naeringskode1, 'kode'),
      nestedText(raw.naeringskode2, 'kode'),
      nestedText(raw.naeringskode3, 'kode'),
      nestedText(raw.hjelpeenhetskode, 'kode'),
    ]),
    hasEmployees: employeeCount !== undefined ? employeeCount > 0 : false,
    employeeCount,
    registeredInMvaRegister: typeof raw.registrertIMvaregisteret === 'boolean' ? raw.registrertIMvaregisteret : undefined,
    registeredInForetaksregister: typeof raw.registrertIForetaksregisteret === 'boolean' ? raw.registrertIForetaksregisteret : undefined,
    municipality,
    municipalityNumber,
    parentOrgNumber: text(raw.overordnetEnhet),
    registrationDate: text(raw.registreringsdatoEnhetsregisteret),
    sources: [REGISTER_SOURCE_ID],
  };
}

export class EnhetsregisteretAdapter implements OrganizationAdapter {
  private readonly baseUrl: string;
  private readonly fetcher: Fetcher;
  private readonly timeoutMs: number;

  constructor(options: EnhetsregisteretAdapterOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = Math.max(100, options.timeoutMs ?? 10_000);
  }

  async findByOrgNumber(input: string): Promise<Organization | null> {
    const orgNumber = normalizeOrgNumber(input);
    if (!/^\d{9}$/.test(orgNumber)) return null;

    const url = `${this.baseUrl}/enheter/${encodeURIComponent(orgNumber)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(url, {
        headers: { Accept: 'application/vnd.brreg.enhetsregisteret.enhet.v2+json, application/json' },
        signal: controller.signal,
      });
      if (response.status === 404 || response.status === 410) return null;
      if (!response.ok) throw new EnhetsregisteretError(`Enhetsregisteret svarte med HTTP ${response.status}.`, url, response.status);
      const payload = await response.json();
      if (!isRecord(payload)) throw new Error('Responsen er ikke et JSON-objekt.');
      return mapOrganization(payload);
    } catch (error) {
      if (error instanceof EnhetsregisteretError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new EnhetsregisteretError(`Tidsavbrudd mot Enhetsregisteret etter ${this.timeoutMs} ms.`, url);
      }
      throw new EnhetsregisteretError(`Kunne ikke lese Enhetsregisteret: ${error instanceof Error ? error.message : 'ukjent feil'}.`, url);
    } finally {
      clearTimeout(timeout);
    }
  }
}
