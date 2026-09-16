# br-orakel – ORaKeL

MVP for ORaKeL – en KI-assistert rapporteringslos for norske virksomheter. GitHub-repoet heter `br-orakel`; betydningen av «ORaKeL» avklares senere av teamet. Første leveranse er en selvstendig demo med live BRREG-data, mockutvidelser og adaptergrenser for Oppgaveregisteret, Enhetsregisteret, kilder, KI og brukerinnspill.

## Valgt teknologi

- TypeScript + React + Vite for en rask, tilgjengelig frontend.
- `@digdir/designsystemet-react` med `@digdir/designsystemet-css` og CSS-pakkens standardtema for komponenter, tokens og universell utforming.
- Fastify som lett API-lag. Frontend bruker `/api` og samme kontrakter i mockmodus og ved senere ekte integrasjoner.
- DuckDB som førstevalg for lokale analyser av store JSON/CSV-filer. Importøren bruker DuckDB sine filscannere og skriver Parquet.
- Docker Compose for lokal kjøring og en midlertidig, isolert hackathon-stack på `pi-tok`.

Designsystemet-integrasjonen følger den aktuelle React-pakken fra Digdir: `@digdir/designsystemet-react` er dagens pakke, mens `@digdir/design-system-react` er legacy. CSS og standardtema importeres én gang i `src/main.tsx`; egendefinert tema kan senere bygges med Theme Builder. Se [Designsystemet](https://designsystemet.no/no/) og [React-pakken](https://www.npmjs.com/package/@digdir/designsystemet-react).

Oppgaveregisteret behandles som en offisiell, men pilotpreget registerkilde. API-dokumentasjonen viser støtte for JSON/XML, paginering og filtrering på blant annet organisasjonsform, næringskode, arbeidsgiver, etat, lovhjemmel, vedleggskrav og rapporteringsform: <https://data.brreg.no/oppgaveregisteret/api/docs/index.html>.

Oppgaveregisteret-adapteren er implementert og kan aktiveres med
`OPPGAVEREGISTERET_MODE=live`. Enhetsregisteret-adapteren kan aktiveres med
`ENHETSREGISTERET_MODE=live`, slik at organisasjonsnummeret slås opp hos BRREG
før oppgavene filtreres. Live-modus er anbefalt for MVP-arbeid; mockmodus kan
aktiveres eksplisitt for demo og CI. Se
[dokumentasjonen for Oppgaveregisteret](docs/OPPGAVEREGISTERET.md) og
[Enhetsregisteret-integrasjonen](docs/ENHETSREGISTERET.md).

Hackathonets lokale Parquet-uttrekk kan brukes som alternativ virksomhetskilde
med `ENHETSREGISTERET_MODE=dataset` og
`ENHETSREGISTERET_DATASET_PATH=./data/raw/dim_virksomhet.parquet`. Denne
modusen er nyttig for reproduserbar demo og navnesøk, men datasettet mangler
arbeidsgiverindikator. Se [datasetanalysen](docs/DATASET.md).

## Kom i gang

Krever Node.js 22+.

```bash
npm install
npm run dev
```

Åpne <http://localhost:5173>. Med live-modus kan du søke på virksomhetsnavn
eller organisasjonsnummer i BRREG. Mockvirksomheten er `999999999`. API-et
kjører på <http://localhost:3001>.

Ved oppstart kan en demo-bruker registreres selv. To saksbehandlerbrukere er
forhåndsopprettet i den lokale demo-instansen:

- `br-saksbehandler` / `demo`
- `br-kvalitet` / `demo`

Virksomhetsbrukere kan søke opp virksomheter og lagre dem i «Mine
virksomheter». Brukerdata lagres lokalt i `data/runtime/` og skal ikke legges i
Git. Innsendte rapporteringsforslag, saksbehandlervurderinger og
videresendinger lagres i den samme demo-storen. Ved flere serverprosesser må
de konfigureres med samme `DEMO_STORE_PATH` for å bruke en felles kø.

### Versjonering

ORaKeL viser versjon i toppnavigasjonen som `x.y.z`:

- `x` er hovedversjonen.
- `y` er demo-release/minorversjon.
- `z` er byggnummer/patchversjon.

Vanlige lokale utviklingsbygg bruker fortsatt `0.0.z`. Bygg som deployeres til
test eller demo får automatisk `3.0.z` (for eksempel `3.0.1`), med mindre
`ORAKEL_VERSION` settes eksplisitt. `scripts/deploy-pi-tok.sh` deployer bare til
`test.krultra.no` som standard. Demo krever eksplisitt
`BR_ORAKEL_DEPLOY_TARGET=demo`.

Oppgaver uten fast offisiell frist kan aktiveres fra oppgavedetaljene med en
lokal, gjentakende frist. Den lokale fristen er en brukerinnstilling og endrer
ikke opplysningene fra Oppgaveregisteret. Arbeidslisten viser bare oppgaver
brukeren aktivt har valgt. Kalenderen viser et rullerende vindu på tolv måneder,
og lokal frist, kommentar og skjuling kan lagres for en enkelt forekomst eller
for hele oppgaven.

## Samarbeid med flere agenter

Videre produktarbeid er samlet i [docs/BACKLOG.md](docs/BACKLOG.md), med
parallelle spor, avhengigheter og akseptansekriterier. Første versjon av
allowlisten for losens autoritative kilder ligger i
[docs/AUTHORIZED_SOURCES.md](docs/AUTHORIZED_SOURCES.md).
Begrepsassistenten og integrasjonen mot Felles datakatalog er beskrevet i
[docs/BEGREPSASSISTENT.md](docs/BEGREPSASSISTENT.md).
Tilsynssporet er beskrevet i [docs/TILSYN.md](docs/TILSYN.md).

Les [AGENTS.md](AGENTS.md) før du arbeider i repoet. Den beskriver fil-eierskap, Codex-/Claude Code-handoff, testkrav og regler for parallelt arbeid. [CONTRIBUTING.md](CONTRIBUTING.md) beskriver utviklerflyten, mens [docs/AGENT_WORKFLOW.md](docs/AGENT_WORKFLOW.md) beskriver Git worktrees, branches, PR-er og overtakelse mellom agenter.

Opprett en isolert arbeidskopi slik:

```bash
./scripts/new-worktree.sh agent/frontend/calendar-list ../worktrees/calendar origin/main
cd ../worktrees/calendar
npm install
```

Claude Code kan overta som hovedagent ved å lese `AGENTS.md`, `CLAUDE.md` og `docs/AGENT_WORKFLOW.md`, kontrollere branch-status og fortsette på en eksisterende branch. Hovedagenten integrerer små commits via PR eller cherry-pick og kjører samlet verifikasjon før merge.

Kvalitetssjekker:

```bash
npm run typecheck
npm test
npm run build
```

## Demo-reise

1. Søk etter en virksomhet på navn eller organisasjonsnummer. Bruk `999999999` for mockvirksomheten.
2. Åpne en oppgave i årshjulet eller arbeidslisten.
3. Se status, tidsbruk, nødvendige data, lovhjemmel og kilde.
4. Spør KI-losen om mva, ansatte eller årsrapportering. Svarene viser kilde og usikkerhet.
5. Meld inn en mulig manglende plikt. Innspillet får tydelig status som uoffisielt.
6. Åpne «Saksbehandler» og endre status på innspillet.

## Adapterarkitektur

`src/domain/adapters.ts` definerer fem utskiftbare kontrakter. Mockadapterne er
tilgjengelige som reproduserbar fallback, mens `EnhetsregisteretAdapter` og
`OppgaveregisteretAdapter` brukes i live-modus. Senere kan disse utvides med:

- `EnhetsregisteretAdapter`: oppslag på organisasjonsnummer eller batchimport av arrangørens JSON/CSV.
- `OfficialSourceAdapter`: godkjent allowlist for Altinn, BR, Skatteetaten, Lovdata, Doffin og andre avtalte kilder.
- `OpenAIChatAdapter`: hosted AI bak Fastify med strukturert svar, kilde-ID-validering og eksplisitt usikkerhet.
- `RetrievalChatAdapter`: framtidig retrieval-løsning som velger relevante evidensbiter fra DuckDB/Parquet eller et kunnskapsindeks før en provider-adapter kalles.
- `RequirementReviewAdapter`: varig lagring, revisjonslogg og saksbehandlerkø.

KI-integrasjonen er dokumentert i [docs/AI.md](docs/AI.md). Mockmodus er
standard. Hosted OpenAI-modus aktiveres eksplisitt med `AI_PROVIDER=openai` og
en runtime-hemmelighet for `OPENAI_API_KEY`; demoens standardmodell er
`gpt-5.6-luna`. Kontekst sendes som et eksplisitt evidenssett, mens framtidig
retrieval kan fylle `additionalContext` uten å gjøre KI-tjenesten til system of
record.

Offisielle opplysninger, brukerinnspill og KI-forslag har ulike `TrustLevel`-verdier i domenemodellen. KI får ikke skrive til `Obligation` direkte.

## Store datasett

Se [data/README.md](data/README.md). Ikke legg et hackathon-datasett på rundt 35 GB i Git eller nettleseren. Bruk:

```bash
npm run import -- --input ./data/raw/datasett.json --output ./data/warehouse/datasett.duckdb --org-number 999999999
```

Importøren leser uten å samle hele datasettet i JavaScript-minnet, gjør et organisasjonsnummerfilter når feltet finnes, og skriver også Parquet for videre spørringer.

## Docker og pi-tok

Lokalt eller på `pi-tok`:

```bash
docker compose up --build
```

Løsningen lytter på port 3001. Legg en reverse proxy foran, for eksempel Caddy eller Nginx, med HTTPS og subdomenene `demo.krultra.no` og eventuelt `test.krultra.no`. DNS, brannmur, sertifikater og produksjonsmiljø skal settes opp eksplisitt; repoet endrer ikke DNS eller eksisterende produksjonsoppsett.

Produksjonsnotater:

- Reverse proxy terminerer HTTPS og videresender til `127.0.0.1:3001`.
- Sett `NODE_ENV=production`, `APP_MODE` og eventuelle API-URL-er i miljøet.
- Monter `data/` som persistent datamappe, ikke inn i image-laget.
- Begrens API-tilgang med nettverkspolicy og autentisering når ekte data kobles på.

For denne korte hackathonen anbefales pi-tok alene, med en isolert `br-orakel`-stack. Kjør eventuelt to containere: `demo.krultra.no` for stabil tag og `test.krultra.no` for arbeidsversjon. Pi-amk skal ikke klargjøres nå. Se [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), [Docker-veiledningen](docs/DOCKER.md) og [ADR-0001](docs/ADR/0001-runtime-and-deployment.md).

DNS-endringene er bare første del av deployen. Caddy må route `demo.krultra.no` til lokal port 3001 og `test.krultra.no` til lokal port 3002. Se [deploy/Caddyfile.br-orakel.example](deploy/Caddyfile.br-orakel.example). Selve Caddyfile på pi-tok skal ikke endres av agenter uten eksplisitt godkjenning.

## Repository og sikkerhetsgrense

Repoet skal opprettes som `br-orakel`. Første bootstrap mot GitHub gjøres av repo-eier:

```bash
git remote add origin git@github.com:krultra/br-orakel.git
git push -u origin main
```

Agenttilganger gjelder bare dette repoet og denne hackathonen. Andre prosjekter, andre GitHub-repositorier, pi-tok utenfor den isolerte stacken, pi-amk, krultra.no-produksjon, DNS, backup, secrets og private filer er off limits uten en ny, eksplisitt godkjenning. Se [AGENTS.md](AGENTS.md).

## Hvorfor Docker?

Docker er valgt som leveranseformat, ikke som et krav for daglig frontendutvikling. Lokalt kan dere kjøre `npm install` og `npm run dev` direkte på maskinen. Docker brukes når vi skal få nøyaktig samme Node-runtime, avhengigheter og startkommando på pi-tok.

Fordelene her er:

- samme bygg kan testes lokalt, i CI og på pi-tok
- demo- og testversjon kan kjøre isolert med egne porter og datamapper
- rollback kan gjøres ved å starte forrige image/tag
- pi-tok trenger ikke å få prosjektspesifikke Node- eller DuckDB-installasjoner på vertsmaskinen
- Claude Code, Codex og mennesker får en tydelig, maskinlesbar kjørekontrakt

Docker øker samtidig kompleksiteten litt. Vi må forstå images, containere, porter, volumes og reverse proxy. Derfor holder vi det enkelt: én Dockerfile, én Compose-fil og manuell deploy i hackathonfasen. Vi bruker ikke Kubernetes, Docker Swarm eller automatisk produksjonsdeploy.

Hvis du ikke vil bruke Docker lokalt, er dette den anbefalte arbeidsflyten:

```bash
npm install
npm run dev
```

Når vi skal verifisere deploypakken:

```bash
docker compose up --build
```

Docker er altså et isolasjons- og deployverktøy for denne MVP-en, ikke et nytt rammeverk dere må bruke i hver utviklingsrunde.

## Lisens

Repoet er offentlig tilgjengelig under [MIT-lisensen](LICENSE). Det tillater fri bruk, kopiering, endring, distribusjon og videreutvikling, inkludert kommersiell bruk, så lenge lisens- og copyrightteksten følger med.
