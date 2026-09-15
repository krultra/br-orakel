import path from 'node:path';
import duckdb from 'duckdb';

const root = path.resolve(process.argv[2] ?? 'data/raw');
const assignmentFile = path.join(root, 'stoettetildeling_2020_2025.csv');
const schemeFile = path.join(root, 'stoetteordning_2020_2025.csv');
const organizationFile = path.join(root, 'dim_virksomhet.parquet');

type Row = Record<string, unknown>;
type Connection = { all(sql: string, callback: (error: Error | null, rows: Row[]) => void): void; close(): void };
const database = new duckdb.Database(':memory:');
const connection = database.connect() as Connection;
const all = <T extends Row>(sql: string) => new Promise<T[]>((resolve, reject) => connection.all(sql, (error, rows) => error ? reject(error) : resolve(rows as T[])));
const json = (value: unknown) => JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? Number(item) : item, 2);
const csv = (file: string) => `read_csv_auto('${file.replaceAll("'", "''")}', delim=';', header=true, encoding='utf-16', sample_size=100000, ignore_errors=true)`;
const amount = `TRY_CAST(REPLACE(REPLACE(REPLACE("Tildelt beløp", ' ', ''), '.', ''), ',', '.') AS DOUBLE)`;

try {
  const assignments = csv(assignmentFile);
  const schemes = csv(schemeFile);
  const organizations = `read_parquet('${organizationFile.replaceAll("'", "''")}')`;
  const result = {
    files: { assignmentFile, schemeFile },
    assignmentSummary: await all(`SELECT COUNT(*) AS rows, COUNT(DISTINCT "Organisasjonsnummer støttemottaker") FILTER (WHERE "Organisasjonsnummer støttemottaker" IS NOT NULL) AS recipientOrganizations, MIN("Tildelingsdato") AS firstDate, MAX("Tildelingsdato") AS lastDate FROM ${assignments}`),
    schemeSummary: await all(`SELECT COUNT(*) AS rows, COUNT(DISTINCT "Støttetiltaksnummer") AS schemes, COUNT(DISTINCT "Støttegivers organisasjonsnummer og navn") AS providers, MIN("Varighet fra") AS firstValid, MAX("Varighet til") AS lastValid FROM ${schemes}`),
    years: await all(`SELECT year("Tildelingsdato") AS year, COUNT(*) AS awards, COUNT(DISTINCT "Organisasjonsnummer støttemottaker") AS recipients FROM ${assignments} GROUP BY 1 ORDER BY 1`),
    topRecipients: await all(`WITH awards AS (SELECT CAST("Organisasjonsnummer støttemottaker" AS VARCHAR) AS orgNumber, MAX("Navn støttemottaker") AS awardName, COUNT(*) AS awards, MIN("Tildelingsdato") AS firstDate, MAX("Tildelingsdato") AS lastDate, SUM(${amount}) AS amountSum FROM ${assignments} WHERE "Organisasjonsnummer støttemottaker" IS NOT NULL GROUP BY 1) SELECT awards.orgNumber, COALESCE(org.enhetsnavn, awards.awardName) AS name, awards.awards, ROUND(awards.amountSum, 2) AS amountSum, awards.firstDate, awards.lastDate, org.naeringskode_sn25 AS industryCode, org.naeringskode_sn25_beskrivelse_nb AS industry, org.kommunenavn AS municipality FROM awards LEFT JOIN ${organizations} org ON CAST(org.organisasjonsnummer AS VARCHAR) = awards.orgNumber WHERE org.er_aktiv = true ORDER BY awards.awards DESC LIMIT 20`),
    demoExamples: await all(`WITH awards AS (SELECT CAST("Organisasjonsnummer støttemottaker" AS VARCHAR) AS orgNumber, MAX("Navn støttemottaker") AS awardName, COUNT(*) AS awards, MIN("Tildelingsdato") AS firstDate, MAX("Tildelingsdato") AS lastDate, SUM(${amount}) AS amountSum FROM ${assignments} WHERE "Organisasjonsnummer støttemottaker" IN (938497257, 986954244) GROUP BY 1) SELECT awards.orgNumber, COALESCE(org.enhetsnavn, awards.awardName) AS name, awards.awards, ROUND(awards.amountSum, 2) AS amountSum, awards.firstDate, awards.lastDate, org.naeringskode_sn25 AS industryCode, org.naeringskode_sn25_beskrivelse_nb AS industry, org.kommunenavn AS municipality FROM awards LEFT JOIN ${organizations} org ON CAST(org.organisasjonsnummer AS VARCHAR) = awards.orgNumber ORDER BY awards.awards DESC`),
  };
  console.log(json(result));
} finally {
  connection.close();
  database.close();
}
