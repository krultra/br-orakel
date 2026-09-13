import type { Obligation, Organization, Source, UserReportedRequirement } from '../domain/types.js';

export const mockOrganization: Organization = {
  orgNumber: '999999999',
  name: 'Fjordgløtt Mat og Handel AS',
  organizationForm: 'AS',
  organizationFormName: 'Aksjeselskap',
  industryCodes: ['47.110', '56.101'],
  hasEmployees: true,
  employeeCount: 8,
  registeredInMvaRegister: true,
  registeredInForetaksregister: true,
  municipality: 'Trondheim',
  municipalityNumber: '5001',
  sources: ['source-brreg-org'],
};

const source = (value: Omit<Source, 'retrievedAt'>): Source => ({
  ...value,
  retrievedAt: '2026-09-01T10:00:00.000Z',
});

export const mockSources: Source[] = [
  source({
    id: 'source-oppgaveregisteret',
    title: 'Oppgaveregisteret – skjema og oppgaveplikter',
    url: 'https://data.brreg.no/oppgaveregisteret/api/docs/index.html',
    sourceType: 'register',
    officiality: 'OFFICIAL',
    relevantExcerpt: 'Oppgaveregisteret tilbyr programmatisk oppslag og søk på næringslivets registrerte oppgaveplikter.',
  }),
  source({
    id: 'source-brreg-org',
    title: 'Enhetsregisteret – virksomhetsopplysninger',
    url: 'https://data.brreg.no/enhetsregisteret/api/enheter/999999999',
    sourceType: 'register',
    officiality: 'OFFICIAL',
    relevantExcerpt: 'Virksomheten er registrert som aksjeselskap med næringskodene 47.110 og 56.101.',
  }),
  source({
    id: 'source-a-melding',
    title: 'Altinn: A-meldingen',
    url: 'https://www.skatteetaten.no/bedrift-og-organisasjon/arbeidsgiver/a-meldingen/',
    sourceType: 'guidance',
    officiality: 'OFFICIAL_GUIDANCE',
    relevantExcerpt: 'A-meldingen leveres hver måned og inneholder opplysninger om inntekt, arbeidsforhold, forskuddstrekk og arbeidsgiveravgift.',
  }),
  source({
    id: 'source-mva',
    title: 'Skatteetaten: Merverdiavgift – mva-meldingen',
    url: 'https://www.skatteetaten.no/bedrift-og-organisasjon/avgifter/mva/mva-meldingen/',
    sourceType: 'guidance',
    officiality: 'OFFICIAL_GUIDANCE',
    relevantExcerpt: 'Mva-meldingen leveres normalt seks ganger i året. Fristen er én måned og ti dager etter terminens utløp.',
  }),
  source({
    id: 'source-arsregnskap',
    title: 'Regnskapsregisteret: Årsregnskap',
    url: 'https://www.brreg.no/bedrift/arsregnskap/',
    sourceType: 'guidance',
    officiality: 'OFFICIAL_GUIDANCE',
    relevantExcerpt: 'Regnskapspliktige virksomheter skal sende inn årsregnskap til Regnskapsregisteret innen én måned etter fastsetting.',
  }),
  source({
    id: 'source-skatt',
    title: 'Skatteetaten: Skattemelding for næringsdrivende',
    url: 'https://www.skatteetaten.no/bedrift-og-organisasjon/skatt/skattemelding-naringsdrivende/',
    sourceType: 'guidance',
    officiality: 'OFFICIAL_GUIDANCE',
    relevantExcerpt: 'Aksjeselskap leverer skattemelding for næringsdrivende elektronisk innen 31. mai.',
  }),
  source({
    id: 'source-feriepenger',
    title: 'Arbeidstilsynet: Feriepenger og arbeidsgiveransvar',
    url: 'https://www.arbeidstilsynet.no/arbeidstid-og-organisering/ferie/feriepenger/',
    sourceType: 'guidance',
    officiality: 'OFFICIAL_GUIDANCE',
    relevantExcerpt: 'Arbeidsgiver skal beregne og utbetale feriepenger etter reglene i ferieloven.',
  }),
];

export const mockObligations: Obligation[] = [
  {
    id: 'obl-a-melding', name: 'A-meldingen', description: 'Rapporter lønn, arbeidsforhold, forskuddstrekk og arbeidsgiveravgift.', officialStatus: 'OFFICIAL', responsibleAgency: 'Skatteetaten', legalBasis: 'A-opplysningsloven', targetCriteria: ['AS', 'arbeidsgiveransvar'], reportingWindowStart: '2026-09-01', reportingWindowEnd: '2026-09-05', deadline: '2026-09-05', frequency: 'Månedlig', estimatedMinutes: 45, requiredData: ['Lønn og ytelser', 'Arbeidsforhold', 'Forskuddstrekk'], attachments: [], sourceLinks: ['source-a-melding', 'source-oppgaveregisteret'], status: 'in_progress', trigger: 'periodic', registerId: 'A-MELDING-01'
  },
  {
    id: 'obl-mva-termin-4', name: 'Mva-melding – termin 4', description: 'Rapporter utgående og inngående merverdiavgift for mai og juni.', officialStatus: 'OFFICIAL', responsibleAgency: 'Skatteetaten', legalBasis: 'Merverdiavgiftsloven kap. 15', targetCriteria: ['AS', 'mva-registrert'], reportingWindowStart: '2026-08-01', reportingWindowEnd: '2026-09-10', deadline: '2026-09-10', frequency: 'Seks ganger per år', estimatedMinutes: 60, requiredData: ['Salg med mva', 'Kjøp med mva', 'Kontospesifikasjon'], attachments: ['Eventuell dokumentasjon ved korrigering'], sourceLinks: ['source-mva', 'source-oppgaveregisteret'], status: 'ready', trigger: 'periodic', registerId: 'MVA-TERM-04'
  },
  {
    id: 'obl-aarsregnskap', name: 'Årsregnskap til Regnskapsregisteret', description: 'Send inn årsregnskap, årsberetning og revisjonsberetning der det kreves.', officialStatus: 'OFFICIAL', responsibleAgency: 'Brønnøysundregistrene', legalBasis: 'Regnskapsloven § 8-2', targetCriteria: ['AS', 'regnskapspliktig'], reportingWindowStart: '2026-05-01', reportingWindowEnd: '2026-07-31', deadline: '2026-07-31', frequency: 'Årlig', estimatedMinutes: 120, requiredData: ['Resultatregnskap', 'Balanse', 'Noter'], attachments: ['Årsberetning ved krav', 'Revisjonsberetning ved krav'], sourceLinks: ['source-arsregnskap'], status: 'completed', trigger: 'periodic', registerId: 'BR-AR-001'
  },
  {
    id: 'obl-skattemelding', name: 'Skattemelding for næringsdrivende', description: 'Lever skattemelding med næringsspesifikasjon for aksjeselskapet.', officialStatus: 'OFFICIAL', responsibleAgency: 'Skatteetaten', legalBasis: 'Skatteforvaltningsloven kap. 8', targetCriteria: ['AS'], reportingWindowStart: '2026-04-01', reportingWindowEnd: '2026-05-31', deadline: '2026-05-31', frequency: 'Årlig', estimatedMinutes: 180, requiredData: ['Årsregnskap', 'Skattemessige forskjeller', 'Næringsspesifikasjon'], attachments: [], sourceLinks: ['source-skatt'], status: 'completed', trigger: 'periodic', registerId: 'SKATT-NAERING-01'
  },
  {
    id: 'obl-aksjonarregisteroppgave', name: 'Aksjonærregisteroppgaven', description: 'Rapporter aksjonærer, transaksjoner og utbytte.', officialStatus: 'OFFICIAL', responsibleAgency: 'Skatteetaten', legalBasis: 'Skatteforvaltningsforskriften', targetCriteria: ['AS'], reportingWindowStart: '2027-01-01', reportingWindowEnd: '2027-01-31', deadline: '2027-01-31', frequency: 'Årlig', estimatedMinutes: 60, requiredData: ['Aksjeeierbok', 'Transaksjoner', 'Utbytte'], attachments: [], sourceLinks: ['source-skatt'], status: 'not_started', trigger: 'periodic', registerId: 'SKATT-AKS-01'
  },
  {
    id: 'obl-arsoppgave-forsikring', name: 'Årsoppgave til forsikringsselskap', description: 'Kontroller og bekreft grunnlag for yrkesskadeforsikring.', officialStatus: 'OFFICIAL_GUIDANCE', responsibleAgency: 'Forsikringsselskap', legalBasis: 'Forsikringsavtale', targetCriteria: ['arbeidsgiveransvar'], reportingWindowStart: '2026-11-01', reportingWindowEnd: '2026-11-30', deadline: '2026-11-30', frequency: 'Årlig', estimatedMinutes: 30, requiredData: ['Antall ansatte', 'Lønnssum'], attachments: [], sourceLinks: ['source-feriepenger'], status: 'not_started', trigger: 'periodic'
  },
  {
    id: 'obl-hms-melding', name: 'Årlig HMS-gjennomgang', description: 'Dokumenter intern gjennomgang av HMS-arbeidet og handlingsplan.', officialStatus: 'OFFICIAL_GUIDANCE', responsibleAgency: 'Arbeidstilsynet', legalBasis: 'Internkontrollforskriften § 5', targetCriteria: ['arbeidsgiveransvar'], reportingWindowStart: '2026-10-01', reportingWindowEnd: '2026-12-15', deadline: '2026-12-15', frequency: 'Årlig', estimatedMinutes: 90, requiredData: ['Avvik', 'Risikovurdering', 'Tiltak'], attachments: ['Handlingsplan'], sourceLinks: ['source-feriepenger'], status: 'needs_clarification', trigger: 'periodic'
  },
  {
    id: 'obl-ny-ansatt', name: 'Melding ved ny arbeidstaker', description: 'Hendelsesutløst oppgave: oppdater arbeidsforhold og innrapporter første lønn.', officialStatus: 'OFFICIAL', responsibleAgency: 'Skatteetaten', legalBasis: 'A-opplysningsloven', targetCriteria: ['arbeidsgiveransvar'], frequency: 'Ved hendelse', estimatedMinutes: 20, requiredData: ['Arbeidsavtale', 'Startdato', 'Stillingsprosent'], attachments: [], sourceLinks: ['source-a-melding'], status: 'not_started', trigger: 'event', eventLabel: 'Ny arbeidstaker'
  },
  {
    id: 'obl-mva-endring', name: 'Endring i mva-registrering', description: 'Hendelsesutløst oppgave ved endret virksomhet eller passeringspunkt for registrering.', officialStatus: 'OFFICIAL', responsibleAgency: 'Skatteetaten', legalBasis: 'Merverdiavgiftsloven § 2-1', targetCriteria: ['mva-registrert'], frequency: 'Ved hendelse', estimatedMinutes: 25, requiredData: ['Omsetning', 'Virksomhetsbeskrivelse'], attachments: ['Dokumentasjon av omsetning'], sourceLinks: ['source-mva', 'source-oppgaveregisteret'], status: 'not_started', trigger: 'event', eventLabel: 'Endret omsetning'
  },
  {
    id: 'obl-kommunal-plast', name: 'Rapportering av emballasjeavfall', description: 'Eksempelkort for lokal rapportering som må avklares med kommunen.', officialStatus: 'UNDER_REVIEW', responsibleAgency: 'Trondheim kommune', legalBasis: 'Ikke avklart', targetCriteria: ['næringskode 47.110'], reportingWindowStart: '2026-12-01', reportingWindowEnd: '2026-12-31', deadline: '2026-12-31', frequency: 'Årlig', estimatedMinutes: 45, requiredData: ['Mengde emballasje'], attachments: [], sourceLinks: [], status: 'needs_clarification', trigger: 'periodic'
  },
];

export const mockReports: UserReportedRequirement[] = [
  {
    id: 'report-001', title: 'Årlig rapport om matsvinn', description: 'Vi får hvert år en forespørsel om å rapportere matsvinn til en bransjeordning. Usikker på om dette er offentlig plikt.', reportedBy: 'Kari Nordmann', suspectedAgency: 'Mattilsynet', suspectedLegalBasis: '', targetGroup: 'Dagligvare og servering', frequency: 'Årlig', deadline: '15. februar', evidenceLinks: ['https://example.org/foresporsel'], aiSuggestions: ['Søk i Oppgaveregisteret etter bruksområde og næringskode.', 'Avklar om forespørselen kommer fra offentlig etat eller bransjeordning.'], confidence: 0.61, reviewStatus: 'new', createdAt: '2026-09-04T08:30:00.000Z', updatedAt: '2026-09-04T08:30:00.000Z'
  },
];
