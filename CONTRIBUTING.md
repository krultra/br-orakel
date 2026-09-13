# Bidra til br-orakel

Prosjektet utvikles av mennesker og kodeagenter. Målet med denne filen er at en ny person eller agent skal kunne starte uten muntlig kontekst.

## Før du begynner

1. Les `README.md`.
2. Les `AGENTS.md` og eventuelle relevante dokumenter under `docs/`.
3. Finn en tydelig oppgave og avgrens hvilke filer du eier.
4. Opprett egen branch/worktree. Se [multi-agent arbeidsflyt](docs/AGENT_WORKFLOW.md).

## Lokal utvikling

```bash
npm install
npm run dev
```

Kjør før handoff:

```bash
npm run typecheck
npm test
npm run build
```

## Pull requests

En PR skal ha:

- kort problem- og løsningsbeskrivelse
- hvilke filer eller områder som er berørt
- tester som er kjørt
- eventuelle datamodell- eller deploykonsekvenser
- skjermbilde eller kort demooppskrift når UI er endret

Hold PR-er små. En PR skal helst ha én faglig grunn til å bli integrert. Hovedagenten kan samle flere små PR-er i riktig rekkefølge.

## Beslutninger

Arkitekturvalg som påvirker flere spor dokumenteres som ADR under `docs/ADR/`. Små implementasjonsvalg kan dokumenteres i PR-en.
