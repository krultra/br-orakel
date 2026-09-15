import type { SupervisionAdapter } from '../domain/adapters.js';
import type { Organization, SupervisionTheme } from '../domain/types.js';
import { matchSupervisionThemes } from './mock-supervision.js';

export class MockSupervisionAdapter implements SupervisionAdapter {
  async listForOrganization(organization: Organization): Promise<SupervisionTheme[]> {
    return structuredClone(matchSupervisionThemes(organization));
  }
}
