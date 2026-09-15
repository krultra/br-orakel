# ORaKeL v3.0 – plan og arbeidsliste

v3.0 skal utvide ORaKeL fra en oversikt over rapporteringsplikter til en
virksomhetstilpasset veiviser som også forklarer begreper, peker på relevante
tilsynstemaer og viser hvilke opplysninger som kan gjenbrukes. Versjonen skal
fortsatt være en forklarings- og forberedelsesløsning. Den skal ikke fastslå
juridisk plikt, varsle om et tilsyn som ikke er bekreftet av en autoritativ
kilde eller opprette en offisiell oppgave automatisk.

Denne planen bygger på v2.0-baseline og innspillene fra Marits idéarbeid i
Teams-chatten. Chatinnspillene er behandlet som produktideer og hypoteser, ikke
som tekniske eller juridiske fasiter.

## Kort produktretning

«Fra plikt til flyt» får i v3.0 tre synlige spørsmål:

1. Hva betyr dette?
2. Hva kan være relevant for min virksomhet?
3. Hva kan jeg forberede eller slippe å fylle ut på nytt?

De to viktigste nye arbeidsflatene er **Begreper** og **Tilsyn**. Datagjenbruk
er en tverrgående funksjon som kobles til oppgavedetaljer og losens kontekst.

## Innspill fra Teams-chatten

Følgende er de relevante innspillene vi tar med videre:

- Konseptet «Min rapporteringsplikt» kobler virksomhetsdata,
  Oppgaveregisteret, tilsynsdata og åpne forskrifter. Brukeren skal kunne få
  en personlig oversikt over kommende rapportering og hva som mangler.
- Tilsyn bør vises som et eget kunnskaps- og forberedelsesspor. Eksemplene var
  blant annet Arbeidstilsynet, Mattilsynet og DSB, med temaer som HMS,
  internkontroll og dokumentasjon.
- Begrepshjelp bør ligge kontekstuelt der brukeren møter et faguttrykk, for
  eksempel ved «HMS», «internkontroll», «A-melding» og «selvstendig
  næringsdrivende».
- En begrepsassistent og Felles datakatalog ble pekt på som mulig grunnlag.
  En lenke til en separat begrepsassistent finnes i chatten, men v3.0 bør
  integreres mot åpne API-er og ha en egen adapter slik at vi ikke blir
  avhengige av en innlogget frontend.
- «La oss hente det for deg» beskriver samtykkebasert datagjenbruk på
  feltnivå: vis hvilken opplysning som kreves, hvem som eier den, om den kan
  hentes eller bekreftes, og hva som må oppgis manuelt.
- Digitale bevis og full automatisk innhenting er interessante
  videreutviklingshypoteser, men bør ikke være en forutsetning for v3.0.

## Prioritert omfang

### P0 – Begrepsassistent som første leveranse

Målet er å gjøre språket i rapporteringsoppgavene forståelig uten å sende
brukeren ut av ORaKeL.

- [x] Søke etter begreper fra en egen begrepsarbeidsflate og åpne kuraterte
  begreper direkte fra oppgavedetaljer.
- [x] Vise anbefalt term, definisjon, kilde, eier, gyldighetsperiode når den
  finnes og relaterte termer.
- [x] Vise tydelig forskjell på offisiell definisjon, forklarende veiledning og
  KI-generert forenkling.
- [ ] Koble utvalgte begreper til felter i virksomhetsprofilen og
  Oppgaveregisteret når koblingen er dokumentert. En ukjent kobling skal vises
  som «ikke avklart».
- [x] Legge valgt begrep inn i losens kontekst bare når brukeren ber om
  forklaring eller åpner begrepet. Hele begrepskatalogen skal aldri sendes til
  modellen.
- [x] Ha mockdata for demo og en feiltolerant live-adapter.
- [x] Vise kilde-URL og hentetidspunkt på hvert treff.

#### Teknisk anbefaling for begreper

Bruk en provider-uavhengig `ConceptAdapter` med to trinn:

1. Søk i Felles datakatalogs søketjeneste med ressursfilter `concepts`.
2. Hent detaljene fra ressurtjenesten ved FDK-ID eller global URI.

Søketjenesten er offentlig tilgjengelig, men dokumentasjonen advarer om at
den brukes internt og kan endres. Adapteren må derfor isolere API-formatet,
ha timeout/rate-limit-håndtering og beholde mock-fallback. Søkeresultatene må
begrenses og pagineres. Detaljoppslag og kildeinformasjon er den stabile delen
av brukerflyten.

Endepunktene ble kontrollert 15. september 2026. Et POST-oppslag mot
`https://search.api.fellesdatakatalog.digdir.no/search/concepts` svarte med
maskinlesbare treff og FDK-ID-er. Et påfølgende oppslag mot
`https://resource.api.fellesdatakatalog.digdir.no/v1/concepts/{id}` svarte med
term, definisjon, utgiver, status, relasjoner og kontaktpunkt. Dette er godt
grunnlag for en første live-integrasjon, men responsformatet skal fortsatt
valideres med kontrakttester og mockes i demoen.

### P0 – Tilsyn som kunnskaps- og forberedelsesspor

Tilsyn må modelleres separat fra rapporteringsplikter. Det er vesentlig at
ORaKeL ikke forveksler «dette kan være relevant» med «etaten har varslet
tilsyn».

#### Tre forskjellige objekter

| Objekt | Betydning | Tillitsnivå |
| --- | --- | --- |
| Tilsynstema | Offisielt beskrevet område en virksomhet kan omfattes av | `OFFICIAL_GUIDANCE` |
| Tilsynsvarsel | Konkret melding/dato fra etat eller brukerens dokumentasjon | `OFFICIAL` eller `USER_REPORTED` |
| Forberedelsespunkt | ORaKeLs forklaring eller brukerens egen oppgave | `AI_SUGGESTION` eller `USER_INPUT` |

Et generelt tilsynstema skal derfor ikke vises som en kalenderfrist med mindre
det finnes en konkret, kildebelagt dato. Et eventuelt tilsynsvarsel skal kunne
ha egen status og dato uten å endre den offisielle rapporteringsplikten.

#### Første funksjonelle omfang

- [ ] Lage `SupervisionAdapter` med mockkatalog og kildebelagte temaer.
- [ ] Matche mulige tilsynstemaer på organisasjonsform, næringskode,
  arbeidsgiveransvar, geografi og eventuelle tillatelser når slike data finnes.
- [ ] Vise hvorfor et tema ble foreslått: «treff på næringskode», «virksomheten
  har ansatte» eller «mangler opplysning – må avklares».
- [ ] Lage en egen arbeidsflate **Tilsyn** med kortene:
  - mulig relevante tilsynstemaer
  - hva virksomheten bør ha oversikt over
  - tilknyttede rapporteringsplikter
  - autoritative kilder og veiledere
  - «Hva vet vi ikke?»
- [ ] La brukeren registrere et mottatt tilsynsvarsel manuelt med etat, tema,
  dato/frister og kilde. Det skal være merket som brukerregistrert til det er
  verifisert.
- [ ] La losen forklare et tilsynstema med virksomhetsprofilen som kontekst,
  men kreve kilde for faktapåstander og merke antakelser.
- [ ] Lage én helhetlig mock-reise som kan vises i demo.

#### Kilde- og datakildeavgrensning

Det finnes ikke nødvendigvis én felles, maskinlesbar nasjonal kalender over
alle virksomhetsspesifikke tilsyn. Første versjon bør derfor bruke en
vedlikeholdbar katalog med offisielle kilder og tydelig dekning:

- Arbeidstilsynet: tilsynsformer, tema, dokumentasjon og oppfølging.
- DSB: tilsynsområder, risikobasert prioritering og reaksjoner.
- Mattilsynet: mattrygghet og virksomhetsrelevante veiledere når en egnet
  offentlig kilde er avklart.
- Senere kan flere etater kobles på med samme adapterkontrakt.

Det finnes også to særlig interessante datakilder:

- **Tilda deling av tilsynsdata** er et sentralt API utgitt av
  Brønnøysundregistrene. Katalogbeskrivelsen sier at det inneholder
  tilsynsinformasjon fra norske tilsynsmyndigheter, men at tjenesten i
  utgangspunktet bare er tilgjengelig for tilsynsmyndigheter. Dette er derfor
  en mulig partnerskaps-/tilgangsleveranse, ikke en direkte offentlig
  avhengighet for v3.0.
- **Felles tilsynsdatabase (FTD)** er omtalt i DSBs tilsynsveiledning som en
  database med planlagte og gjennomførte tilsyn, tidspunkt, tema, reaksjoner og
  rapporter. Vi må avklare med BR/etatsmiljøet om den fortsatt er operativ,
  hvilket API som gjelder og hvem som kan få tilgang.

For en åpen og realistisk MVP er **Mattilsynets Smilefjestilsyn** den beste
første kandidaten. Datasettet kan kobles til virksomhetens organisasjonsnummer
og inneholder dato, tilsynstype, status, samlet karakter, temaer og
kravpunkter. Det distribueres som åpne CSV/JSON/XML-formater og er derfor
egnet for selektiv import og mock/live-adapter. Det viser historiske
tilsynsresultater, ikke nødvendigvis kommende tilsyn.

DSBs FAST inneholder på sin side informasjon om farlige stoffer og om DSB har
gjennomført tilsyn, men krever innlogging og tildelt tilgang. Det bør derfor
ikke brukes som en åpen v3.0-kilde.

Vi skal ikke presentere offentlig planside, statistikk eller en veileder som
et individuelt tilsynsvarsel. Kildene skal vises som veiledning med kilde,
retrieved-at og dekningsforbehold.

### P1 – Datagjenbruk i oppgavedetaljer

Dette er den mest konkrete koblingen mellom «hva må gjøres» og «hva kan ORaKeL
hjelpe med».

- [ ] Utvide oppgavemodellen med strukturerte `requiredFields`.
- [ ] Lage `DataAvailability` per felt: `CAN_FETCH`, `CAN_CONFIRM`,
  `MANUAL_ONLY` og `UNKNOWN`.
- [ ] Vise feltnavn, mulig kilde, samtykke og status uten å late som et felt er
  hentet når det bare er sannsynlig tilgjengelig.
- [ ] Starte med åpne virksomhetsdata og mockkilder. A-ordningen,
  Skatteetaten og andre beskyttede kilder skal beskrives som fremtidige
  integrasjoner med mindre en legitim tilgangsmekanisme er avklart.
- [ ] La brukeren samtykke per felt eller samlet for en tydelig gruppe felt.
- [ ] Logge kilde, samtykke og tidspunkt; aldri sende flere virksomhetsdata til
  losen enn det spørsmålet eller oppgaven trenger.

#### Simulering av lokale datakilder

Ja, dette bør være en del av v3.0-demoen. Det gir en troverdig illustrasjon av
muligheten uten at vi trenger integrasjon med hvert enkelt lønns- eller
regnskapssystem.

- [ ] Lage en `LocalDataAdapter` med kildetyper som «Lønnssystem – eksport»,
  «Regnskapssystem – eksport» og «HMS-system – eksport».
- [ ] Støtte et lite, dokumentert CSV-format først. CSV kan allerede behandles
  strømmebasert; XLSX kan eventuelt legges til senere.
- [ ] Ha en knapp «Simuler datafangst» som laster et forhåndsdefinert
  virksomhetseksempel uten filvalg.
- [ ] I tillegg kunne brukeren laste opp en CSV-mal basert på eget uttrekk.
- [ ] Vise en feltmatrise med verdi, kilde, periode, tidspunkt og status:
  «kan hentes», «kan bekreftes» eller «må oppgis manuelt».
- [ ] Merke lokale uttrekk som brukerleverte data, selv om UI-et viser et
  systemnavn. De skal aldri få `OFFICIAL`-status bare fordi de ser strukturerte
  ut.
- [ ] Kreve eksplisitt samtykke før verdiene brukes i en oppgave eller sendes
  til losen.

Demoen kan dermed vise «9 av 14 felter kan fylles ut» uten å late som om
ORaKeL faktisk har tilgang til virksomhetens lønns- eller regnskapssystem.

Dette kan demonstreres uten å hente beskyttede data: ORaKeL viser hva som kan
gjenbrukes, hva som faktisk er tilgjengelig og hva som mangler av tilgang.

### P1 – Regnskapsdata

Regnskapsadapteren er allerede utsatt til v3.0 i v2-backloggen. Den bør være
et avgrenset tillegg, ikke blokkere Tilsyn/Begreper.

- [ ] Velge ett demoscenario og 5–8 nøkkeltall som faktisk hjelper med
  virksomhetsforståelse eller rapporteringsutvalg.
- [ ] Slå opp selektivt på organisasjonsnummer og regnskapsår via DuckDB/Parquet
  eller et egnet åpent API.
- [ ] Vise kilde, regnskapsår, definisjon og at tallene er historiske.
- [ ] Ikke laste store filer i nettleser, API-respons eller KI-kontekst.
- [ ] Koble regnskapstall til regler bare som et forslag med begrunnelse, ikke
  som juridisk konklusjon.

## Foreslått domenemodell

```ts
type Concept = {
  id: string;
  term: string;
  definition: string;
  publisher?: string;
  validFrom?: string;
  validTo?: string;
  relatedTerms: string[];
  source: Source;
  trustLevel: "OFFICIAL" | "OFFICIAL_GUIDANCE" | "AI_SUGGESTION";
};

type SupervisionTheme = {
  id: string;
  title: string;
  agency: string;
  description: string;
  targetCriteria: TargetCriteria;
  topics: string[];
  preparationItems: PreparationItem[];
  relatedObligationIds: string[];
  sources: Source[];
  confidence: number;
};

type SupervisionNotice = {
  id: string;
  organizationNumber: string;
  agency: string;
  title: string;
  noticeType: "ANNOUNCED" | "UNANNOUNCED" | "DOCUMENT_REVIEW" | "UNKNOWN";
  receivedAt?: string;
  eventDate?: string;
  responseDeadline?: string;
  source: Source;
  trustLevel: "OFFICIAL" | "USER_REPORTED" | "UNDER_REVIEW";
};

type DataAvailability = {
  field: string;
  source?: Source;
  state: "CAN_FETCH" | "CAN_CONFIRM" | "MANUAL_ONLY" | "UNKNOWN";
  requiresConsent: boolean;
  reason?: string;
};
```

`SupervisionTheme` og `SupervisionNotice` skal ikke arve fra `Obligation`.
Forberedelsespunkt kan lenke til en oppgave, men blir ikke automatisk en
offisiell oppgave. Dette bevarer skillet mellom fakta, brukerinnspill og KI-
forslag.

## Foreslått brukerreise

1. Brukeren velger virksomhet.
2. Topplinjen viser hvilken virksomhetsprofil som brukes, og losen får bare
   relevante, kildebelagte virksomhetsdata.
3. Brukeren åpner **Tilsyn** eller klikker et faguttrykk i oppgavedetaljene.
4. ORaKeL viser treff, kilde, hvorfor treffet er relevant og hva som ikke er
   kjent.
5. Brukeren kan åpne tilknyttede rapporteringsoppgaver og se hvilke felt som
   kan gjenbrukes.
6. Brukeren kan registrere et mottatt varsel eller stille losen et spørsmål.
7. Alle svar og forslag viser kilde, tillitsnivå og usikkerhet.

## API- og modulskisse

Følgende kontrakter bør ligge bak adaptere slik at live- og mockdata kan
byttes uten frontend-omskriving:

- `ConceptAdapter.search(query, filters)`
- `ConceptAdapter.getById(id)`
- `ConceptAdapter.getByUri(uri)`
- `SupervisionAdapter.findRelevant(organization)`
- `SupervisionAdapter.getTheme(id)`
- `SupervisionAdapter.createUserNotice(input)`
- `DataReuseAdapter.inspectRequiredFields(obligation, organization)`

Mulige serverruter:

- `GET /api/concepts/search?q=...`
- `GET /api/concepts/:id`
- `GET /api/organizations/:orgNumber/supervision`
- `POST /api/organizations/:orgNumber/supervision/notices`
- `GET /api/obligations/:id/data-availability`

Liveintegrasjoner skal gå via serveren. Nettleseren skal ikke kalle eksterne
datakataloger direkte dersom det gjør rate limiting, kildekontroll eller
feilhåndtering vanskeligere.

## Parallell arbeidsdeling

Agenter kan jobbe parallelt etter at de delte domenekontraktene er avklart.
Ingen agent skal eie både domenekontrakter og hele frontendflyten.

| Spor | Leveranse | Primære områder |
| --- | --- | --- |
| V3-DOMAIN | `Concept`, `SupervisionTheme`, `SupervisionNotice`, datatilgjengelighet | `src/domain/**` |
| V3-FDK | FDK søke- og ressursadapter, mockdata, rate-limit/timeout-tester | `src/data/**`, `server/**` |
| V3-TILSYN | Tilsynskatalog, matching, offisielle mockkilder og avgrensning | `src/data/**`, `docs/AUTHORIZED_SOURCES.md` |
| V3-UI-CONCEPT | Begrepsflate og kontekstuell definisjon i oppgavedetaljer | `src/App.tsx`, `src/styles.css` |
| V3-UI-TILSYN | Tilsynsflate, forklaringer og brukerregistrert varsel | `src/App.tsx`, `src/styles.css` |
| V3-REUSE | Feltkart, samtykkeflyt og kildevisning | `src/domain/**`, `server/**`, frontend |
| V3-DATA | Avgrenset regnskapsadapter og DuckDB-spørringer | `server/**`, `scripts/**`, `docs/DATASET.md` |
| V3-QA | kontraktstester, tilgjengelighet, tillitsnivå og demo-smoke | `tests/**`, QA-notat |

Hovedagenten integrerer domenekontrakten først. Deretter kan FDK- og
tilsynsadapterene utvikles parallelt med hver sin mock. Frontend-agentene skal
bruke mockadapterne og ikke vente på eksterne API-er.

## V3.0-akseptansekriterier

- En bruker kan søke opp og åpne et begrep fra en rapporteringsoppgave.
- Begrepet viser norsk term, definisjon, kilde, tillitsnivå og eventuelle
  relasjoner.
- En virksomhet får en liste over mulige tilsynstemaer med forklaring på
  matchen og tydelig dekningsforbehold.
- Et generelt tilsynstema kan ikke utgi seg for å være et virksomhetsspesifikt
  tilsynsvarsel.
- En bruker kan registrere et mottatt varsel som uoffisielt eller under
  gjennomgang.
- Minst ett tilsynsscenario kan demonstreres med mockdata uten API-nøkler.
- Oppgavedetaljer viser minst ett eksempel på felt som kan hentes, bekreftes
  eller må oppgis manuelt.
- Losen får valgt virksomhetsprofil og valgt begrep/tilsynstema som strukturert
  kontekst, med kilder og usikkerhet i svaret.
- Offisielle opplysninger, brukerinput og KI-forslag vises separat i UI,
  domenemodell og API-respons.
- Livekilder kan feile uten at demoen mister mockflyten.
- `npm run typecheck`, `npm test` og `npm run build` passerer.

## Ikke i v3.0-kjernen

- full saksbehandlerportal og etatsvis moderering
- full prosess-støtte for kompliserte rapporteringer
- juridisk automatisk konklusjon
- automatisk opprettelse av offisiell oppgaveplikt
- innlogging mot beskyttede etatskilder uten avklart hjemmel og samtykke
- full nasjonal tilsynskalender med lovnad om komplett dekning
- digitale lommebokbevis som nødvendig del av brukerreisen
- produksjonsklar autentisering og flerorganisasjonstilgang

## Kilder og premisser

- [Felles datakatalog – Ressurtjeneste API](https://data.norge.no/nb/technical/api/resource-service)
  beskriver åpne oppslag av begreper, datasett, tjenester og hendelser ved ID
  eller URI.
- [Felles datakatalog – Søk API](https://data.norge.no/nb/technical/api/search)
  beskriver søk, ressursfilter, paginering og rate limits. Dokumentasjonen
  advarer samtidig om at søketjenesten kan endres.
- [Begrepskatalog i Felles datakatalog](https://data.norge.no/nb/datasets/067833e4-890f-32fd-b408-ab33ef0c7943/begrepskatalog-i-felles-datakatalog)
  beskriver anbefalt term, definisjon, kilde og mulige tilleggsfelter.
- [Arbeidstilsynet – Tilsyn](https://www.arbeidstilsynet.no/om-oss/tilsyn/)
  beskriver meldte, uanmeldte og dokumentbaserte tilsyn samt rapport og
  oppfølging.
- [DSB – Tilsyn](https://www.dsb.no/tilsyn/)
  beskriver tilsynsområder, risikobasert prioritering og reaksjonsmidler.
- [Tilda – deling av tilsynsdata](https://data.norge.no/nb/data-services/926687bd-b7f4-3da2-8c57-568071edfee4/tilda-deling-av-tilsynsdata-api)
  dokumenterer det sentrale tilsynsdata-API-et og tilgangsbegrensningen.
- [Mattilsynet – Smilefjestilsyn](https://data.norge.no/nb/datasets/288aa74c-e3d3-492e-9ede-e71503b3bfd9/smilefjestilsyn-pa-serveringssteder)
  beskriver åpne tilsynsresultater, organisasjonsnummerkobling og
  distribusjonsformat.
- [DSB – FAST](https://www.dsb.no/farlige-stoffer/farlige-stoffer/informasjon-og-verktoy/fast---anlegg-og-kart/)
  viser et relevant, men tilgangsbegrenset register.
- [Altinn-dokumentasjon for Tilda](https://altinn.github.io/docs/utviklingsguider/data.altinn.no/tjenester/tilsynsdata/)
  inneholder eldre teknisk dokumentasjon og lenker til eksempler på
  tilsynskoordineringer og tilsynsrapporter. Status må verifiseres før
  implementering.

Kildene støtter at ORaKeL kan forklare og strukturere informasjon. De støtter
ikke at ORaKeL kan forutsi et konkret tilsyn for en virksomhet uten en
virksomhetsspesifikk melding eller en uttrykkelig, maskinlesbar kilde.
