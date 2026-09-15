# Privat loshistorikk

Alle vellykkede los-svar som genereres av en innlogget bruker lagres som en
`ChatExchange`. Utvekslingen knyttes til både bruker-ID og organisasjonsnummer.
API-et filtrerer alltid på innlogget bruker før historikk returneres, endres
eller slettes.

En lagret utveksling inneholder spørsmålet, svaret, usikkerhetsteksten,
oppfølgingsspørsmål, tidspunkt og kildegrunnlaget som faktisk ble brukt. Det
lagres ikke en full kopi av virksomhets- eller registerdata sammen med svaret.

Historikken er privat som standard. «Nyttig» og «Ikke nyttig» lagres som
separat feedback og er ikke samtykke til deling. En eventuell fellesskaps-FAQ
og eksplisitt delingssamtykke må bygges som en senere, separat flyt.

Demoen har sletting av enkeltsvar. Før produksjonsbruk bør lagringsperiode,
eksport/sletting for hele kontoen og tilgangslogging formaliseres.
