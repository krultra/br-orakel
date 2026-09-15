# Virksomhetsprofil

Virksomhetsprofilen skiller mellom opplysninger fra åpne registerkilder og
opplysninger brukeren selv legger inn.

## Offisielle opplysninger

`Organization` kommer fra valgt organisasjonsadapter, normalt
Enhetsregisteret. Profilen viser organisasjonsnummer, navn, organisasjonsform,
næringskoder, kommune, registerstatus og tilgjengelig ansattinformasjon.
Kilde-ID-er kobles mot `Source` for å vise lenke og tidspunkt for siste hentede
grunnlag.

## Brukeropplysninger

Brukeropplysninger lagres per innlogget bruker og organisasjonsnummer i
`OrganizationProfile.inputs`. De har status `USER_INPUT` og kan ikke overskrive
registerdata. Dette er en enkel hackathon-funksjon; en senere versjon bør
støtte forslag til korrigering med begrunnelse, historikk og saksbehandling.

Profilen lagres i demo-store-filen på samme måte som øvrige brukerpreferanser.
Den skal ikke brukes til å lagre fødselsnummer, passord, API-nøkler eller andre
unødvendige personopplysninger.

## Loskontekst

`ChatContext.userInputs` sender brukeropplysningene separat fra
`organization`. KI-adapteren skal behandle dem som brukerinput og vise
usikkerhet dersom de påvirker svaret. Offisielle registerdata og brukerinput
skal aldri presenteres som samme tillitsnivå.
