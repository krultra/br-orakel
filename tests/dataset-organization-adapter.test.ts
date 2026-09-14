import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import duckdb from 'duckdb';
import { DatasetOrganizationAdapter, DatasetOrganizationError } from '../src/data/dataset-organization-adapter.js';

type Connection = { run(sql: string, callback: (error: Error | null) => void): void; close(): void };

const createFixture = async (file: string) => {
  const database = new duckdb.Database(':memory:');
  const connection = database.connect() as Connection;
  await new Promise<void>((resolve, reject) => connection.run(`
    COPY (
      SELECT * FROM (VALUES
        ('pk-1', '999999999', 'Fjordgløtt Mat og Handel AS', '5001', 'Trondheim', 'AS', 'Aksjeselskap', '47.110', '47.110', true, 2020, TIMESTAMP '2019-03-12 00:00:00'),
        ('pk-2', '888888888', 'Gammel virksomhet AS', '0301', 'Oslo', 'AS', 'Aksjeselskap', '00.000', NULL, false, NULL, NULL)
      ) AS rows(virksomhet_pk, organisasjonsnummer, enhetsnavn, kommunenummer, kommunenavn, enhetstype_forkortelse, enhetstype_beskrivelse, naeringskode_sn25, naeringskode_sn07, er_aktiv, registreringsaar_foretaksregisteret, registreringsdato_enhetsregisteret)
    ) TO '${file.replaceAll("'", "''")}' (FORMAT PARQUET)
  `, (error) => error ? reject(error) : resolve()));
  connection.close();
  database.close();
};

test('dataset-adapteren slår opp og søker virksomheter uten å laste hele parquet-filen', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'br-orakel-dataset-'));
  const file = path.join(directory, 'dim_virksomhet.parquet');
  await createFixture(file);
  const adapter = new DatasetOrganizationAdapter({ filePath: file });

  const organization = await adapter.findByOrgNumber('999 999 999');
  assert.ok(organization);
  assert.equal(organization.name, 'Fjordgløtt Mat og Handel AS');
  assert.equal(organization.organizationForm, 'AS');
  assert.deepEqual(organization.industryCodes, ['47.110']);
  assert.equal(organization.hasEmployees, undefined);
  assert.equal(organization.registeredInForetaksregister, true);
  assert.deepEqual(await adapter.searchByName('fjordgløtt'), [organization]);

  adapter.close();
  await rm(directory, { recursive: true, force: true });
});

test('dataset-adapteren gir en tydelig feil når den lokale filen mangler', async () => {
  const adapter = new DatasetOrganizationAdapter({ filePath: '/tmp/br-orakel-does-not-exist.parquet' });
  await assert.rejects(
    () => adapter.findByOrgNumber('999999999'),
    (error: unknown) => error instanceof DatasetOrganizationError && error.filePath.endsWith('br-orakel-does-not-exist.parquet'),
  );
  adapter.close();
});
