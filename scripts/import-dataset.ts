import fs from 'node:fs/promises';
import path from 'node:path';
import duckdb from 'duckdb';
import type { DatasetImportOptions } from '../src/domain/types.js';

const args = process.argv.slice(2);
const getArg = (name: string) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };

const options: DatasetImportOptions = {
  input: getArg('--input') ?? '',
  output: getArg('--output') ?? './data/warehouse/reporting.duckdb',
  orgNumber: getArg('--org-number'),
  format: getArg('--format') as DatasetImportOptions['format'],
};

if (!options.input) {
  console.error('Bruk: npm run import -- --input ./data/raw/enheter.json --output ./data/warehouse/reporting.duckdb [--org-number 912345678]');
  process.exit(1);
}

const input = path.resolve(options.input);
const output = path.resolve(options.output);
await fs.mkdir(path.dirname(output), { recursive: true });

const escapeSqlString = (value: string) => value.replaceAll("'", "''");
const inputExt = path.extname(input).toLowerCase();
const format = options.format ?? (inputExt === '.csv' ? 'csv' : inputExt === '.jsonl' ? 'jsonl' : 'json');
const reader = format === 'csv'
  ? `read_csv_auto('${escapeSqlString(input)}', header=true, union_by_name=true, sample_size=-1)`
  : format === 'jsonl'
    ? `read_json_auto('${escapeSqlString(input)}', format='newline_delimited', union_by_name=true)`
    : `read_json_auto('${escapeSqlString(input)}', union_by_name=true)`;

type DuckDbConnection = { run(sql: string, callback: (error: Error | null) => void): void; all(sql: string, callback: (error: Error | null, rows: Array<Record<string, unknown>>) => void): void; close(): void };
const database = new duckdb.Database(output);
const connection = database.connect() as DuckDbConnection;

const run = (sql: string) => new Promise<void>((resolve, reject) => {
  connection.run(sql, (error: Error | null) => error ? reject(error) : resolve());
});
const all = <T extends Record<string, unknown>>(sql: string) => new Promise<T[]>((resolve, reject) => {
  connection.all(sql, (error: Error | null, rows: Record<string, unknown>[]) => error ? reject(error) : resolve(rows as T[]));
});

try {
  // The source stays on disk and DuckDB scans it. JS only receives schema metadata.
  await run(`CREATE OR REPLACE VIEW source_rows AS SELECT * FROM ${reader}`);
  const columns = await all<{ column_name: string }>('DESCRIBE source_rows');
  const names = columns.map((column) => column.column_name);
  const orgColumn = ['orgNumber', 'organisasjonsnummer', 'orgnr', 'organizationNumber'].find((candidate) => names.includes(candidate));
  const where = options.orgNumber && orgColumn ? `WHERE CAST("${orgColumn}" AS VARCHAR) = '${escapeSqlString(options.orgNumber)}'` : '';
  const filtered = orgColumn ? `SELECT * FROM source_rows ${where}` : 'SELECT * FROM source_rows';

  await run(`CREATE OR REPLACE TABLE normalized_source AS ${filtered}`);
  await run(`CREATE OR REPLACE TABLE import_metadata AS SELECT '${escapeSqlString(input)}' AS input_file, '${format}' AS input_format, '${escapeSqlString(options.orgNumber ?? '')}' AS org_number_filter, current_timestamp AS imported_at`);
  const parquetPath = output.replace(/\.duckdb$/i, '.parquet');
  await run(`COPY (SELECT * FROM normalized_source) TO '${escapeSqlString(parquetPath)}' (FORMAT PARQUET)`);
  const count = await all<{ count: bigint }>('SELECT COUNT(*) AS count FROM normalized_source');
  console.log(JSON.stringify({ output, parquetPath, rows: Number(count[0]?.count ?? 0), orgColumn: orgColumn ?? null, filtered: Boolean(options.orgNumber && orgColumn) }, null, 2));
} finally {
  connection.close();
  database.close();
}
