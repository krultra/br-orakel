# Begrepsassistent

Begrepsassistenten er første P0-leveranse i v3.0. Den bruker Felles datakatalog som oppslagskilde, men har et lite mock-katalogsett slik at hele demoen fungerer uten nettverk.

## Arkitektur

- `ConceptAdapter` er provider-uavhengig og har `search`, `getById` og `getByUri`.
- `FdkConceptAdapter` snakker med Felles datakatalog fra serveren. Nettleseren kaller aldri katalogen direkte.
- `FallbackConceptAdapter` faller tilbake til mockbegreper dersom FDK er utilgjengelig.
- `Concept` er en egen domenemodell. Et begrep er ikke en rapporteringsplikt og blandes derfor ikke inn i `Obligation`.
- Et valgt begrep sendes bare til losen når brukeren trykker «Spør losen om begrepet». Hele begrepskatalogen sendes aldri som kontekst.

## Lokale innstillinger

Standard er live FDK med mock-fallback:

```dotenv
FDK_CONCEPT_MODE=live
FDK_CONCEPT_SEARCH_API=https://search.api.fellesdatakatalog.digdir.no/search
FDK_CONCEPT_RESOURCE_API=https://resource.api.fellesdatakatalog.digdir.no/v1
FDK_CONCEPT_TIMEOUT_MS=5000
```

For en helt nettverksfri demo kan `FDK_CONCEPT_MODE=mock` brukes.

## Server-API

- `GET /api/concepts?q=arbeidstaker&limit=8`
- `GET /api/concepts/{id}`
- `GET /api/concepts/by-uri?uri=...`

API-et er et tynt proxy-/adapterlag. Det bør beholdes slik dersom Felles datakatalog endrer søke- eller ressursendepunktene.

## Tillit og kilder

Begrepsdefinisjoner fra FDK vises med tillitsnivået `OFFICIAL_GUIDANCE`: katalogen er en offentlig kilde, men en begrepsdefinisjon alene er ikke en juridisk konklusjon om rapporteringsplikt. Mockbegreper er tydelig merket med `(mockdata)` i utgivernavnet.

Når et begrep brukes i losen, oppgis term, definisjon, utgiver og kilde-URL som valgt kunnskapskontekst. Losen må fortsatt vise usikkerhet og skille definisjon fra egne forslag.

## Ratebegrensning

FDK-søket er et offentlig API med ratebegrensning. Bruk søk på eksplisitt brukerhandling, begrens treffmengden og behold timeouten. Ikke bygg en lokal fullkatalog eller gjør periodisk masseinnhenting i MVP-en.
