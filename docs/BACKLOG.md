# ORaKeL backlogg – versjon 2.0

Dette dokumentet er arbeidslisten for videre brukerfunksjonalitet etter
demo-release `1.0.0`. Saksbehandlerflyt og prosess-støtte er bevisst lagt etter
versjon 2.0.

## Produktbeslutninger

### Automatiske rapporteringer

En oppgave skal skille mellom juridisk oppgave, arbeidsstatus og hvordan
innsendingen håndteres:

- `submissionMode`: `manual`, `system` eller `unknown`
- `completionSource`: `user`, `system`, `rule` eller `unknown`
- `automaticCompletionPolicy`: for eksempel `after_deadline`

A-meldingen er et eksempel på en oppgave som kan merkes «innsending fra
system». I MVP-en kan en slik oppgave få beregnet status «Ferdig» etter passert
frist, men UI-et skal vise at dette er automatisk beregnet. Når en ekte
kvitteringskilde finnes, skal kvitteringen ha prioritet over tidsregelen.

Automatiske oppgaver skal ikke få gul «nær frist»-varsel bare fordi brukeren
ikke har klikket «Ferdig». De vises med en rolig lyseblå flate og en tydelig
grønn systemprikk. Farge skal suppleres med tekst/ikon av hensyn til
tilgjengelighet.

### Demping, skjuling og arbeidsliste

Disse må holdes adskilt:

- `isActivated`: brukeren har valgt oppgaven inn i arbeidslisten
- `isMuted`: oppgaven er dempet i oversikten, men fortsatt tilgjengelig
- `isHidden`: brukeren har skjult oppgaven eller forekomsten

Brukerbegrepet anbefales å være **Dempet**. «Inaktiv» kan tolkes som at den
offisielle plikten ikke gjelder, og «skjult» brukes allerede om en annen
funksjon.

### Virksomhetsprofil

Virksomhetsinformasjon i topplinjen skal være en inngang til en egen
virksomhetsprofil, ikke en stor permanent informasjonsblokk. Profilen bør vise:

- offisielle registeropplysninger og kilder
- næringskoder, organisasjonsform og registerstatus
- ansatte/arbeidsgiveropplysninger når kilden tilbyr det
- relevante økonomi- og regnskapsdata når de er tilgjengelige
- brukerens egne opplysninger og korrigeringer separat fra offisielle data
- kilde og tidspunkt for hvert felt

Offisielle data skal aldri overskrives av brukerinput. En korrigering lagres
som et brukerforslag med begrunnelse og kan senere bekreftes av en autorisert
kilde eller saksbehandler.

### Loshistorikk og deling

Alle spørsmål og svar lagres privat som standard. Et svar kan få en enkel
tilbakemelding («Nyttig»/«Ikke nyttig»). Først etter «Nyttig» kan systemet
foreslå deling til fellesskapet. Deling krever fortsatt et eksplisitt samtykke,
men dette gjør samtykket relevant og mindre belastende enn et samtykkeskjema på
alle svar.

Delingsflyten skal:

1. vise hva som foreslås delt
2. fjerne eller maskere organisasjonsnummer, virksomhetsnavn og persondata
3. forklare at innholdet blir vurdert før publisering
4. lagre samtykke, tidspunkt og hvilken tekst som ble godkjent
5. la brukeren trekke tilbake samtykke før publisering

Poeng og bidragsnivåer skal bruke en hendelseslogg, ikke bare et manuelt
poengtall. Det gjør det mulig å forklare hvorfor poeng er gitt og å korrigere
misbruk.

## Prioritert arbeidsliste

Status: `TODO` = ikke startet, `READY` = kan startes, `BLOCKED` = avhenger av
en beslutning eller annen leveranse.

### Spor A – arbeidsstatus og kalender

**Eier:** frontend + domene  
**Status:** IN PROGRESS
**Avhengigheter:** ingen

- [x] Modellere automatiske innsendinger og automatisk beregnet ferdig-status.
- [x] Oppdatere A-melding i mockdata med systeminnsending.
- [x] Skille automatisk håndtert fra manuelt ferdig i tekst, ikon og filter.
- [x] Unngå gult varsel for automatisk håndterte oppgaver.
- [x] Fremheve gjeldende måned tydelig i årshjulet.
- [x] Lage filter for dempede oppgaver.
- [x] Implementere `isMuted` separat fra `isActivated` og `isHidden`.
- [x] Støtte aktivering av én dempet oppgave.
- [x] Støtte datofilter som demper alle historiske oppgaver ved ny virksomhet.
- [ ] Støtte aktivering av alle dempede oppgaver samlet.

**Akseptanse:** A-melding som ikke er manuelt markert ferdig blir ikke vist som
en gul manuell restanse dersom den er merket som systeminnsending. Brukeren
forstår samtidig hvorfor statusen er ferdig eller automatisk håndtert.

### Spor B – virksomhetsprofil og kontekst

**Eier:** frontend + API/data  
**Status:** READY  
**Avhengigheter:** avklarte felt fra virksomhetskildene

- [ ] Gjøre valgt virksomhet i topplinjen klikkbar.
- [ ] Lage egen profilvisning med offisielle felt, kilder og hentetidspunkt.
- [ ] Vise brukerinput separat fra registerdata.
- [ ] La brukeren legge til egne opplysninger og foreslå korrigeringer.
- [ ] Etablere feltstatus: `OFFICIAL`, `USER_INPUT`, `USER_SUGGESTION`, `UNKNOWN`.
- [ ] Utvide kontekstkontrakten for losen med virksomhetsprofilen.
- [ ] Legge til relevante åpne regnskaps- og økonomidata uten å sende store
  datasett ukritisk til modellen.

**Akseptanse:** Losen kan forklare hvilke virksomhetsdata den faktisk har
brukt. Offisielle og brukerdefinerte felt kan ikke forveksles i UI eller
modellkontekst.

### Spor C – loshistorikk

**Eier:** API + frontend  
**Status:** READY  
**Avhengigheter:** virksomhetsprofilens bruker-/organisasjonskobling

- [ ] Lagre `ChatExchange` med spørsmål, svar, kilder, usikkerhet og tidspunkt.
- [ ] Knytte historikk til bruker og virksomhet.
- [ ] Lage «Tidligere spørsmål» med søk og filtrering.
- [ ] Åpne gammelt svar med samme kildevisning som nye svar.
- [ ] Støtte «Still på nytt» og sletting.
- [ ] Lagre nyttig/ikke nyttig som separat tilbakemelding.
- [ ] Legge inn personvern- og lagringsavgrensning i dokumentasjonen.

**Akseptanse:** En bruker finner igjen egne spørsmål uten at en annen bruker
kan se dem. Historiske svar viser hvilke kilder som faktisk ble brukt.

### Spor D – autoriserte kilder og online retrieval

**Eier:** data/API  
**Status:** READY  
**Avhengigheter:** ingen for første allowlist

- [ ] Implementere en vedlikeholdbar allowlist for autoritative domener.
- [ ] Klassifisere kilder som `AUTHORITATIVE`, `OFFICIAL_GUIDANCE`,
  `DISCOVERY` eller `UNVERIFIED`.
- [ ] La losen hente relevante sider online når spørsmålet krever det.
- [ ] Ikke lagre en lokal kopi av all veiledning som standard.
- [ ] Lagre bare metadata, kilde-URL, utdrag brukt i svaret og tidspunkt.
- [ ] Avvise eller tydelig merke kilder utenfor allowlisten.
- [ ] Vise kildegrunnlag og usikkerhet i hvert svar.

**Akseptanse:** Losen kan ikke omtale en tilfeldig nettside som autoritativ.
Saksbehandler kan senere vedlikeholde listen uten å endre promptlogikken.

### Spor E – rapporteringsnavigator og hendelser

**Eier:** produkt + frontend + domene  
**Status:** READY  
**Avhengigheter:** virksomhetsprofil og autoriserte kilder

- [ ] Lage en egen hovedvisning for hendelsesnavigatoren.
- [ ] Starte med et lite antall hendelser, for eksempel ny ansatt, endret
  omsetning, sykefravær/foreldrepermisjon og endring i virksomhet.
- [ ] Vise trinn, nødvendige data, kilder og relevante rapporteringsplikter.
- [ ] Bruke losen for hendelser som ikke har forhåndsdefinert veiledning.
- [ ] Tilpasse svar og spørsmål til den valgte virksomheten.

**Akseptanse:** En bruker kan velge en hendelse og få en kort, virksomhetstilpasset
oversikt over hva som bør undersøkes videre.

### Spor F – organisering av hovedkolonnen

**Eier:** frontend  
**Status:** BLOCKED av endelig navigasjonsvalg

Anbefalt struktur er separate hovedvisninger, ikke én lang side:

1. **Årshjul** – tidsoversikt og kalender
2. **Hendelsesnavigator** – hva gjør jeg når noe skjer?
3. **Arbeidsliste** – bare aktivt valgte oppgaver
4. **Meld inn manglende plikt** – brukerinnspill
5. **Losen** – spørsmål, historikk og kunnskapsgrunnlag

`Oppgavedetaljer` blir eneste faste kort i høyre kolonne. Høyre kolonne kan
være tom når ingen oppgave er valgt. Kilder vises i losvisningen eller i
oppgavedetaljene når de gjelder en konkret oppgave.

På mobil bør dette bli en enkel navigasjon med én hovedvisning om gangen.

### Spor G – bidrag, poeng og nivåer

**Eier:** produkt + API + frontend  
**Status:** BLOCKED til historikk og delingssamtykke er på plass

- [ ] Lage poenghendelser for forslag, nyttige svar, FAQ-bidrag og
  saksbehandlerbekreftelse.
- [ ] Foreslå nivåene: «Lokal bidragsyter», «Lokal skjemaguide» og
  «Lokal skjemaguru».
- [ ] Vise personlig fremgang før offentlig toppliste.
- [ ] Gjøre toppliste og offentlig visningsnavn frivillig.
- [ ] Begrense poeng per type aktivitet per tidsperiode.
- [ ] Vurdere «månedens bidragsyter» etter at vi har ekte bruksmønster.

Gamification bør belønne kvalitet, ikke bare mengde. Poeng for et forslag bør
derfor øke når innspillet blir vurdert, tatt i bruk eller koblet til en
bekreftet oppgave.

### Etter versjon 2.0

- [ ] Saksbehandlerportal med kø, etatsfilter, moderering og revisjonslogg.
- [ ] Etatsspesifikke moderatorroller.
- [ ] Prosess-støtte for utvalgte komplekse rapporteringer.
- [ ] Produksjonsklar autentisering, tilgangsstyring og personvernforvaltning.

## Paralleliseringsrekkefølge

Spor A, B, C og D kan starte parallelt med avgrensede kontrakter. Spor E bør
starte når B og D har en første kontrakt. Spor F kan gjøre en ren frontend-
prototype parallelt, men bør ikke låse API-et før produktflyten er prøvd.
Spor G starter etter C og delingsmodellen i D er etablert.

Anbefalt første parallelle sprint:

| Spor | Leveranse | Primære filer/område |
| --- | --- | --- |
| A | Automatisk innsending, demping og månedshøylys | `src/domain/**`, `src/App.tsx` |
| B | Virksomhetsprofil og kontekstkontrakt | `src/domain/**`, `server/**`, frontend |
| C | Privat loshistorikk og søk | `server/**`, `src/api.ts`, frontend |
| D | Autorisert kildepolicy og online retrieval-kontrakt | `docs/AUTHORIZED_SOURCES.md`, `src/data/**` |
| F | Navigasjonsprototype | frontend, uten API-endringer |

Hovedagenten integrerer delte domenekontrakter først. Hver agent skal levere
tester, beskrive antakelser og ikke endre en annen agents primære filer.
