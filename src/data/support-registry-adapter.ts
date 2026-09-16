import { access } from 'node:fs/promises';
import path from 'node:path';
import duckdb from 'duckdb';
import type { SupportAward, SupportRegistryResult } from '../domain/types.js';
import type { SupportRegistryAdapter } from '../domain/adapters.js';

export const SUPPORT_REGISTRY_SOURCE_URL = 'https://stotte.brreg.no/';
const DEFAULT_RAW_PATH = path.resolve('data/raw');
const AWARDS_FILE = 'stoettetildeling_2020_2025.csv';
const SCHEMES_FILE = 'stoetteordning_2020_2025.csv';

type DatasetRow = Record<string, unknown>;
type DuckDbConnection = { all(sql: string, callback: (error: Error | null, rows: DatasetRow[]) => void): void };

export interface SupportRegistryAdapterOptions {
  rawPath?: string;
  maxRows?: number;
}

export class SupportRegistryError extends Error {
  constructor(message: string, public readonly rawPath: string) {
    super(message);
    this.name = 'SupportRegistryError';
  }
}

const text = (value: unknown): string | undefined => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint') return undefined;
  const normalized = String(value).trim();
  return normalized || undefined;
};

const dateOnly = (value: unknown): string | undefined => {
  const valueText = text(value);
  if (!valueText) return undefined;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(valueText);
  return match?.[1];
};

const amount = (value: unknown): number | undefined => {
  const valueText = text(value);
  if (!valueText) return undefined;
  const normalized = valueText.replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const quote = (value: string): string => `'${value.replaceAll("'", "''")}'`;

function mapAward(row: DatasetRow): SupportAward | null {
  const measureNumber = text(row.award_id);
  const organizationNumber = text(row.org_number);
  const recipientName = text(row.recipient_name);
  const providerName = text(row.provider_name);
  if (!measureNumber || !organizationNumber || !recipientName || !providerName) return null;
  return {
    id: `support-${measureNumber}`,
    organizationNumber,
    recipientName,
    measureNumber,
    ...(text(row.scheme_name) ? { schemeName: text(row.scheme_name) } : {}),
    ...(text(row.scheme_url) ? { schemeUrl: text(row.scheme_url) } : {}),
    providerName,
    ...(dateOnly(row.award_date) ? { awardDate: dateOnly(row.award_date) } : {}),
    ...(amount(row.amount) !== undefined ? { amount: amount(row.amount) } : {}),
    ...(text(row.currency) ? { currency: text(row.currency) } : {}),
    ...(text(row.instrument) ? { instrument: text(row.instrument) } : {}),
    ...(text(row.purpose) ? { purpose: text(row.purpose) } : {}),
    ...(text(row.legal_basis) ? { legalBasis: text(row.legal_basis) } : {}),
    ...(text(row.industry) ? { industry: text(row.industry) } : {}),
    ...(text(row.region) ? { region: text(row.region) } : {}),
    ...(text(row.status) ? { status: text(row.status) } : {}),
    sourceUrl: SUPPORT_REGISTRY_SOURCE_URL,
    sourceType: 'dataset',
    trustLevel: 'OFFICIAL',
  };
}

export class DatasetSupportRegistryAdapter implements SupportRegistryAdapter {
  private readonly rawPath: string;
  private readonly maxRows: number;
  private readonly database = new duckdb.Database(':memory:');
  private readonly connection = this.database.connect() as DuckDbConnection;
  private readonly cache = new Map<string, Promise<SupportRegistryResult>>();

  constructor(options: SupportRegistryAdapterOptions = {}) {
    this.rawPath = path.resolve(options.rawPath ?? DEFAULT_RAW_PATH);
    this.maxRows = Math.max(1, Math.min(1000, Math.floor(options.maxRows ?? 1000)));
  }

  listForOrganization(orgNumber: string): Promise<SupportRegistryResult> {
    const normalized = orgNumber.replace(/\s/g, '');
    const cached = this.cache.get(normalized);
    if (cached) return cached;
    const result = this.query(normalized);
    this.cache.set(normalized, result);
    return result;
  }

  private async query(orgNumber: string): Promise<SupportRegistryResult> {
    await this.ensureAvailable();
    const awardsFile = path.join(this.rawPath, AWARDS_FILE);
    const schemesFile = path.join(this.rawPath, SCHEMES_FILE);
    const rows = await this.all(`
      SELECT
        a."Støttetiltaksnummer" AS award_id,
        a."Organisasjonsnummer støttemottaker" AS org_number,
        a."Navn støttemottaker" AS recipient_name,
        a."Navn støttegiver" AS provider_name,
        a."Tildelingsdato" AS award_date,
        a."Tildelt beløp" AS amount,
        a."Tildelt beløp valuta" AS currency,
        a."Støtteinstrument" AS instrument,
        a."Formål" AS purpose,
        a."Primærrettslig grunnlag" AS legal_basis,
        a."Næring" AS industry,
        a."Region" AS region,
        a."Status" AS status,
        s."Norsk navn støtteordning" AS scheme_name,
        s."Nettadresse støtteordning" AS scheme_url
      FROM read_csv_auto(${quote(awardsFile)}, delim=';', header=true, encoding='utf-16', sample_size=100000, ignore_errors=true) a
      LEFT JOIN read_csv_auto(${quote(schemesFile)}, delim=';', header=true, encoding='utf-16', sample_size=100000, ignore_errors=true) s
        ON CAST(a."Tilknyttet støtteordning" AS VARCHAR) = CAST(s."Støttetiltaksnummer" AS VARCHAR)
      WHERE CAST(a."Organisasjonsnummer støttemottaker" AS VARCHAR) = ${quote(orgNumber)}
      ORDER BY TRY_CAST(a."Tildelingsdato" AS DATE) DESC
      LIMIT ${this.maxRows}
    `);
    const awards = rows.flatMap((row) => {
      const award = mapAward(row);
      return award ? [award] : [];
    });
    return {
      organizationNumber: orgNumber,
      awards,
      sourceUrl: SUPPORT_REGISTRY_SOURCE_URL,
      sourceType: 'dataset',
      retrievedAt: new Date().toISOString(),
      coverageNote: 'Registeruttrekket viser registrerte støttetildelinger med publisert tildelings-/mottaksdato. Fravær av et år betyr ikke nødvendigvis at virksomheten ikke mottok støtte, og uttrekket er ikke en komplett oversikt over hvilke støtteordninger virksomheten kan søke på.',
    };
  }

  private async ensureAvailable(): Promise<void> {
    try {
      await Promise.all([access(path.join(this.rawPath, AWARDS_FILE)), access(path.join(this.rawPath, SCHEMES_FILE))]);
    } catch (error) {
      throw new SupportRegistryError(`Støtteregisterets råfiler finnes ikke eller kan ikke leses: ${error instanceof Error ? error.message : 'ukjent feil'}.`, this.rawPath);
    }
  }

  private all(sql: string): Promise<DatasetRow[]> {
    return new Promise((resolve, reject) => this.connection.all(sql, (error, rows) => error ? reject(error) : resolve(rows)));
  }
}

const mockAwards: SupportAward[] = [
  { id: 'mock-support-coop-1', organizationNumber: '938497257', recipientName: 'COOP NORD SA', measureNumber: '1000264162', schemeName: 'Regionalt DA 2026-', providerName: 'SKATTEETATEN', awardDate: '2026-08-05', amount: 3903506.35, currency: 'NOK', instrument: 'Skatte- eller avgiftsfritak', purpose: 'Regionalstøtte', region: '55-Troms', sourceUrl: SUPPORT_REGISTRY_SOURCE_URL, sourceType: 'register', trustLevel: 'OFFICIAL' },
  { id: 'mock-support-coop-2', organizationNumber: '938497257', recipientName: 'COOP NORD SA', measureNumber: '1000218775', schemeName: 'Regionalt DA 2026-', providerName: 'SKATTEETATEN', awardDate: '2026-07-06', amount: 3699086.66, currency: 'NOK', instrument: 'Skatte- eller avgiftsfritak', purpose: 'Regionalstøtte', region: '55-Troms', sourceUrl: SUPPORT_REGISTRY_SOURCE_URL, sourceType: 'register', trustLevel: 'OFFICIAL' },
  { id: 'mock-support-thon-1', organizationNumber: '986954244', recipientName: 'THON NORDLYS AS', measureNumber: '1000152450', schemeName: 'Kompensasjonsordning for reiseliv', providerName: 'INNOVASJON NORGE', awardDate: '2026-04-18', amount: 420000, currency: 'NOK', instrument: 'Tilskudd', purpose: 'Covid-19-kompensasjon', region: '03-Oslo', sourceUrl: SUPPORT_REGISTRY_SOURCE_URL, sourceType: 'register', trustLevel: 'OFFICIAL' },
  { id: 'mock-support-fjordglott-2025-1', organizationNumber: '999999999', recipientName: 'Fjordgløtt Mat og Handel AS', measureNumber: 'mock-999999999-2025-1', schemeName: 'Kommunalt næringsfond', providerName: 'TRONDHEIM KOMMUNE', awardDate: '2025-03-18', amount: 75000, currency: 'NOK', instrument: 'Tilskudd', purpose: 'Etablering og utvikling', region: '50-Trøndelag', sourceUrl: SUPPORT_REGISTRY_SOURCE_URL, sourceType: 'register', trustLevel: 'OFFICIAL' },
  { id: 'mock-support-fjordglott-2025-2', organizationNumber: '999999999', recipientName: 'Fjordgløtt Mat og Handel AS', measureNumber: 'mock-999999999-2025-2', schemeName: 'Kommunalt næringsfond', providerName: 'TRONDHEIM KOMMUNE', awardDate: '2025-11-04', amount: 120000, currency: 'NOK', instrument: 'Tilskudd', purpose: 'Energi- og miljøtiltak', region: '50-Trøndelag', sourceUrl: SUPPORT_REGISTRY_SOURCE_URL, sourceType: 'register', trustLevel: 'OFFICIAL' },
  { id: 'mock-support-fjordglott-2026-1', organizationNumber: '999999999', recipientName: 'Fjordgløtt Mat og Handel AS', measureNumber: 'mock-999999999-2026-1', schemeName: 'Kommunalt næringsfond', providerName: 'TRONDHEIM KOMMUNE', awardDate: '2026-02-12', amount: 95000, currency: 'NOK', instrument: 'Tilskudd', purpose: 'Kompetanse og omstilling', region: '50-Trøndelag', sourceUrl: SUPPORT_REGISTRY_SOURCE_URL, sourceType: 'register', trustLevel: 'OFFICIAL' },
  { id: 'mock-support-fjordglott-2026-2', organizationNumber: '999999999', recipientName: 'Fjordgløtt Mat og Handel AS', measureNumber: 'mock-999999999-2026-2', schemeName: 'Regionalt næringsfond', providerName: 'TRØNDELAG FYLKESKOMMUNE', awardDate: '2026-06-20', amount: 140000, currency: 'NOK', instrument: 'Tilskudd', purpose: 'Digitalisering og utvikling', region: '50-Trøndelag', sourceUrl: SUPPORT_REGISTRY_SOURCE_URL, sourceType: 'register', trustLevel: 'OFFICIAL' },
];

export class MockSupportRegistryAdapter implements SupportRegistryAdapter {
  async listForOrganization(orgNumber: string): Promise<SupportRegistryResult> {
    return { organizationNumber: orgNumber, awards: mockAwards.filter((award) => award.organizationNumber === orgNumber).map((award) => structuredClone(award)), sourceUrl: SUPPORT_REGISTRY_SOURCE_URL, sourceType: 'mock', retrievedAt: new Date().toISOString(), coverageNote: 'Dette er mockdata for demo. Datoene er eksempler på tildelings-/mottaksdatoer og må kontrolleres i den offisielle kilden.' };
  }
}

export class FallbackSupportRegistryAdapter implements SupportRegistryAdapter {
  constructor(private readonly primary: SupportRegistryAdapter, private readonly fallback: SupportRegistryAdapter) {}

  async listForOrganization(orgNumber: string): Promise<SupportRegistryResult> {
    try {
      return await this.primary.listForOrganization(orgNumber);
    } catch (error) {
      if (error instanceof SupportRegistryError) return this.fallback.listForOrganization(orgNumber);
      throw error;
    }
  }
}

/**
 * Keeps the clearly marked demo organization useful even when the local
 * support-register dataset is mounted and returns an empty result for it.
 * Real organizations continue to use the configured primary/fallback chain.
 */
export class DemoAwareSupportRegistryAdapter implements SupportRegistryAdapter {
  constructor(private readonly primary: SupportRegistryAdapter, private readonly demo: SupportRegistryAdapter) {}

  async listForOrganization(orgNumber: string): Promise<SupportRegistryResult> {
    const normalized = orgNumber.replace(/\s/g, '');
    if (normalized === '999999999') return this.demo.listForOrganization(normalized);
    return this.primary.listForOrganization(orgNumber);
  }
}
