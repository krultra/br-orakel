import type { RequirementAdapter } from '../src/domain/adapters.js';
import type { UserReportedRequirement } from '../src/domain/types.js';
import { mockReports } from '../src/data/mock-data.js';
import { DemoStore } from './demo-store.js';

export class DemoRequirementAdapter implements RequirementAdapter {
  constructor(private readonly store: DemoStore) {}

  async init(): Promise<void> {
    await this.store.seedReportedRequirements(mockReports);
  }

  async list(): Promise<UserReportedRequirement[]> {
    return this.store.reportedRequirements();
  }

  async create(input: Omit<UserReportedRequirement, 'id' | 'createdAt' | 'updatedAt'>): Promise<UserReportedRequirement> {
    return this.store.createReportedRequirement(input);
  }

  async updateStatus(id: string, reviewStatus: UserReportedRequirement['reviewStatus'], review?: { reviewedBy: string; reviewedByName: string; note: string }): Promise<UserReportedRequirement | null> {
    return this.store.updateReportedRequirement(id, reviewStatus, review);
  }

  async dispatch(id: string, input: { targetAgency: string; targetCaseworker?: string; message: string; dispatchedBy: string; dispatchedByName: string }): Promise<UserReportedRequirement | null> {
    return this.store.dispatchReportedRequirement(id, input);
  }
}
