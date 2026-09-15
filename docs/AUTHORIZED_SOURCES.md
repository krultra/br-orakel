# Autoriserte kilder for ORaKeL

Dette er første, restriktive kildepolicy for demo og versjon 2.0. Den er en
produktbeslutning, ikke en juridisk godkjenning av innholdet på hver enkelt
side. Den sier hvilke domener losen kan behandle som autoritative når den
forklarer offentlig rapportering.

## Kildeklasser

| Klasse | Betydning | Tillatt formulering |
| --- | --- | --- |
| `AUTHORITATIVE` | Register, lov- eller forskriftskilde fra godkjent domene | «Kilden opplyser …» |
| `OFFICIAL_GUIDANCE` | Offentlig etats veiledning eller tjenesteside | «Veiledningen sier …» |
| `DISCOVERY` | Ikke godkjent for sluttkonklusjoner, men kan hjelpe med å finne spor | «Dette kan være relevant, men må kontrolleres …» |
| `UNVERIFIED` | Ikke tillatt som kunnskapsgrunnlag i los-svar | Skal ikke brukes som faktakilde |

## Første allowlist

| Domene | Klasse | Typisk bruk |
| --- | --- | --- |
| `brreg.no`, `data.brreg.no` | `AUTHORITATIVE` / `OFFICIAL_GUIDANCE` | Enhetsregisteret, Oppgaveregisteret, Regnskapsregisteret |
| `skatteetaten.no` | `AUTHORITATIVE` / `OFFICIAL_GUIDANCE` | Skatt, mva, a-melding og arbeidsgiverrapportering |
| `nav.no` | `OFFICIAL_GUIDANCE` | Inntektsmelding, Aa-registeret og arbeidsgiveroppfølging |
| `ssb.no` | `OFFICIAL_GUIDANCE` | Statistiske oppgaver og rapportering |
| `lovdata.no` | `AUTHORITATIVE` | Lover, forskrifter og rettskilder som er tilgjengelige der |
| `stortinget.no` | `AUTHORITATIVE` | Lov- og dokumentforarbeid når relevant |
| `regjeringen.no` | `OFFICIAL_GUIDANCE` | Regjeringens veiledning, høringer og regelverksinformasjon |
| `digdir.no`, `data.norge.no` | `OFFICIAL_GUIDANCE` | Felles datakatalog, datadeling og offentlig digitalisering |
| `altinn.no`, `info.altinn.no` | `OFFICIAL_GUIDANCE` | Skjema, roller, tjenester og veiledning for virksomheter |

Andre etatsdomener kan legges til senere etter samme vurdering. Det bør være
bedre å ha en kort, forklarbar liste enn å late som om hele internett er like
pålitelig.

## Teknisk policy

- Kildeallowlisten skal ligge i en vedlikeholdbar katalog, ikke hardkodes i
  prompten.
- URL-er skal valideres mot domenet og HTTPS før de sendes til modellen.
- Redirect til et annet domene skal klassifiseres på nytt.
- Losen skal få kilde-ID, tittel, URL, klasse og relevant utdrag.
- Svar skal ikke oppgi en kilde-ID som ikke finnes i konteksten.
- Ikke hent og lagre hele veiledningstjenester lokalt som standard.
- Lagre kun metadata, utdrag brukt i et svar og tidspunkt for oppslaget når det
  er nødvendig for historikk og etterprøvbarhet.
- Manglende eller utilgjengelig kilde skal gi synlig usikkerhet, ikke et
  oppdiktet svar.

## Kilder brukt ved etablering

- [Brønnøysundregistrene – Oppgaveregisteret](https://www.brreg.no/offentlig-sektor/rapporteringsplikt/oppgaveregisteret/)
- [Brønnøysundregistrene – mer om Oppgaveregisteret](https://www.brreg.no/offentlig-sektor/rapporteringsplikt/oppgaveregisteret/mer-om-oppgaveregisteret/)
- [Oppgaveregisteret – API-beskrivelse](https://data.brreg.no/oppgaveregisteret/api/docs/index.html)
- [NAV – rapporter som arbeidsgiver](https://www.nav.no/arbeidsgiver/rapporter)
- [Altinn – dine rapporteringsplikter](https://info.altinn.no/starte-og-drive/starte/for-oppstart/dine-rapporteringsplikter)
- [Digdir – Felles datakatalog](https://www.digdir.no/felleslosninger/felles-datakatalog/790)

Listen skal revideres når Marit/BR har avklart hvilke etater og kildetyper som
skal regnes som godkjent i hackathon-demoen.

