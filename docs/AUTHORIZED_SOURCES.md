# Autoriserte kilder

ORaKeL har en eksplisitt kildepolicy i
`src/data/authorized-sources.ts`. Den første allowlisten er bevisst
restriktiv og inneholder statlige/officiale norske domener som er relevante for
rapportering:

- `brreg.no` – autoritativ register- og Oppgaveregister-kilde
- `lovdata.no`, `stortinget.no`, `regjeringen.no` – autoritative lov- og
  forvaltningskilder
- `skatteetaten.no`, `nav.no`, `ssb.no`, `digdir.no`, `altinn.no`,
  `arbeidstilsynet.no`, `mattilsynet.no` – offisiell veiledning

Subdomener er tillatt. Lookalike-domener, `http`-lenker og øvrige domener blir
klassifisert som `UNVERIFIED`. De skal aldri omtales som autoritative.

## Dagens avgrensning

Klassifiseringen og kildevisningen er implementert. Online retrieval er ennå
ikke automatisk koblet til hvert losspørsmål. Neste steg er å hente relevante
sider med en timeout og innholdsgrense, kun etter at URL-en er godkjent av
allowlisten, og sende bare relevant utdrag videre til modellen.

OpenAI Responses API har web search med `allowed_domains`. Det kan vurderes som
en senere retrieval-provider, men kildepolicyen skal fortsatt ligge i ORaKeL
slik at providerens egne treff ikke alene bestemmer hva som er autoritativt.

Kildekatalogen kan senere flyttes til en saksbehandlerforvaltet datakilde uten
at promptlogikken må endres.
