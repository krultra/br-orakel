# Oppgaveregisteret-integrasjon

`OppgaveregisteretAdapter` henter publiserte skjema fra det åpne
Oppgaveregisteret-API-et og mapper dem til den interne `Obligation`-typen.
API-et beskrives som en pilot av Brønnøysundregistrene, og den eksterne
responsstrukturen kan derfor endres. Se den [offisielle API-beskrivelsen](https://data.brreg.no/oppgaveregisteret/api/docs/index.html).

## Aktivere live-modus

Mockmodus er standard og brukes når `OPPGAVEREGISTERET_MODE` ikke er `live`.
For lokal kjøring kan live-modus aktiveres slik:

```bash
OPPGAVEREGISTERET_MODE=live \
OPPGAVEREGISTERET_API=https://data.brreg.no/oppgaveregisteret/api \
npm run start
```

I Docker skal verdiene settes i miljøet til `br-orakel`-containeren. Ikke legg
API-nøkler eller lokale miljøfiler i Git. Oppgaveregisteret krever ikke API-nøkkel
i denne integrasjonen.

## Forespørsel og paginering

Adapteren kaller `/skjema` med:

- `organisasjonsformer` fra `Organization.organizationForm`
- `naeringskoder` fra `Organization.industryCodes` (ett oppslag per kode, fordi pilot-endepunktet kan avvise flere koder i samme parameter)
- `ekskluderArbeidsgiver=false` for virksomheter med ansatte
- `ekskluderArbeidsgiver=true` for virksomheter uten ansatte
- `start` og `antall` for paginering

Siden registeret har en dokumentert maksimumsverdi for sideantall, begrenses
`OPPGAVEREGISTERET_PAGE_SIZE` til 160. Adapteren bruker 100 som standard og
stopper når siste side er kortere enn ønsket sideantall. Hver forespørsel har
timeout via `OPPGAVEREGISTERET_TIMEOUT_MS`.

Hvis registerets egen næringskodekatalog avviser én kode med HTTP 400, fortsetter
adapteren med de øvrige kodene. Hvis alle næringskoder avvises, returneres den
opprinnelige feilen i stedet for å vise et ufiltrert eller mocket resultat.

## Mapping

Registerets felter mappes slik:

- `guid`/`nummer` → stabil intern id og `registerId`
- `navn` → oppgavenavn
- `eier.etatsnavn` → ansvarlig etat
- `formaal.fritekst` og kommentarer → beskrivelse
- `lovhjemler` → lovhjemmel
- `maalgruppe` → målgruppekriterier
- `skjemainnhold` → nødvendige data
- `vedleggskrav` → vedlegg
- `tidsbruk.elektronisk`, ellers `tidsbruk.papir` → estimert tidsbruk
- `bruksomraader` med «Hendelsesrapportering» → hendelsesutløst oppgave
- `rapporteringsformer` → `Obligation.reportingForms`
- `statustype=PUBLISERT` → `OFFICIAL`; andre statuser → `UNDER_REVIEW`

Oppgaveregisteret oppgir ikke nødvendigvis en virksomhetsspesifikk frist i
skjemalisten. Adapteren lager derfor ikke en frist eller et rapporteringsvindu
som ikke finnes i responsen. Disse feltene forblir udefinert inntil vi har en
egen kilde eller domenemodell for frister.

## Feilhåndtering og tillit

Live-modus faller ikke lydløst tilbake til mockdata. Ved nettverksfeil,
timeout, ugyldig JSON eller HTTP-feil returnerer adapteren en tydelig
`OppgaveregisteretError`. Dette hindrer at mockede oppgaver presenteres som
offisielle registerdata.

Alle mappede oppgaver får `sourceLinks: ["source-oppgaveregisteret"]` og
`OFFICIAL`/`UNDER_REVIEW` etter registerets status. KI- og brukerinnspill går
fortsatt gjennom separate typer og adaptere.
