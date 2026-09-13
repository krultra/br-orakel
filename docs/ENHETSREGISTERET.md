# Enhetsregisteret-integrasjon

Br-orakel kan slå opp virksomheten på organisasjonsnummer i Brønnøysundregistrenes
åpne Enhetsregisteret-API. Adapteren bruker:

```text
GET https://data.brreg.no/enhetsregisteret/api/enheter/{organisasjonsnummer}
```

Oppslaget normaliseres til den interne `Organization`-modellen. Følgende
felter brukes direkte i grunnlaget for Oppgaveregisteret:

- organisasjonsform (`organisasjonsform.kode`)
- næringskoder (`naeringskode1`–`naeringskode3` og hjelpeenhetskode)
- arbeidsgiverindikator (`antallAnsatte > 0`)
- organisasjonsnummer og navn

I tillegg beholdes nyttige virksomhetsopplysninger som antall ansatte,
registrering i MVA-/Foretaksregisteret, kommune, kommunenummer, overordnet
enhet og registreringsdato. Råresponsen lagres ikke i domenemodellen.

## Aktivere live-oppslag

Live-modus er anbefalt når nettverket er tilgjengelig. Mockmodus brukes for
reproduserbar demo og for ideer som ikke finnes i kildedataene ennå:

```bash
ENHETSREGISTERET_MODE=mock OPPGAVEREGISTERET_MODE=mock npm run dev
```

Kjør med ekte BRREG-data sammen med ekte Oppgaveregister-data:

```bash
ENHETSREGISTERET_MODE=live \
OPPGAVEREGISTERET_MODE=live \
AI_PROVIDER=openai \
OPENAI_API_KEY='sett-nøkkelen-i-shell-eller-runtime-secret' \
npm run dev
```

Du kan la KI være mock mens du verifiserer BRREG-integrasjonen:

```bash
ENHETSREGISTERET_MODE=live OPPGAVEREGISTERET_MODE=live npm run dev
```

Test for eksempel virksomheten i brukergrensesnittet med et organisasjonsnummer
eller et navn fra Enhetsregisteret. Mockvirksomheten kan velges med
`999999999`. API-et vårt rapporterer leverandørvalg via
`GET /api/health`.

## Feil og status

- `404` og `410` fra BRREG behandles som at virksomheten ikke finnes eller er fjernet.
- Andre HTTP-feil og tidsavbrudd blir `502 ENHETSREGISTERET_UNAVAILABLE` i vårt API.
- API-nøkkel er ikke nødvendig; dette er åpne data.
- Roller med fødselsnummer og andre autoriserte personopplysninger brukes ikke.

Oppslaget bygger på [offisiell dokumentasjon for Enhetsregisterets åpne data](https://data.brreg.no/enhetsregisteret/api/dokumentasjon/no/index.html).
Oppgaveregisterets filtrering er dokumentert [her](https://data.brreg.no/oppgaveregisteret/api/docs/index.html).
