import type { ChatAnswer, Obligation, Organization, Source, UserReportedRequirement } from './types.js';

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

export interface ChatAdapter {
  answer(question: string, org: Organization, obligations: Obligation[]): Promise<ChatAnswer>;
}
