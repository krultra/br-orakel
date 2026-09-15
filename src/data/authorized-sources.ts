import type { Source, SourceAuthority } from '../domain/types.js';

export interface AuthorizedSourceDomain {
  domain: string;
  authority: Exclude<SourceAuthority, 'UNVERIFIED'>;
  owner: string;
  rationale: string;
}

/**
 * Small, explicit first version of the source policy. Subdomains are covered,
 * but lookalike domains are not. The list is application data so it can later
 * be replaced by a maintained admin catalogue without changing prompt logic.
 */
export const authorizedSourceDomains: AuthorizedSourceDomain[] = [
  { domain: 'brreg.no', authority: 'AUTHORITATIVE', owner: 'Brønnøysundregistrene', rationale: 'Registerdata og Oppgaveregisteret.' },
  { domain: 'lovdata.no', authority: 'AUTHORITATIVE', owner: 'Lovdata', rationale: 'Lov- og forskriftstekster.' },
  { domain: 'stortinget.no', authority: 'AUTHORITATIVE', owner: 'Stortinget', rationale: 'Lovbehandling og offentlige dokumenter.' },
  { domain: 'regjeringen.no', authority: 'AUTHORITATIVE', owner: 'Regjeringen', rationale: 'Offentlige proposisjoner, meldinger og veiledning.' },
  { domain: 'skatteetaten.no', authority: 'OFFICIAL_GUIDANCE', owner: 'Skatteetaten', rationale: 'Skatte- og avgiftsveiledning.' },
  { domain: 'nav.no', authority: 'OFFICIAL_GUIDANCE', owner: 'NAV', rationale: 'Veiledning om ytelser og arbeidsgiveroppfølging.' },
  { domain: 'ssb.no', authority: 'OFFICIAL_GUIDANCE', owner: 'Statistisk sentralbyrå', rationale: 'Offisiell statistikk og rapporteringsveiledning.' },
  { domain: 'digdir.no', authority: 'OFFICIAL_GUIDANCE', owner: 'Digitaliseringsdirektoratet', rationale: 'Digital forvaltning og offentlige fellestjenester.' },
  { domain: 'altinn.no', authority: 'OFFICIAL_GUIDANCE', owner: 'Altinn', rationale: 'Offentlig skjema- og innrapporteringsveiledning.' },
  { domain: 'arbeidstilsynet.no', authority: 'OFFICIAL_GUIDANCE', owner: 'Arbeidstilsynet', rationale: 'Arbeidsgiver- og HMS-veiledning.' },
  { domain: 'mattilsynet.no', authority: 'OFFICIAL_GUIDANCE', owner: 'Mattilsynet', rationale: 'Veiledning for mat- og serveringsvirksomhet.' },
];

function hostnameMatches(hostname: string, domain: string): boolean {
  const normalizedHost = hostname.toLowerCase().replace(/^www\./, '');
  const normalizedDomain = domain.toLowerCase().replace(/^www\./, '');
  return normalizedHost === normalizedDomain || normalizedHost.endsWith(`.${normalizedDomain}`);
}

export function classifySourceUrl(url: string): SourceAuthority {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return 'UNVERIFIED';
    return authorizedSourceDomains.find((item) => hostnameMatches(parsed.hostname, item.domain))?.authority ?? 'UNVERIFIED';
  } catch {
    return 'UNVERIFIED';
  }
}

export function isAuthorizedSourceUrl(url: string): boolean {
  const authority = classifySourceUrl(url);
  return authority === 'AUTHORITATIVE' || authority === 'OFFICIAL_GUIDANCE';
}

export function withSourceAuthority(source: Source): Source {
  return { ...source, authority: source.authority ?? classifySourceUrl(source.url) };
}
