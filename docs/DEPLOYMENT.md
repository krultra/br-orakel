# Kjøremiljø og deployment

## Anbefaling for en kort hackathon

Bruk **pi-tok alene** som runtime for `br-orakel`, men kjør løsningen som en helt separat og midlertidig Docker-stack. Ikke bruk pi-amk i denne hackathonfasen.

Dette er den riktige balansen når løsningen bare skal leve noen få dager:

1. **Lokalt:** utvikling, tester og mockdata.
2. **Pi-tok demo:** stabil versjon som Marit kan bruke.
3. **Pi-tok test:** valgfri arbeidsversjon med separat container, port og datamappe.

Pi-amk trenger ikke klargjøres nå. En ekstern VPS gir bedre isolasjon, men innfører kostnad og ekstra drift som ikke er nødvendig for en kortvarig hackathon. Pi-tok er allerede tilgjengelig; risikoen håndteres ved å isolere containerne, bruke egne porter og aldri endre krultra.no-produksjonen som del av vanlig utvikling.

## Hvorfor Docker i dette prosjektet?

Docker brukes fordi hackathonet har to ulike kjørebehov: rask lokal utvikling og en offentlig, midlertidig runtime på pi-tok. Docker pakker applikasjonen med Node-runtime og avhengigheter, slik at deployen ikke avhenger av hvilke Node- eller DuckDB-versjoner som allerede finnes på pi-tok.

Dette er en bevisst begrenset bruk av Docker:

- lokal utvikling kan skje med vanlig `npm run dev`
- Docker brukes primært til bygg, smoke-test og deploy
- én container er nok for demo
- en eventuell testcontainer får egen port og datamappe
- ingen Kubernetes, Swarm eller automatisk produksjonsdeploy

Kompleksiteten vi aksepterer er Dockerfile, Compose, porter, volumes og reverse proxy. Til gjengjeld får vi en enklere rollback- og handoff-modell mellom Codex, Claude Code, Marit og pi-tok.

Forslag:

```text
demo.krultra.no  -> eksisterende reverse proxy -> br-orakel-demo :3001  (stabil tag)
test.krultra.no  -> eksisterende reverse proxy -> br-orakel-test :3002  (arbeidsversjon)
                                      |
                              pi-tok, isolert stack
```

Demo kan startes fra `docker-compose.yml`:

```bash
docker compose -p br-orakel-demo up --build -d
```

Testversjonen bruker `docker-compose.test.yml` og sin egen datamappe:

```bash
docker compose -p br-orakel-test -f docker-compose.test.yml up --build -d
```

Staging bør beskyttes med Basic Auth, Cloudflare Access, VPN eller annen enkel tilgangskontroll. Demo kan være offentlig bare dersom mockdata og innholdet er egnet for det.

## Alternativene

| Alternativ | Fordeler | Ulemper | Vurdering |
| --- | --- | --- | --- |
| Pi-tok, isolert hackathon-stack | Allerede oppe, ingen ny maskin, raskest til offentlig demo | Må skjermes fra krultra.no-produksjon og andre containere | **Anbefalt nå** |
| Pi-amk som operations-enhet | Frigjort maskin, fysisk kontroll, kan bli dedikert miljø | Må klargjøres, overvåkes, sikres og gjøres tilgjengelig utenfra | Ikke nødvendig for en hackathon på få dager |
| Ekstern VPS | God isolasjon og enkel rollback | Kostnad og ekstra drift | Reserve hvis pi-tok ikke kan isoleres trygt |
| Managed frontend + separat API | Enkel HTTPS og CDN for frontend, lite driftsarbeid | To plattformer, CORS/secrets/data må håndteres riktig, mer arkitektur | Overkill for første MVP |

Den fjerde praktiske opsjonen er fortsatt en **dedikert, isolert demo-VM/server**, men den er reserveplanen. For denne hackathonen trenger vi ikke både pi-tok og pi-amk. Vi bruker pi-tok, og holder pi-amk urørt.

## Branch- og releaseflyt

```text
feature branches -> PR -> main -> immutable image/tag
                                      |-> demo
                                      `-> test (kan ligge foran demo)
```

- `main` skal være byggbar.
- `demo` deployes bare fra en tag eller godkjent commit.
- `test` kan deployes fra `main` etter CI eller fra en eksplisitt test-tag.
- Bruk samme image mellom miljøer når mulig; bytt miljøvariabler, ikke kildekode.
- Behold forrige image/tag slik at rollback er én kommando.

## CI/CD

`.github/workflows/ci.yml` kjører typecheck, tester, build og Docker-build. Deploy til pi-tok bør gjøres manuelt fra en godkjent tag i hackathonfasen. GitHub Actions skal ikke få SSH-tilgang til pi-tok før det eventuelt er nødvendig og eksplisitt godkjent.

Ikke legg SSH-nøkler, API-nøkler eller Domeneshop-tokens i repoet. Bruk GitHub Actions Secrets eller serverens miljøfil. CI skal ikke få tilgang til produksjonsdata.

## Pi-tok-oppsett

Pi-tok er anbefalt. Bruk:

- bruk egne Compose-prosjektnavn for demo og test
- bruk separate porter og datamapper
- ikke monter krultra.no sine produksjonsmapper inn i hackathon-containeren
- sett CPU-/minnegrenser
- legg reverse proxy-regler for `br-orakel` i separat, versjonert konfigurasjon
- bruk healthcheck og dokumentert rollback
- ta backup av eksisterende konfigurasjon før endringer

Dette bør gjøres i et vedlikeholdsvindu. Ikke endre DNS eller eksisterende produksjonsproxy uten eksplisitt godkjenning. Agentene skal bare forberede konfigurasjon i repoet; en menneskelig eier utfører endringen.

## Domeneshop og DNS

Opprett først DNS når serveren er valgt. Typisk:

- `demo.krultra.no` → pi-tok, separat reverse proxy-route
- `test.krultra.no` → pi-tok, separat reverse proxy-route

HTTPS bør termineres i Caddy eller Nginx. Appen lytter internt på HTTP-port 3001/3002. DNS-endring, TLS og åpning av porter krever eksplisitt godkjenning.

DNS peker bare trafikken til pi-tok. Caddy må også vite hvilken lokal port hvert subdomene skal videresende til. Et versjonert eksempel ligger i `deploy/Caddyfile.br-orakel.example`:

```caddyfile
demo.krultra.no {
    encode gzip
    reverse_proxy 127.0.0.1:3001
}

test.krultra.no {
    encode gzip
    reverse_proxy 127.0.0.1:3002
}
```

Før en menneskelig eier legger dette inn på pi-tok bør eksisterende Caddyfile kopieres til backup og gjennomgås. Valider deretter hele konfigurasjonen før reload. Ikke overskriv eksisterende ruter for krultra.no.

## Operasjonell sjekkliste

Før demo:

- [ ] offentlig URL svarer med riktig tag
- [ ] mockdata eller godkjente testdata er brukt
- [ ] testmiljøet er adskilt fra demo
- [ ] health endpoint og logger er tilgjengelige
- [ ] forrige demo-tag kan startes igjen
- [ ] ingen hemmeligheter finnes i image, Git eller browser-bundle
- [ ] Marit har testet brukerreisen fra ekstern nettlinje
- [ ] br-orakel-containerne kan stoppes og fjernes uten å påvirke krultra.no
