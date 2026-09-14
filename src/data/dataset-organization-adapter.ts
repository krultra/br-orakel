import { access } from 'node:fs/promises';
import path from 'node:path';
import duckdb from 'duckdb';
import type { OrganizationAdapter } from '../domain/adapters.js';
import type { Organization } from '../domain/types.js';

export const DATASET_ORGANIZATION_SOURCE_ID = 'source-brreg-hackathon-dataset';
const DEFAULT_DATASET_PATH = path.resolve('data/raw/dim_virksomhet.parquet');

type DatasetRow = Record<string, unknown>;
type DuckDbConnection = {
  all(sql: string, callback: (error: Error | null, rows: DatasetRow[]) => void): void;
  close(): void;
};

export interface DatasetOrganizationAdapterOptions {
  filePath?: string;
}

export class DatasetOrganizationError extends Error {
  constructor(message: string, public readonly filePath: string) {
    super(message);
    this.name = 'DatasetOrganizationError';
  }
}

const text = (value: unknown): string | undefined => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const normalized = String(value).trim();
  return normalized || undefined;
};

const unique = (values: Array<string | undefined>): string[] => [
  ...new Set(values.filter((value): value is string => Boolean(value))),
];

const quote = (value: string): string => `'${value.replaceAll("'", "''")}'`;
const escapeLike = (value: string): string => value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');

function mapOrganization(row: DatasetRow): Organization | null {
  const orgNumber = text(row.organisasjonsnummer);
  const name = text(row.enhetsnavn);
  const organizationForm = text(row.enhetstype_forkortelse);
  if (!orgNumber || !name || !organizationForm) return null;

  return {
    orgNumber,
    name,
    organizationForm,
    organizationFormName: text(row.enhetstype_beskrivelse),
    industryCodes: unique([text(row.naeringskode_sn25), text(row.naeringskode_sn07)]),
    // The hackathon's organization dimension does not contain employee count.
    // Keep this unknown instead of turning it into a false employer signal.
    hasEmployees: undefined,
    municipality: text(row.kommunenavn) ?? '',
    municipalityNumber: text(row.kommunenummer),
    registeredInForetaksregister: row.registreringsaar_foretaksregisteret != null,
    registrationDate: text(row.registreringsdato_enhetsregisteret),
    sources: [DATASET_ORGANIZATION_SOURCE_ID],
  };
}

export class DatasetOrganizationAdapter implements OrganizationAdapter {
  private readonly filePath: string;
  private readonly database = new duckdb.Database(':memory:');
  private readonly connection = this.database.connect() as DuckDbConnection;

  constructor(options: DatasetOrganizationAdapterOptions = {}) {
    this.filePath = path.resolve(options.filePath ?? DEFAULT_DATASET_PATH);
  }

  async findByOrgNumber(input: string): Promise<Organization | null> {
    const orgNumber = input.replace(/\s/g, '');
    if (!/^\d{9}$/.test(orgNumber)) return null;
    await this.ensureAvailable();
    const rows = await this.all(`
      SELECT *
      FROM read_parquet(${quote(this.filePath)})
      WHERE organisasjonsnummer = ${quote(orgNumber)}
      LIMIT 1
    `);
    return mapOrganization(rows[0] ?? {});
  }

  async searchByName(input: string, limit = 10): Promise<Organization[]> {
    const name = input.trim().slice(0, 180);
    if (!name) return [];
    await this.ensureAvailable();
    const safeName = escapeLike(name.toLocaleLowerCase('nb-NO'));
    const rows = await this.all(`
      SELECT *
      FROM read_parquet(${quote(this.filePath)})
      WHERE er_aktiv = true
        AND lower(enhetsnavn) LIKE '%${safeName}%' ESCAPE '\\'
      ORDER BY enhetsnavn
      LIMIT ${Math.max(1, Math.min(Math.floor(limit), 20))}
    `);
    return rows.flatMap((row) => {
      const organization = mapOrganization(row);
      return organization ? [organization] : [];
    });
  }

  close(): void {
    this.connection.close();
    this.database.close();
  }

  private async ensureAvailable(): Promise<void> {
    try {
      await access(this.filePath);
    } catch (error) {
      throw new DatasetOrganizationError(
        `Virksomhetsdatasettet finnes ikke eller kan ikke leses: ${error instanceof Error ? error.message : 'ukjent feil'}.`,
        this.filePath,
      );
    }
  }

  private all(sql: string): Promise<DatasetRow[]> {
    return new Promise((resolve, reject) => {
      this.connection.all(sql, (error, rows) => error ? reject(error) : resolve(rows));
    });
  }
}
