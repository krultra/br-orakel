# Multi-agent arbeidsflyt

## Anbefalt modell

Bruk én hovedagent som holder produktmål, integrasjonsrekkefølge og demo-kvalitet samlet. Hovedagenten delegerer smale, uavhengige leveranser til Codex-subagenter, Claude Code eller mennesker. Alle arbeider mot samme GitHub-repo, men aldri i samme arbeidskopi samtidig.

En oppgave er klar for parallellisering når den har:

- ett tydelig mål
- avgrensede filer eller en eksplisitt kontrakt
- testbare akseptansekriterier
- ingen avhengighet til en pågående endring i samme fil

## Foreslått oppdeling

### Spor A: domene og data

Eier `src/domain/**`, `src/data/**` og adapterkontrakter. Leverer datamodell, kilde-/tillitsnivåer, mockdata og normalisering.

### Spor B: frontend

Eier `src/App.tsx`, `src/styles.css` og komponentflyt. Bruker domenekontrakter, men endrer ikke API-kontrakter uten å koordinere med spor A/API.

### Spor C: API og import

Eier `server/**` og `scripts/**`. Leverer Fastify-ruter, adapterkoblinger, streaming/DuckDB-import og feilhåndtering.

### Spor D: kvalitet

Eier `tests/**`, smoke checks og testfixtures. Verifiserer at kalender og arbeidsliste bruker samme datamodell, at tillitsnivåer vises riktig, og at uoffisielle innspill ikke blir offisielle oppgaver.

### Spor E: plattform og dokumentasjon

Eier Docker, GitHub Actions, deploydokumentasjon og agentinstruksjoner. Skal kunne jobbe parallelt med produktkode så lenge package- og byggkontrakter holdes stabile.

## Git-strategi

Bruk en beskyttet `main` som alltid skal være byggbar. Arbeid skjer på korte branches:

```text
agent/domain/obl-criteria
agent/frontend/calendar-list-view
agent/api/oppgaveregister-adapter
agent/infra/demo-deploy
```

For parallelt arbeid bør hver agent bruke en egen worktree:

```bash
git fetch origin
git worktree add ../worktrees/agent-domain -b agent/domain/obl-criteria origin/main
cd ../worktrees/agent-domain
npm install
```

Repoet inneholder `scripts/new-worktree.sh` som hjelper med dette. Hvis repoet ikke er initialisert ennå, gjøres bootstrap én gang av en menneskelig eier:

```bash
git init
git add .
git commit -m "chore: bootstrap reporting assistant MVP"
git branch -M main
git remote add origin <github-repository-url>
git push -u origin main
```

Ikke del en branch mellom agenter. Ikke bruk `git reset --hard` eller force-push for å rydde etter en annen agent. Ved konflikt: hent ny `main`, rebaser egen branch hvis det er avtalt, løs konflikten manuelt og kjør full verifikasjon.

## Integrasjonsrekkefølge

1. Domenekontrakter og adaptergrenser.
2. API og mockadaptere.
3. Frontend mot mock/API-kontrakt.
4. Tester og verifikasjon.
5. Docker/CI/deploy.

Hvis to spor må endre samme kontrakt, integrerer hovedagenten kontraktsendringen først og sender en ny, konkret oppgave til de andre agentene.

## Codex-subagenter

Delegasjonen bør være eksplisitt: «Eier `src/data/**`, ikke endre `src/App.tsx`, lever adapter og tester, kjør `npm test`, returner commit og handoff.» Uavhengige spor kan kjøre samtidig. Hovedagenten venter på alle relevante resultater, leser diffene og kjører samlet build før integrasjon.

OpenAI sin offisielle veiledning anbefaler å instruere modellen eksplisitt når arbeid bør delegeres til subagenter, og å kalibrere testing etter endringens risiko. Se [OpenAI Docs – model guidance](https://developers.openai.com/api/docs/guides/latest-model).

## Claude Code som hovedagent

Når Claude Code overtar:

```bash
git status --short --branch
git log --oneline --decorate -12
sed -n '1,260p' AGENTS.md
sed -n '1,260p' docs/AGENT_WORKFLOW.md
npm run typecheck && npm test && npm run build
```

Deretter skal Claude Code velge neste oppgave fra backlog/issue, kontrollere fil-eierskap og fortsette på eksisterende branch. Claude Code skal bruke samme commit- og handoff-format som Codex.

## Handoff mellom agenter

Legg handoff i PR-beskrivelsen eller i issue-kommentaren:

```text
Mål: hva skulle oppnås?
Endret: filer og viktigste beslutninger.
Antakelser: hva er mock, og hva må avklares?
Tester: eksakte kommandoer og resultat.
Commit: <sha>
Neste steg: konkret oppgave for neste agent.
```

En agent skal aldri sende «ferdig» uten å oppgi kjent gjeld eller tester som ikke ble kjørt.

## GitHub-praksis

- Issues beskriver mål og akseptansekriterier, ikke implementasjonsdetaljer som kan endre seg.
- Labels: `area:frontend`, `area:api`, `area:data`, `area:infra`, `area:docs`, `agent:codex`, `agent:claude`, `priority:demo`.
- PR-er har én eier og minst én review når endringen påvirker flere spor.
- `main` deployes aldri direkte fra en uferdig arbeidsbranch.
- Demo-release merkes med en tag, for eksempel `demo-2026-09-13`.
- Hver deploy skal kunne rulles tilbake til forrige image/tag.
