# Privat loshistorikk

Alle vellykkede los-svar som genereres av en innlogget bruker lagres som en
`ChatExchange`. Utvekslingen knyttes til både bruker-ID og organisasjonsnummer.
API-et filtrerer alltid på innlogget bruker før historikk returneres, endres
eller slettes.

En lagret utveksling inneholder spørsmålet, svaret, usikkerhetsteksten,
oppfølgingsspørsmål, tidspunkt og kildegrunnlaget som faktisk ble brukt. Det
lagres ikke en full kopi av virksomhets- eller registerdata sammen med svaret.

Historikken er privat som standard. «Nyttig» og «Ikke nyttig» lagres som
separat feedback og er ikke i seg selv samtykke til deling. Etter «Nyttig» kan
brukeren aktivt samtykke til at et anonymisert spørsmål og svar foreslås til en
fellesskaps-FAQ. ORaKeL fjerner kjente organisasjons- og kontaktidentifikatorer
før forslaget lagres, men dette er en demosikring og ikke en fullstendig
anonymiseringstjeneste.

Et samtykket forslag er fortsatt ikke offentlig eller offisielt. Det ligger
som et forslag til senere saksbehandler/moderatorflyt. Brukeren kan trekke
samtykket tilbake i demoen.

Demoen har sletting av enkeltsvar. Før produksjonsbruk bør lagringsperiode,
eksport/sletting for hele kontoen og tilgangslogging formaliseres.
