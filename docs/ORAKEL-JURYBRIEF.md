# ORaKeL Enklere rapportering for norske virksomheter

## Kort fortalt

ORaKeL er en KI-assistert rapporteringsnavigator for virksomheter som vil bruke mindre tid på å finne ut hva de skal rapportere, når det skal gjøres og hvor de finner riktig veiledning. Løsningen samler virksomhetsdata, rapporteringsplikter, frister, offentlig støtte og kunnskapskilder i én oversikt - med tydelig skille mellom offisiell informasjon, brukerinput og KI-forslag.

## Hva vi har laget

- **Virksomhetsprofil:** Søk på navn eller organisasjonsnummer, velg virksomhet og se relevante registeropplysninger som organisasjonsform, næringskoder, ansatte og registreringer.
- **Årshjul og arbeidsliste:** Se rapporteringsplikter i et rullerende årshjul eller som liste. Brukeren kan aktivere oppgaver, følge frister, håndtere gjentakelser, sette enkel status, legge til kommentarer og dempe eller skjule det som ikke er relevant.
- **Hendelsesnavigator:** Velg en hendelse, for eksempel ny arbeidstaker eller endret omsetning, og få en virksomhetstilpasset veiledning med relevante oppgaver, neste steg og kilder.
- **Losen:** Still spørsmål på vanlig norsk. Losen bruker virksomhetens tilgjengelige opplysninger og relevante kilder, viser kildegrunnlag og usikkerhet, og lar brukeren finne igjen tidligere svar. Svarene er veiledende og erstatter ikke juridisk vurdering.
- **Begrepshjelp:** Marker et faguttrykk eller klikk på et tilrettelagt begrep for å hente forklaring fra Felles datakatalog og andre godkjente kilder.
- **Støtte og oppfølging:** Se registrerte støttetildelinger knyttet til virksomheten. En tidligere tildeling kan brukes som signal til å opprette en lokal oppgave om å undersøke eller søke støtte på nytt.
- **Brukerbidrag:** Meld inn en mulig manglende rapporteringsplikt, gi tilbakemelding eller samtykk til at et anonymisert los-svar kan foreslås til en moderert FAQ. Slike innspill blir aldri automatisk offisielle.

## Verdien i datakombinasjonen

ORaKeL gjør det mulig å gå fra enkeltstående registeroppslag til en samlet arbeidsflate. Virksomhetens organisasjonsform, næringskoder og arbeidsgiverforhold brukes som grunnlag for å finne relevante oppgaver i Oppgaveregisteret. Frister og rapporteringsformer kan deretter vises sammen med oppgaver virksomheten selv velger å følge opp. Støtteregisteret gir et ekstra bilde av virksomhetens situasjon, mens losen gjør informasjonen søkbar og forståelig på tvers av kildene.

## Datakilder

**Brukes i demoen**

- Brønnøysundregistrenes Enhetsregisteret - åpne virksomhetsdata og navnesøk.
- Brønnøysundregistrenes Oppgaveregisteret - relevante rapporteringsoppgaver, målgrupper, frister, etat, rapporteringsform, tidsbruk, datakrav og kilder.
- Støtteregisteret - hackathon-datasett analysert lokalt med DuckDB. Demoen har også tydelig merket mockdata for Fjordgløtt Mat og Handel AS.
- Felles datakatalog - begrepsoppslag med mock-fallback slik at demoen fungerer uten eksterne nøkler.
- Godkjente offentlige kilder for losen, blant annet brreg.no, skatteetaten.no, nav.no, ssb.no, lovdata.no, stortinget.no, regjeringen.no og digdir.no.

**Aktuelle utvidelser**

- Virksomhetens egne uttrekk fra lønn, regnskap eller administrasjonssystemer som CSV, JSON eller regneark. Slike opplysninger skal merkes som brukerleverte og holdes adskilt fra registerdata.
- Regnskapsdata og historiske innrapporteringer for mer presis veiledning og gjenbruk av data.
- Tilsynsdata fra relevante aktører, for eksempel DSB og Mattilsynet/Smilefjes, samt mulig integrasjon mot Tilda der tilgang og rollemodell tillater det.
- Flere autoritative begreps- og veiledningskilder etter hvert som kildegrunnlaget kvalitetssikres.

## Slik tester juryen demoen

Åpne **https://demo.krultra.no** og velg **Opprett ny virksomhetsbruker**. Lag et valgfritt brukernavn, visningsnavn og et enkelt demo-passord. I topplinjen velger dere virksomhet ved å søke på navn eller organisasjonsnummer. For en komplett og forutsigbar demo kan dere søke etter **Fjordgløtt Mat og Handel AS** eller skrive **999999999**.

Utforsk deretter årshjulet og arbeidslisten, åpne en oppgave og se frist, status, nødvendige data og kilder. Prøv gjerne Hendelser, Tilsyn og Støtte. I Støtte kan dere se registrerte tildelinger og lage en lokal oppfølging. Åpne Losen, still et spørsmål om virksomheten og kontroller kildehenvisningene og usikkerheten i svaret. Svarhistorikken ligger tilgjengelig for brukeren.

Demoen er laget for å vise retning og verdi, ikke som en juridisk beslutningstjeneste eller et ferdig produksjonssystem. Registerdata, brukerinnspill og KI-forslag er derfor synlig merket og holdes adskilt.
