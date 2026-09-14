# Hackathon 2026-datasettet

Dette dokumentet beskriver første analyse av datasettet som ble delt av
Brønnøysundregistrenes dataplattformteam i e-post 14. september 2026.

## Kilde og avgrensning

Datasettet kommer fra Enhetsregisteret, Foretaksregisteret,
Regnskapsregisteret og Støtteregisteret. Arrangørens dokumentasjon sier at
uttrekket er laget for hackathonet, og at enkelte opplysninger kan avvike fra
løpende registerkilder eller være ufullstendige. Bucketen er midlertidig og
skal ikke behandles som en permanent produksjonskilde.

Tilgangen kom via Google Cloud Storage-bucketen
`brreg-hackathon-2026-data`. Den offentlige objektbanen kan brukes til
reproduserbar nedlasting mens bucketen er åpen:

`https://storage.googleapis.com/brreg-hackathon-2026-data/`

Råfiler ligger i `data/raw/`, som er Git-ignorert. Ingen rådata eller
persondimensjon skal legges i GitHub.

## Filer som er hentet lokalt

| Fil | Størrelse i bucket | Rader | Relevans |
| --- | ---: | ---: | --- |
| `dim_virksomhet.parquet` | ca. 555 MB | 5 625 567 | Høy: virksomhetssøk og grunnlag for næringskode/form |
| `fact_rolle.parquet` | ca. 290 MB | 3 011 356 | Middels: rolle-/ansvarsindikatorer, men koblet til persondata |
| `dim_aarsregnskap.parquet` | ca. 215 MB | 2 553 382 | Middels: historikk og metadata om årsregnskap |
| `dim_feltkode.parquet` | ca. 198 KB | 2 980 | Lav nå, høy ved senere bruk av regnskapsbeløp |
| `informasjon-om-datasett.pdf` | ca. 109 KB | 2 sider | Kilde- og avgrensningsdokumentasjon |
| `erd-diagram-hackathon.pdf` | ca. 458 KB | 1 side | Relasjoner og felter |

Ikke hentet lokalt:

- `dim_person.parquet`: inneholder persondimensjon. Den er ikke nødvendig for
  første MVP og bør behandles med dataminimering.
- `fact_regnskapstall_beloep.parquet`: ca. 10,1 GB. Dette er bare aktuelt
  dersom vi bygger regnskapsbasert berikelse og kan spørre kolonne-/radvis med
  DuckDB.
- `dim_notepost.parquet` og `dim_revisjonsinfo.parquet`: kan bli relevante for
  årsregnskap, men er ikke nødvendige for virksomhetssøk eller første demo.
- Støtteregisterets CSV/JSON-filer: interessante for en egen støtteordnings-
  eller rapporteringskontekst, men ikke en direkte kilde til Oppgaveregisteret.

## Analyse av `dim_virksomhet`

DuckDB analyserte Parquet-filen direkte fra disk. Resultatet var:

- 5 625 567 rader og like mange distinkte organisasjonsnumre i dette uttrekket.
- 2 035 960 aktive og 3 589 607 inaktive rader.
- 3 634 291 rader mangler SN25-kode; 1 455 114 mangler SN07-kode.
- Feltene dekker organisasjonsnummer, navn, adresse, kommune, fylke,
  enhetstype, SN25/SN07 med beskrivelser, registreringsdatoer,
  Foretaksregister-år, slettedatoer, aktiv-status og konkursbo-indikator.

Dette er svært nyttig for navnesøk og for å vise hvorfor en oppgave er funnet.
Det er samtidig viktig å skille «virksomhet» fra juridisk foretak: uttrekket
inneholder blant annet `BEDR`-underenheter. Adapteren filtrerer på aktiv status
ved navnesøk, men beholder organisasjonsformen i resultatet slik at brukeren
kan se hva som faktisk er valgt.

Datasettet inneholder ikke antall ansatte eller et sikkert
arbeidsgiveransvarsfelt. Dataset-adapteren setter derfor
`Organization.hasEmployees` til `undefined`. Når dette feltet er ukjent,
utelater Oppgaveregisteret-adapteren arbeidsgiverfilteret i stedet for å
filtrere bort mulige oppgaver.

## Analyse av roller

`fact_rolle` har 3 011 356 rader med `virksomhet_fk`, `person_fk`, rolle-kode,
rollebeskrivelse og avregistreringsstatus. De største rollene er styremedlem,
styrets leder, innehaver og daglig leder.

Dette kan senere brukes til å foreslå hvem i virksomheten som typisk bør se på
en oppgave, men det er ikke det samme som et arbeidsforhold eller
arbeidsgiveransvar. Før persondimensjonen kobles på må vi avklare formål,
tilgang, dataminimering og hva som faktisk skal vises i demoen.

## Analyse av årsregnskapsmetadata

`dim_aarsregnskap` har 2 553 382 rader fordelt på regnskapsår 2020–2025.
Tabellen inneholder blant annet regnskapsstatus, om regnskapstall finnes,
regnskapsregler, IFRS-flagg, regnskapsfører-/konsernindikatorer og mottatt,
registrert og fastsatt dato.

Dette er nyttig som berikelse i en senere detaljvisning, for eksempel «siste
årsregnskap registrert» eller som kontekst når losen forklarer årsregnskap.
Det bør ikke brukes alene til å konkludere med at en virksomhet har en bestemt
rapporteringsplikt. Den autoritative oppgavelisten kommer fortsatt fra
Oppgaveregisteret og godkjente veiledningskilder.

## Integrasjon i løsningen

`DatasetOrganizationAdapter` er valgfri og brukes med:

```dotenv
ENHETSREGISTERET_MODE=dataset
ENHETSREGISTERET_DATASET_PATH=./data/raw/dim_virksomhet.parquet
OPPGAVEREGISTERET_MODE=live
```

Adapteren bruker DuckDBs Parquet-leser, gjør oppslag på organisasjonsnummer og
navnesøk direkte i filen og sender bare den valgte raden videre til API-et.
Hele filen lastes ikke inn i JavaScript-minnet og sendes aldri til nettleseren.

Live Enhetsregisteret er fortsatt anbefalt når ferske opplysninger og
arbeidsgiverindikator er viktigst. Dataset-modus er nyttig for en stabil,
reproduserbar demo og for å vise at løsningen kan jobbe med hackathonets store
filer lokalt.

## Neste anbefalte steg

1. Avklar med Marit hvilke felt fra Støtteregisteret som skal regnes som
   godkjente kilder for losen.
2. Legg inn en egen, eksplisitt datakilde for arbeidsgiveransvar eller behold
   live Enhetsregisteret når Oppgaveregisteret skal filtreres strengt.
3. Når det finnes et konkret scenario, hent bare nødvendige kolonner/rader fra
   regnskapsfilene til et lokalt DuckDB-uttrekk; ikke legg originalfilene i
   container eller Git.
