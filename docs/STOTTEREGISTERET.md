# Støtteregisteret i hackathon-datasettet

Støttefilene er hentet fra hackathon-bucketen til `data/raw/`. De er
semikolonseparerte CSV-filer kodet som UTF-16LE. Filene er Git-ignorert og skal
ikke kopieres inn i Docker-imaget eller sendes til nettleseren.

## Filer

| Fil | Lokal størrelse | Innhold |
| --- | ---: | --- |
| `stoetteordning_2020_2025.csv` | ca. 1,4 MB | støtteordning, støttegiver, gyldighet, statsstøttegrunnlag, formål og lenker |
| `stoettetildeling_2020_2025.csv` | ca. 256 MB | tildeling, støttemottaker, støttegiver, dato, beløp, region, næring og ordning |

Analyser med DuckDB fra disk:

```bash
npm run analyze-support -- ./data/raw
```

Analysen bruker `encoding='utf-16'` og skanner CSV-filene direkte. Beløpene
ligger som tekst med norsk desimalskilletegn. Summene i analysen er derfor
indikative summer av verdier som kunne parses som tall; de skal ikke tolkes som
regnskaps- eller støttefaglige konklusjoner.

## Første analyse

- `stoettetildeling_2020_2025.csv` inneholder 294 007 tildelinger.
- Det er 58 467 ulike organisasjonsnumre blant støttemottakerne.
- Tildelingsdatoene går fra 2016-01-21 til 2026-08-28, selv om filnavnet
  refererer til 2020–2025. Dette må vises som et uttrekksfunn, ikke som en
  antakelse om datasettets offisielle dekningsperiode.
- `stoetteordning_2020_2025.csv` inneholder 731 støtteordninger fra 111
  støttegivere.
- Nesten alle tildelingene har status `Registrert`; én rad er merket `Ulovlig
  støtte`. Statusfeltet må vises som registerinformasjon og ikke brukes til å
  lage juridiske anbefalinger automatisk.

## Anbefalte demo-virksomheter

### COOP NORD SA — organisasjonsnummer `938497257`

- Organisasjonsform: samvirkeforetak (`SA`)
- Næringskode: `47.110`, detaljhandel med bredt vareutvalg med hovedvekt på
  nærings- og nytelsesmidler
- Kommune: Tromsø
- 201 registrerte tildelinger i uttrekket
- Summerte parsbare beløp: ca. 138,0 millioner NOK
- Tydelig eksempel på regionalstøtte og skatte-/avgiftsfritak, med flere
  tildelinger over tid og på tvers av regioner

Dette er beste hoveddemo fordi virksomheten gir en rik historikk og kan
illustrere filtrering på dato, støttegiver, ordning, region og beløp.

### THON NORDLYS AS — organisasjonsnummer `986954244`

- Organisasjonsform: aksjeselskap (`AS`)
- Næringskode: `55.100`, drift av hoteller
- Kommune: Oslo
- 10 registrerte tildelinger i uttrekket
- Summerte parsbare beløp: ca. 3,4 millioner NOK

Dette er et godt alternativ når vi ønsker en kortere og mer håndterlig
detaljvisning, samtidig som virksomheten er lett å forstå for demo-publikummet.

Begge organisasjonsnumrene er kontrollert mot det åpne Enhetsregisteret og
stemmer med navn, organisasjonsform og næringskode i uttrekket.

## Hva kan ORaKeL bruke dette til?

Støttedata kan gi losen og virksomhetsprofilen kontekst om registrerte
støttetildelinger, støtteordninger, støttegiver, dato, beløp, region, næring og
statsstøttegrunnlag. Det kan brukes til spørsmål som «hvilken offentlig støtte
er registrert på virksomheten?» og «hvilke opplysninger bør jeg ha oversikt
over?». Det skal ikke brukes til å konkludere med at virksomheten har krav på
støtte, at en rapporteringsplikt gjelder eller at registeret er komplett.

Første integrasjon bør derfor være read-only og vise kilde, uttrekksdato og
dekningsforbehold. Råfilen er godt egnet som lokal DuckDB-kilde for demo, mens
et eventuelt live-oppslag må avklares separat. Det offentlige søkegrensesnittet
på [stotte.brreg.no](https://stotte.brreg.no/) tilbyr søk på
støttemottakers organisasjonsnummer og JSON/CSV-nedlasting av søkeresultater,
men viser maksimalt de første 1000 treffene. En maskin-til-maskin-løsning må
etter tilgjengelig offentlig veiledning utarbeides i samarbeid med
Brønnøysundregistrene.

## Implementert i v3.0

- `SupportRegistryAdapter` med mockdata og en DuckDB-basert lokal provider.
- Egen arbeidsflate **Støtte** med antall tildelinger, summerte publiserte
  beløp, søk, støttegiver, ordning, dato, instrument, formål og rettslig
  grunnlag.
- Tydelig merking av registerdata, mockdata og dekningsforbehold.
- Knapp som sender en begrenset og strukturert støtteoppsummering til losen.
- Mulighet til å opprette en lokal støtteoppfølging fra en registrert tildeling.
  Oppfølgingen kan være «Søke støtte», «Avklare støtte» eller «Følge opp
  tidligere støtte», med engangsfrist eller årlig gjentakelse.
- Lokale støtteoppfølginger vises i arbeidsliste og årshjul med eget merke og
  `USER_REPORTED`-tillitsnivå. De er aldri offisielle rapporteringsplikter.
- Fallback til mockdata når råfilene ikke er montert, slik at demoen fungerer
  uten datasettet.

En tidligere tildeling gir bare et forslag til at brukeren kan planlegge en
oppfølging. Brukeren må selv velge type og frist, og ORaKeL skal ikke antyde at
ordningen fortsatt finnes eller at virksomheten er kvalifisert.

## Neste steg

1. Avklare om offentlig søk/JSON/CSV kan brukes maskinelt, eller om
   Brønnøysundregistrene må gi en egen API-tilgang.
2. Eventuelt bytte DuckDB-provider med en offisiell API-provider uten å endre
   frontendkontrakten.
3. Vurdere en mer detaljert støtteprofil først når teamet har avklart hvilke
   spørsmål og avgrensninger som skal demonstreres.
