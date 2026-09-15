import type { Organization, SupervisionTheme } from '../domain/types.js';

export const mockSupervisionThemes: SupervisionTheme[] = [
  {
    id: 'supervision-arbeidstilsynet-hms',
    title: 'Systematisk HMS og internkontroll',
    responsibleAgency: 'Arbeidstilsynet',
    description: 'Tilsynstemaet handler om hvordan virksomheten planlegger, gjennomfører og følger opp HMS-arbeidet.',
    topics: ['Risikovurdering', 'Avvik og tiltak', 'Arbeidsmiljø', 'Dokumentasjon'],
    targetCriteria: ['Virksomheten har ansatte'],
    relevanceReasons: [],
    missingInformation: [],
    relatedObligationIds: ['obl-hms-melding'],
    sourceLinks: ['source-arbeidstilsynet-hms'],
    officialStatus: 'OFFICIAL_GUIDANCE',
  },
  {
    id: 'supervision-mattilsynet-servering',
    title: 'Mattrygghet i serverings- og matvirksomhet',
    responsibleAgency: 'Mattilsynet',
    description: 'Et mulig relevant tilsynstema for virksomheter som håndterer eller serverer mat. Smilefjestilsyn viser historiske tilsynsresultater for serveringssteder.',
    topics: ['Internkontroll mat', 'Hygiene', 'Sporbarhet', 'Merking'],
    targetCriteria: ['Næringskode 47 eller 56'],
    relevanceReasons: [],
    missingInformation: [],
    relatedObligationIds: ['obl-mva-endring'],
    sourceLinks: ['source-mattilsynet-smilefjes'],
    officialStatus: 'OFFICIAL_GUIDANCE',
  },
  {
    id: 'supervision-dsb-fire-safety',
    title: 'Brann- og elsikkerhet i virksomheten',
    responsibleAgency: 'Direktoratet for samfunnssikkerhet og beredskap',
    description: 'Et mulig tilsynstema om forebyggende sikkerhet, rutiner og dokumentasjon. Dette kortet er en illustrasjon av hvordan etatsspesifikke kilder kan kobles på.',
    topics: ['Risiko', 'Beredskap', 'Internkontroll', 'Dokumentasjon'],
    targetCriteria: ['Virksomhet i offentlig eller privat sektor'],
    relevanceReasons: [],
    missingInformation: ['Byggets bruksformål', 'Eventuelle tillatelser og meldepliktige anlegg'],
    relatedObligationIds: [],
    sourceLinks: ['source-dsb-fast'],
    officialStatus: 'UNDER_REVIEW',
  },
];

const hasIndustryFamily = (organization: Organization, family: string) => organization.industryCodes.some((code) => code.startsWith(family));

export function matchSupervisionThemes(organization: Organization): SupervisionTheme[] {
  return mockSupervisionThemes.map((theme) => {
    const reasons: string[] = [];
    const missingInformation = [...theme.missingInformation];
    if (theme.id === 'supervision-arbeidstilsynet-hms' && organization.hasEmployees === true) reasons.push('Virksomheten har ansatte.');
    if (theme.id === 'supervision-mattilsynet-servering' && (hasIndustryFamily(organization, '47') || hasIndustryFamily(organization, '56'))) reasons.push('Næringskoden viser handel eller servering.');
    if (theme.id === 'supervision-dsb-fire-safety') reasons.push('Temaet kan være relevant for de fleste virksomheter, men konkrete krav må avklares.');
    if (organization.hasEmployees === undefined && theme.id === 'supervision-arbeidstilsynet-hms') missingInformation.push('Om virksomheten har ansatte.');
    return { ...theme, relevanceReasons: reasons, missingInformation: [...new Set(missingInformation)] };
  });
}
