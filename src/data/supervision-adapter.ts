import type { SupervisionAdapter } from '../domain/adapters.js';
import type { Organization, SupervisionNotice, SupervisionTheme } from '../domain/types.js';
import { matchSupervisionThemes } from './mock-supervision.js';

export interface SupervisionNoticeRepository {
  supervisionNotices(orgNumber: string): SupervisionNotice[];
  createSupervisionNotice(input: Omit<SupervisionNotice, 'id'>): Promise<SupervisionNotice>;
}

export class MockSupervisionAdapter implements SupervisionAdapter {
  constructor(private readonly noticeRepository?: SupervisionNoticeRepository) {}

  async listForOrganization(organization: Organization): Promise<SupervisionTheme[]> {
    return structuredClone(matchSupervisionThemes(organization));
  }

  async listNotices(orgNumber: string): Promise<SupervisionNotice[]> {
    return this.noticeRepository?.supervisionNotices(orgNumber) ?? [];
  }

  async createNotice(orgNumber: string, input: Omit<SupervisionNotice, 'id' | 'organizationNumber' | 'trustLevel'>): Promise<SupervisionNotice> {
    const notice: Omit<SupervisionNotice, 'id'> = { ...input, organizationNumber: orgNumber, trustLevel: 'USER_REPORTED' };
    return this.noticeRepository?.createSupervisionNotice(notice) ?? { ...notice, id: `notice-${Date.now()}` };
  }
}
