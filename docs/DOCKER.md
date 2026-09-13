# Docker for førstegangsbruk

Docker kjører applikasjonen i en container. Tenk på containeren som en standardisert prosesspakke med riktig Node-runtime, avhengigheter og startkommando. Den deler operativsystemkjernen med vertsmaskinen, men holder prosessen og prosjektfilene mer avgrenset enn en vanlig global installasjon.

## Når skal jeg bruke Docker?

Bruk vanlig Node lokalt mens du utvikler:

```bash
npm install
npm run dev
```

Bruk Docker når du vil sjekke at deploypakken fungerer, eller når `br-orakel` skal kjøre på pi-tok:

```bash
docker compose up --build
```

Åpne deretter <http://localhost:3001> når du kjører produksjonscontaineren. `--build` bygger et nytt image hvis kildekoden eller Dockerfile er endret.

For den separate testversjonen brukes port 3002:

```bash
docker compose -p br-orakel-test -f docker-compose.test.yml up --build -d
```

Da blir testappen tilgjengelig på <http://localhost:3002>.

På pi-tok brukes miljøvariabelen `BR_ORAKEL_HOST_PORT` fordi port 3001 allerede
kan være i bruk av andre tjenester. Demo bindes kun til localhost på port 3010,
og test bindes kun til localhost på port 3020. Caddy videresender deretter
subdomenene til disse portene:

```bash
docker compose -p br-orakel-demo \
  -f docker-compose.yml \
  up --build -d

BR_ORAKEL_HOST_PORT=3020 docker compose -p br-orakel-test \
  -f docker-compose.test.yml \
  up --build -d
```

## Nyttige kommandoer

```bash
# Start i bakgrunnen
docker compose up --build -d

# Se logger
docker compose logs -f br-orakel

# Se kjørende containere
docker compose ps

# Stopp stacken
docker compose down

# Stopp og bygg helt på nytt hvis avhengigheter er blitt rare
docker compose down
docker compose build --no-cache
docker compose up
```

`docker compose down` fjerner containeren og nettverket som Compose opprettet, men sletter ikke kildekoden. Volumet `./data:/app/data` er en mappebinding; filer i `data/` ligger fortsatt på vertsmaskinen.

## Ord å kjenne

- **Image:** den byggede pakken som kan startes.
- **Container:** en kjørende instans av et image.
- **Compose:** prosjektfilen som beskriver service, porter, miljøvariabler og volumes.
- **Port:** forbindelsen mellom vertsmaskinen og applikasjonen i containeren. I lokal Compose er dette `127.0.0.1:3001:3001`; på pi-tok settes `BR_ORAKEL_HOST_PORT` til 3010 eller 3020.
- **Volume/mount:** en mappe som ligger utenfor containerens midlertidige lagring. Her brukes `./data` for datafiler.

## Hackathon-regel

Kjør bare `docker compose` fra `br-orakel`-repoet og med dette prosjektets Compose-fil. Ikke bruk globale oppryddingskommandoer som `docker system prune` på en maskin som også kjører andre prosjekter. På pi-tok skal stacken ha eget Compose-prosjektnavn og egne porter.

## Vanlige problemer

Hvis Docker ikke finnes:

```text
docker: command not found
```

kan du fortsette lokal utvikling med `npm run dev`. Docker må installeres på den maskinen som skal bygge eller kjøre deploypakken; dette kan gjøres separat på pi-tok uten å endre utviklingsmiljøet.

Hvis port 3001 er opptatt, ikke stopp en tilfeldig container. Finn først hvilken `br-orakel`-konfigurasjon som skal bruke porten, og avklar med hovedagenten før andre prosjekter berøres.
