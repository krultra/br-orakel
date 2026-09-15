import type { ChatAdapter, ChatContext, ConceptAdapter, ObligationAdapter, OrganizationAdapter, RequirementAdapter, SourceAdapter } from '../domain/adapters.js';
import type { Concept, Obligation, Organization, Source, UserReportedRequirement } from '../domain/types.js';
import { mockConcepts } from './mock-concepts.js';
import { mockObligations, mockOrganization, mockReports, mockSources } from './mock-data.js';

export class MockOrganizationAdapter implements OrganizationAdapter {
  async findByOrgNumber(orgNumber: string): Promise<Organization | null> {
    return orgNumber.replace(/\s/g, '') === mockOrganization.orgNumber ? structuredClone(mockOrganization) : null;
  }

  async searchByName(name: string, limit = 10): Promise<Organization[]> {
    const normalized = name.trim().toLocaleLowerCase('nb-NO');
    if (!normalized) return [];
    return normalized && mockOrganization.name.toLocaleLowerCase('nb-NO').includes(normalized)
      ? [structuredClone(mockOrganization)].slice(0, Math.max(1, limit))
      : [];
  }
}

export class MockObligationAdapter implements ObligationAdapter {
  async listForOrganization(_org: Organization): Promise<Obligation[]> {
    return structuredClone(mockObligations);
  }
}

export class MockSourceAdapter implements SourceAdapter {
  async search(query: string): Promise<Source[]> {
    const normalized = query.toLowerCase();
    return mockSources.filter((item) => `${item.title} ${item.relevantExcerpt}`.toLowerCase().includes(normalized));
  }

  async getByIds(ids: string[]): Promise<Source[]> {
    return mockSources.filter((item) => ids.includes(item.id));
  }
}

export class MockConceptAdapter implements ConceptAdapter {
  async search(query: string, limit = 10): Promise<Concept[]> {
    const normalized = query.trim().toLocaleLowerCase('nb-NO');
    if (!normalized) return [];
    return mockConcepts
      .filter((concept) => `${concept.term} ${concept.alternativeTerms.join(' ')} ${concept.definition ?? ''} ${concept.subject ?? ''}`.toLocaleLowerCase('nb-NO').includes(normalized))
      .slice(0, Math.max(1, Math.min(limit, 20)))
      .map((concept) => structuredClone(concept));
  }

  async getById(id: string): Promise<Concept | null> {
    const concept = mockConcepts.find((item) => item.id === id);
    return concept ? structuredClone(concept) : null;
  }

  async getByUri(uri: string): Promise<Concept | null> {
    const concept = mockConcepts.find((item) => item.uri === uri);
    return concept ? structuredClone(concept) : null;
  }
}

export class MockRequirementAdapter implements RequirementAdapter {
  private reports = structuredClone(mockReports);

  async list(): Promise<UserReportedRequirement[]> {
    return structuredClone(this.reports);
  }

  async create(input: Omit<UserReportedRequirement, 'id' | 'createdAt' | 'updatedAt'>): Promise<UserReportedRequirement> {
    const now = new Date().toISOString();
    const report: UserReportedRequirement = { ...input, id: `report-${String(this.reports.length + 1).padStart(3, '0')}`, createdAt: now, updatedAt: now };
    this.reports = [report, ...this.reports];
    return structuredClone(report);
  }

  async updateStatus(id: string, reviewStatus: UserReportedRequirement['reviewStatus']): Promise<UserReportedRequirement | null> {
    const report = this.reports.find((item) => item.id === id);
    if (!report) return null;
    report.reviewStatus = reviewStatus;
    report.updatedAt = new Date().toISOString();
    return structuredClone(report);
  }
}

export class MockChatAdapter implements ChatAdapter {
  async answer(question: string, context: ChatContext) {
    const { obligations } = context;
    const normalized = question.toLowerCase();
    const match = normalized.includes('mva') ? obligations.find((item) => item.id === 'obl-mva-termin-4') : normalized.includes('ansatt') || normalized.includes('lønn') ? obligations.find((item) => item.id === 'obl-a-melding') : obligations.find((item) => item.id === 'obl-aarsregnskap');
    const sourceIds = match?.sourceLinks ?? ['source-oppgaveregisteret'];
    return {
      answer: match ? `For denne demo-virksomheten er «${match.name}» lagt inn som ${match.officialStatus === 'OFFICIAL' ? 'offisiell oppgave' : 'veiledende oppfølging'}. ${match.description} Fristen i demoåret er ${match.deadline ?? 'hendelsesutløst'}.` : 'Jeg finner ikke et sikkert svar i mock-kildene ennå. Jeg kan hjelpe med å avgrense spørsmålet mot virksomhetens organisasjonsform, næringskode og arbeidsgiveransvar.',
      uncertainty: 'Dette er et mock-svar. Juridisk vurdering må kontrolleres mot gjeldende kilde og virksomhetens faktiske forhold.',
      sourceIds,
      followUpQuestions: ['Har virksomheten ansatte eller andre som mottar lønn?', 'Er virksomheten registrert i Merverdiavgiftsregisteret?'],
    };
  }
}
