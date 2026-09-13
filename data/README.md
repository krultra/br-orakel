# Datafiler lokalt

Store hackathon-filer skal ikke lagres i Git. Monter dem lokalt i `data/raw/`, eller pek importøren direkte på en fil utenfor repoet.

Importer med DuckDB fra disk:

```bash
npm run import -- --input ./data/raw/enheter.json --output ./data/warehouse/enheter.duckdb --org-number 912345678
npm run import -- --input ./data/raw/oppgaver.csv --output ./data/warehouse/oppgaver.duckdb
```

Importereren bruker DuckDB sine `read_json_auto`/`read_csv_auto`-scannere, lagrer et normalisert utsnitt i DuckDB og skriver Parquet ved siden av databasen. JavaScript mottar bare skjema og telling tilbake. For en 35 GB-fil bør `--org-number` brukes så tidlig som datasettet og kolonnen tillater det.

Forventede organisasjonsnummerfelt er `orgNumber`, `organisasjonsnummer`, `orgnr` eller `organizationNumber`. Ubehandlede råfiler og genererte warehouse-filer er ignorert av Git.
