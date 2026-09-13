# ADR-0001: Isolert hackathon-stack på pi-tok

## Status

Anbefalt, ikke deployet.

## Kontekst

Hackathon-teamet trenger en stabil offentlig demo samtidig som videreutvikling kan deployes for ekstern testing. Løsningen skal bare leve noen få dager. Pi-tok hoster allerede krultra.no, mens pi-amk er frigjort men krever klargjøring.

## Beslutning

Bruk lokal utvikling med Docker, og kjør hackathonet på pi-tok som en isolert `br-orakel`-stack. Demo og test kan kjøre som to containere med ulike tags, porter og datamapper. `demo.krultra.no` peker til stabil tag, mens `test.krultra.no` peker til en arbeidsversjon.

Pi-amk skal ikke brukes i denne hackathonfasen. Ekstern VPS er reserve dersom pi-tok ikke kan isoleres trygt.

## Konsekvenser

Vi får kort vei til offentlig demo og trenger bare én runtime. Vi må være nøye med Compose-prosjektnavn, porter, datamapper, ressursgrenser og reverse proxy. DNS- og deployendringer holdes utenfor vanlig agentarbeid.
