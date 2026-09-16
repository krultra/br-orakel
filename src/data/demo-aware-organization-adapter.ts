import type { OrganizationAdapter } from '../domain/adapters.js';
import type { Organization } from '../domain/types.js';

const DEMO_ORGANIZATION_NUMBER = '999999999';

/**
 * Keeps the reserved demo organization available in live deployments while
 * delegating every other organization lookup to the configured live source.
 * Live errors are intentionally not converted to mock results.
 */
export class DemoAwareOrganizationAdapter implements OrganizationAdapter {
  constructor(
    private readonly live: OrganizationAdapter,
    private readonly demo: OrganizationAdapter,
  ) {}

  async findByOrgNumber(orgNumber: string): Promise<Organization | null> {
    const normalized = orgNumber.replace(/\s/g, '');
    if (normalized === DEMO_ORGANIZATION_NUMBER) return this.demo.findByOrgNumber(normalized);
    return this.live.findByOrgNumber(orgNumber);
  }

  async searchByName(name: string, limit = 10): Promise<Organization[]> {
    const demoResults = await this.demo.searchByName(name, limit);
    if (demoResults.length > 0) return demoResults;
    return this.live.searchByName(name, limit);
  }
}
