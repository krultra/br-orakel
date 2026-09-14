import path from 'node:path';
import duckdb from 'duckdb';

const root = path.resolve(process.argv[2] ?? 'data/raw');
const files = [
  'dim_virksomhet.parquet',
  'fact_rolle.parquet',
  'dim_aarsregnskap.parquet',
  'dim_feltkode.parquet',
];

type Row = Record<string, unknown>;
type Connection = {
  all(sql: string, callback: (error: Error | null, rows: Row[]) => void): void;
  close(): void;
};

const database = new duckdb.Database(':memory:');
const connection = database.connect() as Connection;
const all = <T extends Row>(sql: string) => new Promise<T[]>((resolve, reject) => {
  connection.all(sql, (error, rows) => error ? reject(error) : resolve(rows as T[]));
});

const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
const safeJson = (value: unknown) => JSON.stringify(value, (_key, item) => (
  typeof item === 'bigint' ? Number(item) : item
), 2);

try {
  for (const filename of files) {
    const file = path.join(root, filename);
    const source = quote(file);
    const schema = await all<{ column_name: string; column_type: string; null: string }>(
      `DESCRIBE SELECT * FROM ${source}`,
    );
    const count = await all<{ rows: bigint }>(`SELECT COUNT(*) AS rows FROM ${source}`);
    const sample = await all(`SELECT * FROM ${source} LIMIT 3`);
    let summary: Row[] = [];
    if (filename === 'dim_virksomhet.parquet') {
      summary = await all(`
        SELECT
          COUNT(DISTINCT organisasjonsnummer) AS distinct_org_numbers,
          COUNT(*) FILTER (WHERE er_aktiv) AS active_rows,
          COUNT(*) FILTER (WHERE NOT er_aktiv) AS inactive_rows,
          COUNT(*) FILTER (WHERE naeringskode_sn25 IS NULL OR naeringskode_sn25 = '') AS missing_sn25,
          COUNT(*) FILTER (WHERE naeringskode_sn07 IS NULL OR naeringskode_sn07 = '') AS missing_sn07
        FROM ${source}
      `);
    } else if (filename === 'fact_rolle.parquet') {
      summary = await all(`
        SELECT rolletype_kode, rolletype_beskrivelse, COUNT(*) AS rows,
               COUNT(*) FILTER (WHERE NOT er_avregistrert) AS active_rows
        FROM ${source}
        GROUP BY rolletype_kode, rolletype_beskrivelse
        ORDER BY rows DESC
        LIMIT 20
      `);
    } else if (filename === 'dim_aarsregnskap.parquet') {
      summary = await all(`
        SELECT regnskapsaar, COUNT(*) AS rows,
               COUNT(*) FILTER (WHERE regnskapstall_finnes) AS rows_with_amounts,
               COUNT(*) FILTER (WHERE fastsatt_dato IS NOT NULL) AS rows_with_fixed_date
        FROM ${source}
        GROUP BY regnskapsaar
        ORDER BY regnskapsaar
      `);
    }

    console.log(safeJson({
      file: filename,
      rows: Number(count[0]?.rows ?? 0),
      columns: schema,
      sample,
      summary,
    }));
  }
} finally {
  connection.close();
  database.close();
}
