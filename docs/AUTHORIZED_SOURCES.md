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

Klassifisering, kildevisning og et begrenset online retrieval-steg er
implementert. Før hvert losspørsmål velges maksimalt et lite antall relevante
allowlistede kilder. Innhenting har timeout og byte-/tegngrense, og HTML
reduseres til tekst før utdraget sendes videre til modellen. Feil ved en kilde
gir fallback til eksisterende kildeutdrag.

OpenAI Responses API har web search med `allowed_domains`. Det kan vurderes som
en senere retrieval-provider, men kildepolicyen skal fortsatt ligge i ORaKeL
slik at providerens egne treff ikke alene bestemmer hva som er autoritativt.

Kildekatalogen kan senere flyttes til en saksbehandlerforvaltet datakilde uten
at promptlogikken må endres.
