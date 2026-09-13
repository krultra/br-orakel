import type {
  ChatAnswer,
  Obligation,
  Organization,
  Source,
  TrustLevel,
  UserReportedRequirement,
} from './types.js';

export interface OrganizationAdapter {
  findByOrgNumber(orgNumber: string): Promise<Organization | null>;
}

export interface ObligationAdapter {
  listForOrganization(org: Organization): Promise<Obligation[]>;
}

export interface SourceAdapter {
  search(query: string): Promise<Source[]>;
  getByIds(ids: string[]): Promise<Source[]>;
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
  /** Reserved for future retrieval from DuckDB/Parquet or a knowledge index. */
  additionalContext?: KnowledgeContextItem[];
}

export interface ChatAdapter {
  answer(question: string, context: ChatContext): Promise<ChatAnswer>;
}
