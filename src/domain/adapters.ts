import type {
  ChatAnswer,
  Concept,
  Obligation,
  Organization,
  OrganizationUserInput,
  Source,
  TrustLevel,
  UserReportedRequirement,
} from './types.js';

export interface OrganizationAdapter {
  findByOrgNumber(orgNumber: string): Promise<Organization | null>;
  searchByName(name: string, limit?: number): Promise<Organization[]>;
}

export interface ObligationAdapter {
  listForOrganization(org: Organization): Promise<Obligation[]>;
}

export interface SourceAdapter {
  search(query: string): Promise<Source[]>;
  getByIds(ids: string[]): Promise<Source[]>;
}

export interface ConceptAdapter {
  search(query: string, limit?: number): Promise<Concept[]>;
  getById(id: string): Promise<Concept | null>;
  getByUri(uri: string): Promise<Concept | null>;
}

export interface RequirementAdapter {
  list(): Promise<UserReportedRequirement[]>;
  create(input: Omit<UserReportedRequirement, 'id' | 'createdAt' | 'updatedAt'>): Promise<UserReportedRequirement>;
  updateStatus(id: string, reviewStatus: UserReportedRequirement['reviewStatus']): Promise<UserReportedRequirement | null>;
}

/**
 * Evidence selected by the application for one answer request.
 * This is deliberately provider-neutral: an LLM adapter must not decide what
 * counts as an official source by itself.
 */
export interface KnowledgeContextItem {
  id: string;
  title: string;
  text: string;
  trustLevel: TrustLevel;
  sourceId?: string;
}

export interface ChatContext {
  organization: Organization;
  obligations: Obligation[];
  sources: Source[];
  reportedRequirements?: UserReportedRequirement[];
  /** User-provided organization information; never equivalent to official register data. */
  userInputs?: OrganizationUserInput[];
  /** Reserved for future retrieval from DuckDB/Parquet or a knowledge index. */
  additionalContext?: KnowledgeContextItem[];
}

export interface ChatAdapter {
  answer(question: string, context: ChatContext): Promise<ChatAnswer>;
}
