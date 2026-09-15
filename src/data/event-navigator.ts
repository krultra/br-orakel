import type { Obligation, Organization } from '../domain/types.js';

export interface EventGuide {
  id: string;
  label: string;
  title: string;
  summary: string;
  aliases: string[];
  steps: string[];
  questions: string[];
  sourceIds: string[];
  criteria: string[];
  isPredefined: boolean;
}

const predefinedGuides: EventGuide[] = [
  {
    id: 'new-employee',
    label: 'Ny arbeidstaker',
    title: 'Når dere får en ny arbeidstaker',
    summary: 'En ny arbeidstaker kan utløse oppfølging i arbeidsforholdet og i den månedlige rapporteringen.',
    aliases: ['ny arbeidstaker', 'ny ansatt', 'ny medarbeider', 'ansettelse'],
    steps: [
      'Finn arbeidsavtale, startdato og avtalt stillingsprosent.',
      'Registrer arbeidsforholdet i lønns- eller personalsystemet.',
      'Kontroller at den ansatte kommer med i neste A-melding.',
      'Ta vare på dokumentasjonen og avklar eventuelle særregler med losen.',
    ],
    questions: ['Når skal den nye arbeidstakeren med i A-meldingen?', 'Hvilke opplysninger trenger vi fra den ansatte?'],
    sourceIds: ['source-a-melding', 'source-oppgaveregisteret'],
    criteria: ['Virksomheten har ansatte eller arbeidsgiveransvar'],
    isPredefined: true,
  },
  {
    id: 'changed-turnover',
    label: 'Endret omsetning',
    title: 'Når omsetningen endrer seg',
    summary: 'Endret omsetning kan påvirke merverdiavgiftsregistrering, rapporteringsform og hvilke oppgaver som gjelder.',
    aliases: ['endret omsetning', 'omsetning', 'mva-registrering', 'passeringspunkt'],
    steps: [
      'Finn samlet omsetning og skill mellom omsetning med og uten merverdiavgift.',
      'Kontroller om virksomheten er registrert i Merverdiavgiftsregisteret.',
      'Se etter endringer i rapporteringsform eller termin som bør følges opp.',
      'Dokumenter vurderingen og spør losen hvis tallgrunnlaget eller reglene er uklare.',
    ],
    questions: ['Har den nye omsetningen betydning for mva-registreringen vår?', 'Hvilken mva-melding gjelder for denne perioden?'],
    sourceIds: ['source-mva', 'source-oppgaveregisteret'],
    criteria: ['Virksomheten er eller kan bli mva-registrert'],
    isPredefined: true,
  },
  {
    id: 'absence-or-parental-leave',
    label: 'Sykefravær eller foreldrepermisjon',
    title: 'Når en arbeidstaker blir syk eller går ut i permisjon',
    summary: 'Fravær kan kreve oppfølging av arbeidsforhold, lønn og ytelser. Hva som gjelder avhenger blant annet av fraværstype og virksomhetens rolle.',
    aliases: ['sykefravær', 'sykdom', 'foreldrepermisjon', 'svangerskapspenger', 'foreldrepenger'],
    steps: [
      'Avklar fraværstype, første fraværsdag og om virksomheten skal utbetale lønn eller forskuttere ytelsen.',
      'Kontroller at arbeidsforhold og lønnsopplysninger er oppdatert i systemet.',
      'Finn veiledning om eventuell søknad, inntektsmelding eller oppfølging hos riktig etat.',
      'Noter hva som er avklart og hvilke opplysninger som fortsatt mangler.',
    ],
    questions: ['Hvilke opplysninger må vi sende ved foreldrepermisjon?', 'Hva må arbeidsgiver gjøre ved langvarig sykefravær?'],
    sourceIds: ['source-a-melding', 'source-oppgaveregisteret'],
    criteria: ['Virksomheten har ansatte eller arbeidsgiveransvar'],
    isPredefined: true,
  },
  {
    id: 'business-change',
    label: 'Endring i virksomheten',
    title: 'Når virksomheten endrer seg',
    summary: 'Ny adresse, aktivitet, organisasjonsform eller eiersituasjon kan gjøre at virksomhetsopplysninger og rapporteringsplikter må vurderes på nytt.',
    aliases: ['endring i virksomheten', 'endret virksomhet', 'adresseendring', 'organisasjonsform', 'næringskode', 'eierskap'],
    steps: [
      'Beskriv konkret hva som er endret og fra hvilken dato.',
      'Kontroller at opplysningene i Enhetsregisteret og andre relevante registre er riktige.',
      'Vurder om næringskode, organisasjonsform eller registerstatus påvirker oppgavene.',
      'Bruk losen til å finne mulige konsekvenser, og bekreft viktige forhold i offisielle kilder.',
    ],
    questions: ['Hvilke rapporteringsplikter kan påvirkes av denne endringen?', 'Hvordan oppdaterer vi næringskoden vår?'],
    sourceIds: ['source-brreg-org', 'source-oppgaveregisteret'],
    criteria: ['Alle virksomheter'],
    isPredefined: true,
  },
];

function normalized(value: string) {
  return value.toLocaleLowerCase('nb-NO').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function isPlaceholderEventLabel(value: string) {
  return /^\(beskrives\)$/i.test(value.trim());
}

function obligationText(obligation: Obligation) {
  return normalized(`${obligation.eventLabel ?? ''} ${obligation.name} ${obligation.description} ${obligation.targetCriteria.join(' ')}`);
}

export function buildEventGuides(obligations: Obligation[]): EventGuide[] {
  const knownLabels = new Set(predefinedGuides.flatMap((guide) => guide.aliases.map(normalized)));
  const dynamicLabels = [...new Set(obligations.map((item) => item.eventLabel).filter((label): label is string => Boolean(label && label.trim())))]
    .filter((label) => !isPlaceholderEventLabel(label) && !knownLabels.has(normalized(label)))
    .sort((left, right) => left.localeCompare(right, 'nb'));
  return [...predefinedGuides, ...dynamicLabels.map((label) => ({
    id: `catalog-${normalized(label).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
    label,
    title: `Når det skjer: ${label}`,
    summary: 'Denne hendelsen er hentet fra virksomhetens oppgavekatalog. Bruk oppgavene som utgangspunkt og spør losen hvis dere trenger mer veiledning.',
    aliases: [label],
    steps: [
      'Beskriv hva som har skjedd og hvilken dato hendelsen gjelder.',
      'Finn oppgavene som er koblet til hendelsen i katalogen.',
      'Kontroller frist, nødvendige data og kilde for hver aktuell oppgave.',
      'Spør losen om det som ikke er dekket av den forhåndsdefinerte veiledningen.',
    ],
    questions: [`Hvilke rapporteringsplikter kan følge av «${label}» for virksomheten vår?`],
    sourceIds: ['source-oppgaveregisteret'],
    criteria: ['Hentet fra Oppgaveregisteret'],
    isPredefined: false,
  }))];
}

export function obligationsForEvent(event: EventGuide, obligations: Obligation[]) {
  const aliases = event.aliases.map(normalized);
  return obligations.filter((obligation) => {
    const text = obligationText(obligation);
    return aliases.some((alias) => text.includes(alias));
  });
}

export function organizationEventContext(organization: Organization) {
  const employeeText = organization.employeeCount === undefined
    ? organization.hasEmployees === undefined ? 'ansatte ikke oppgitt' : organization.hasEmployees ? 'arbeidsgiveransvar' : 'ingen registrerte ansatte'
    : `${organization.employeeCount} registrerte ansatte`;
  const mvaText = organization.registeredInMvaRegister === undefined
    ? 'mva-status ikke oppgitt'
    : organization.registeredInMvaRegister ? 'registrert i Merverdiavgiftsregisteret' : 'ikke registrert i Merverdiavgiftsregisteret';
  return `${organization.name} (${organization.orgNumber}) er ${organization.organizationFormName ?? (organization.organizationForm || 'virksomhet')} med næringskode${organization.industryCodes.length === 1 ? '' : 'r'} ${organization.industryCodes.join(', ') || 'ikke oppgitt'}, ${employeeText} og ${mvaText}.`;
}
