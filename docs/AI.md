# KI-integrasjon

## Arkitektur

Chatflyten bruker den provider-uavhengige kontrakten `ChatAdapter` i
`src/domain/adapters.ts`. Den konkrete implementasjonen
`OpenAIChatAdapter` ligger i `src/data/openai-chat-adapter.ts`. Det gjør at vi
kan bytte modellleverandør senere uten å endre frontend, domenemodell eller
API-kontrakten for svaret.

I hver forespørsel får adapteren et eksplisitt evidenssett:

- valgt virksomhet
- virksomhetens rapporteringsoppgaver
- godkjente kilder
- brukerinnspill som fortsatt er uoffisielle
- `additionalContext`, som er et utvidelsespunkt for framtidig retrieval

OpenAI-modellen får dette som kontekst i samme forespørsel. Den får ikke skrive
til `Obligation`, bekrefte brukerinnspill eller gjøre juridiske konklusjoner.
Svaret er strukturert med `answer`, `uncertainty`, `sourceIds` og
`followUpQuestions`. Serveren filtrerer `sourceIds` mot kildene som faktisk ble
sendt inn.

## Lokal konfigurasjon

Mockmodus er standard og krever ingen API-nøkkel:

```dotenv
AI_PROVIDER=mock
```

For hosted AI:

```dotenv
AI_PROVIDER=openai
OPENAI_API_KEY=sett-denne-kun-i-lokalt-miljo-eller-deploy-secret
OPENAI_MODEL=gpt-5.6-luna
OPENAI_MAX_OUTPUT_TOKENS=12000
OPENAI_MAX_CONTEXT_CHARS=1000000
OPENAI_TIMEOUT_MS=60000
OPENAI_STORE_RESPONSES=false
```

API-nøkkelen skal aldri legges i `.env.example`, Git, Docker-image eller
frontend. På pi-tok legges den i deploymiljøet eller en separat, uversjonert
env-fil med begrensede filrettigheter.

### Aktivere AI på pi-tok

Den deployerte standarden er mockmodus. Fra repoets rot kan hosted OpenAI
aktiveres uten at nøkkelen legges i Git eller sendes som argument på
kommandolinjen:

```bash
./scripts/enable-ai-pi-tok.sh
```

Skriptet spør etter nøkkelen uten å vise den, oppretter
`/home/tkruke/services/br-orakel/.env` på pi-tok med filrettighet `600`, og
bygger/starter både demo- og test-stackene på nytt. Det avbryter hvis env-filen
allerede finnes, slik at eksisterende runtime-konfigurasjon ikke overskrives
automatisk. Nøkkelen kan også gis via `OPENAI_API_KEY`-miljøvariabelen i
terminalen. Ikke legg den i en shell-historikk, commit eller chatmelding.

Etterpå skal begge helsesjekkene vise `aiProvider: "openai"`:

```bash
ssh pi-tok 'curl --fail --silent http://127.0.0.1:3010/api/health'
ssh pi-tok 'curl --fail --silent http://127.0.0.1:3020/api/health'
```

Hosted OpenAI-kall skjer fra Fastify-serveren. API-nøkkelen skal derfor aldri
eksponeres i React-bundlen eller sendes direkte fra nettleseren. Dette følger
OpenAI sin anbefaling om å laste API-nøkler fra miljøvariabel eller
nøkkelhåndtering på serveren.

`OPENAI_MAX_OUTPUT_TOKENS=12000` er med vilje romslig nok til at en demo ikke
blir kunstig kort. `OPENAI_MAX_CONTEXT_CHARS` er en sikkerhetsgrense for én
forespørsel, ikke en anbefaling om å sende et helt stort datasett til modellen.
Når datamengden vokser, skal retrieval velge relevante deler før adapteren
kalles. Dersom grensen overskrides nå, feiler adapteren tydelig i stedet for å
kaste bort eller kutte evidens stille.

## Hva betyr `store`?

`store` er et felt i OpenAI Responses API. Det handler om hvorvidt selve
modellresponsen skal lagres hos OpenAI for senere oppslag via API-et. Det er
ikke vår egen database, og det er ikke modellens permanente fagminne.

I br-orakel er `OPENAI_STORE_RESPONSES=false` standard. Vi sender fortsatt hele
det valgte evidenssettet i den aktuelle forespørselen; `store=false` hindrer
bare at responsen brukes som en lagret Responses-ressurs for senere API-oppslag.
Det er derfor ikke det samme som å sende mindre kontekst.

Virksomhetsdata, regelverk, veiledere og brukerinnspill skal i stedet lagres og
forvaltes av br-orakel på en måte som kan revideres. En framtidig
`KnowledgeContextAdapter` kan hente relevante poster fra DuckDB/Parquet,
fulltekstsøk eller en vektorindeks og legge dem i `additionalContext`. Hver
post må beholde ID, tillitsnivå og eventuell kilde-ID. Da kan samme evidens
vises til brukeren og sendes til KI-en uten at KI-en blir system of record.

Hvis vi senere trenger samtalekontinuitet, må vi ta stilling til lagring av
samtaler eller bruk av response-/conversation-ID-er særskilt. Det skal ikke
innføres automatisk som del av denne MVP-en.

## Providerbytte

En annen leverandør kan implementere `ChatAdapter` med samme `ChatContext` og
`ChatAnswer`. Provider-spesifikke felter skal holdes i adapteren. Kildekrav,
usikkerhet, tillitsnivåer og avgrensningen mot juridiske konklusjoner hører
hjemme i br-orakel-kontrakten og skal gjelde uansett modell.

## Kilder

- [GPT-5.6 Luna – OpenAI Models](https://developers.openai.com/api/docs/models/gpt-5.6-luna)
- [Responses API – create response](https://developers.openai.com/api/reference/cli/resources/responses/methods/create)
- [Responses API – TypeScript-eksempel](https://developers.openai.com/api/reference/typescript/resources/beta/subresources/responses/methods/create)
