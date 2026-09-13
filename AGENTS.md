# Agent instructions for br-orakel

Dette er den delte arbeidsavtalen for Codex, Claude Code og andre kodeagenter som arbeider i GitHub-repoet `br-orakel`. Les denne filen før du endrer kode. `CLAUDE.md` peker hit for Claude Code.

## Sikkerhetsavgrensning

Alle tilganger til maskinen, filsystemet, nettverket, SSH, Docker, GitHub og andre verktøy er gitt for hackathon-utviklingen av `br-orakel` alene. De skal ikke brukes som generell tilgang til andre prosjekter. Når `br-orakel` kjører på pi-tok, er bare den dedikerte hackathon-containeren og dens egne mapper/porter innenfor oppgaven.

Følgende er fullstendig off limits uten en ny, eksplisitt og konkret godkjenning fra oppdragsgiver:

- alle andre mapper og prosjekter under `/home/torgeir-kruke/Prosjekter/`
- andre GitHub-repositorier, branches, issues eller secrets enn `br-orakel`
- pi-tok-tjenester, containere, data, reverse proxy-regler eller konfigurasjon som ikke tilhører den isolerte `br-orakel`-stacken
- hele pi-amk, med mindre en separat oppgave eksplisitt gjelder `br-orakel`-deploy dit
- krultra.no-produksjon, backup, DNS, Domeneshop, SSH-nøkler, sertifikater og andre driftshemmeligheter
- private filer, andre brukeres data og systemadministrasjon som ikke er nødvendig for hackathonet

En bred teknisk tillatelse er ikke en bred arbeidsfullmakt. Før en agent leser, endrer, starter, stopper, kopierer eller sletter noe utenfor repoets arbeidsområde skal den stoppe og be om godkjenning for akkurat den handlingen. Ikke bruk brede søk, rekursive endringer, SSH, `docker` mot andre stacks eller globale oppryddingskommandoer for å «se hva som finnes».

Hvis en oppgave ser ut til å kreve tilgang utenfor `br-orakel`, dokumenter behovet og be om eksplisitt godkjenning. Ikke anta at godkjenning fra en tidligere oppgave gjelder på tvers av prosjekter eller systemer.

## Oppdrag

Bygg en liten, forståelig og etterprøvbar rapporteringslos for norske virksomheter. Arbeidsnavnet er Rapporteringsløsen; repository-navnet er `br-orakel`. Den endelige betydningen av «ORAKEL» avklares senere av teamet. Offisielle opplysninger, brukerinnspill og KI-forslag skal holdes adskilt. KI kan forklare og foreslå, men skal ikke gjøre juridiske konklusjoner eller opprette offisielle oppgaver automatisk.

## Arbeidsregler

- Gjør små, fokuserte endringer som kan integreres uavhengig.
- Les eksisterende kode og dokumentasjon før du endrer en fil.
- Ikke overskriv en fil som en annen agent eier uten å koordinere med hovedagenten.
- Ikke legg API-nøkler, personopplysninger, store datasett eller lokale runtime-filer i Git.
- Ikke endre DNS, brannmur, reverse proxy eller produksjonsdata uten eksplisitt godkjenning.
- Unngå destruktive Git-kommandoer (`reset --hard`, tvungen checkout, force-push) med mindre oppdragsgiver uttrykkelig ber om det.
- Bruk `apply_patch` for manuelle filendringer.
- Kjør relevante tester før handoff og skriv nøyaktig hva som ble kjørt.

## Fil-eierskap ved parallelt arbeid

Bruk denne inndelingen for å unngå overlapp:

| Spor | Primære filer | Typisk leveranse |
| --- | --- | --- |
| Produkt/domene | `src/domain/**`, `src/data/**` | typer, adapterkontrakter, mockdata og datamapping |
| Frontend | `src/App.tsx`, `src/styles.css`, `src/main.tsx` | flyt, komponenter og universell utforming |
| API/data | `server/**`, `scripts/import-dataset.ts` | API-ruter, import og persistens |
| Kvalitet | `tests/**`, testfixtures | tester, smoke checks og feilhåndtering |
| Plattform | `Dockerfile`, `docker-compose*.yml`, `deploy/**`, `.github/**`, `scripts/**` | CI, bygg, deploy og utviklerverktøy |
| Dokumentasjon | `README.md`, `CONTRIBUTING.md`, `docs/**`, `AGENTS.md`, `CLAUDE.md` | arbeidsflyt, beslutninger og drift |

`package.json`, `package-lock.json`, `tsconfig*` og domenekontrakter er delte kontraktsfiler. Hovedagenten integrerer endringer i disse, eller koordinerer eksplisitt før de endres.

## Agentroller

- **Hovedagent/orchestrator:** deler opp arbeid, velger eiere, passer integrasjonsrekkefølge, tar arkitekturbeslutninger og kjører samlet verifikasjon.
- **Implementasjonsagent:** arbeider på én branch/worktree og leverer en avgrenset endring med tester.
- **Review-/QA-agent:** leser diffen, leter etter regresjoner, sikkerhetsproblemer, brudd på datatillit og manglende tester.
- **Deploy-agent:** endrer kun plattformfiler og dokumentasjon, og kan forberede deploy uten å publisere eller endre DNS.

Agenter skal ikke konkurrere om samme fil. Del opp etter komponent, kontrakt eller runtime-område, ikke etter tilfeldige linjeintervaller.

## Handoff-format

Hver agent avslutter med:

```text
Mål:
Endret:
Ikke endret / antakelser:
Tester kjørt:
Commit:
Blokkerere eller oppfølging:
```

Commit-meldingen skal beskrive én endring, for eksempel `feat(domain): add obligation source contract` eller `docs(agents): document worktree handoff`.

## Felles kvalitetskrav

Før en endring integreres:

```bash
npm run typecheck
npm test
npm run build
```

Kjør i tillegg `npm run import ...` når importøren er endret, og gjør en API-smoketest når `server/**` er endret. Dokumenter hvis en test ikke kan kjøres lokalt.

## Codex og Claude Code

Hovedagenten kan delegere uavhengige oppgaver til innebygde Codex-agenter når harnesset støtter det. Delegasjonen skal inneholde mål, fil-eierskap, akseptansekriterier og forventet handoff. Agenter som kjører Claude Code skal lese både denne filen og `CLAUDE.md`; de følger samme Git- og testregler og kan overta som hovedagent ved å starte med `git status`, `git log` og åpne oppgaver i `docs/AGENT_WORKFLOW.md`.

Når en agent overtar, skal den bevare pågående arbeid, ikke begynne med en generell omskriving og ikke anta at en uferdig branch er feil. Først skal den rekonstruere status fra branch, commits, arbeidsnotater og tester.
