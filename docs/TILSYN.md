# Tilsynssporet i v3.0

Tilsyn er modellert som et eget kunnskaps- og forberedelsesspor. Et
`SupervisionTheme` beskriver et mulig relevant tema; det er ikke et konkret
tilsynsvarsel og skal ikke behandles som en rapporteringsplikt.

## Første MVP

- `SupervisionAdapter` gir virksomhetstilpassede mocktemaer.
- Temaene viser etat, områder, kilder, koblede rapporteringsoppgaver og hvorfor
  temaet ble vist.
- Manglende virksomhetsinformasjon vises som «må avklares».
- Losen kan spørres om et tema med virksomhetsprofilen som vanlig kontekst.
- Hele flyten er tilgjengelig i arbeidsflaten **Tilsyn**.

Mocktemaene illustrerer Arbeidstilsynet, Mattilsynet/Smilefjestilsyn og DSB.
Smilefjestilsyn er en aktuell åpen datakilde for historiske resultater, mens
Tilda og FTD må avklares med etatsmiljøene før de eventuelt kobles på.

## Videre arbeid

Et konkret varsel bør få en egen `SupervisionNotice` med dato, kilde og
tillitsnivå. Brukerregistrerte varsler skal holdes adskilt fra offisielle
varsler, og ingen av dem skal endre den offisielle oppgavekatalogen.
