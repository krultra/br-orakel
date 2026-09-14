# Datafiler lokalt

Store hackathon-filer skal ikke lagres i Git. Monter dem lokalt i `data/raw/`, eller pek importøren direkte på en fil utenfor repoet.

## Hackathon 2026-datasettet

Datasettet fra Brønnøysundregistrenes Google Cloud Storage-bøtte ble kartlagt
14. september 2026. Følgende avgrensede filer ligger lokalt i `data/raw/` på
utviklingsmaskinen og er med vilje ignorert av Git:

- `dim_virksomhet.parquet` (ca. 555 MB): virksomhetsnavn, organisasjonsnummer,
  organisasjonsform, kommune, SN25/SN07-næringskode og registerstatus.
- `fact_rolle.parquet` (ca. 290 MB): roller koblet til virksomheter og personer.
  Persondimensjonen er ikke lastet ned.
- `dim_aarsregnskap.parquet` (ca. 215 MB): metadata om årsregnskap 2020–2025.
- `dim_feltkode.parquet` (ca. 198 KB): beskrivelse av regnskapsfeltkoder.
- `informasjon-om-datasett.pdf` og `erd-diagram-hackathon.pdf`: arrangørens
  dokumentasjon og datamodell.

Fullstendig analyse og vurdering står i [docs/DATASET.md](../docs/DATASET.md).
Rådataene skal ikke pushes, kopieres inn i Docker-imaget eller sendes til
nettleseren.

Kjør en strømme-/DuckDB-basert analyse av filene slik:

```bash
npm run analyze-dataset -- ./data/raw
```

Virksomhetsadapteren kan brukes lokalt uten live Enhetsregisteret:

```dotenv
ENHETSREGISTERET_MODE=dataset
ENHETSREGISTERET_DATASET_PATH=./data/raw/dim_virksomhet.parquet
OPPGAVEREGISTERET_MODE=live
```

Datasettadapteren mangler arbeidsgiverindikator. Den lar derfor feltet være
ukjent, og Oppgaveregisteret-adapteren utelater arbeidsgiverfilteret i stedet
for å gi et falskt «ingen ansatte»-signal.

Importer med DuckDB fra disk:

```bash
npm run import -- --input ./data/raw/enheter.json --output ./data/warehouse/enheter.duckdb --org-number 999999999
npm run import -- --input ./data/raw/oppgaver.csv --output ./data/warehouse/oppgaver.duckdb
npm run import -- --input ./data/raw/dim_virksomhet.parquet --format parquet --output ./data/warehouse/virksomhet.duckdb --org-number 935907780
```

Importereren bruker DuckDB sine `read_json_auto`/`read_csv_auto`-scannere, lagrer et normalisert utsnitt i DuckDB og skriver Parquet ved siden av databasen. JavaScript mottar bare skjema og telling tilbake. For en 35 GB-fil bør `--org-number` brukes så tidlig som datasettet og kolonnen tillater det.

Forventede organisasjonsnummerfelt er `orgNumber`, `organisasjonsnummer`, `orgnr` eller `organizationNumber`. Ubehandlede råfiler og genererte warehouse-filer er ignorert av Git.
