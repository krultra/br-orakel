import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import type { ChatExchange, ChatFeedback, ChatShareProposal, ContributionEvent, ContributionEventType, ContributionSummary, DemoUser, OrganizationProfile, OrganizationUserInput, OrganizationViewPreference, ProductFeedback, TaskPreference, UserRole } from '../src/domain/types.js';

interface StoredUser extends DemoUser {
  passwordHash: string;
}

interface StoreFile {
  users: StoredUser[];
  taskPreferences: TaskPreference[];
  organizationViewPreferences: OrganizationViewPreference[];
  organizationProfiles: OrganizationProfile[];
  chatExchanges: ChatExchange[];
  contributionEvents: ContributionEvent[];
  productFeedback: ProductFeedback[];
}

const emptyStore = (): StoreFile => ({ users: [], taskPreferences: [], organizationViewPreferences: [], organizationProfiles: [], chatExchanges: [], contributionEvents: [], productFeedback: [] });

const seededCaseworkers = () => [
  {
    username: process.env.DEMO_CASEWORKER_USERNAME ?? 'br-saksbehandler',
    displayName: 'BR Saksbehandler',
    password: process.env.DEMO_CASEWORKER_PASSWORD ?? 'demo',
  },
  {
    username: process.env.DEMO_CASEWORKER_REVIEWER_USERNAME ?? 'br-kvalitet',
    displayName: 'BR Kvalitetssikrer',
    password: process.env.DEMO_CASEWORKER_REVIEWER_PASSWORD ?? 'demo',
  },
];

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;
}

function verifyPassword(password: string, encoded: string): boolean {
  const [, salt, expectedHex] = encoded.split('$');
  if (!salt || !expectedHex) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export class DemoStore {
  private data: StoreFile = emptyStore();
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath = path.resolve('data/runtime/demo-store.json')) {}

  async init(): Promise<void> {
    try {
      this.data = JSON.parse(await readFile(this.filePath, 'utf8')) as StoreFile;
      this.data.organizationViewPreferences ??= [];
      this.data.organizationProfiles ??= [];
      this.data.chatExchanges ??= [];
      this.data.contributionEvents ??= [];
      this.data.productFeedback ??= [];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await mkdir(path.dirname(this.filePath), { recursive: true });
      this.data = emptyStore();
    }

    let seededUsersChanged = false;
    for (const seed of seededCaseworkers()) {
      const username = seed.username.trim().toLowerCase();
      const existing = this.data.users.find((user) => user.username.toLowerCase() === username);
      if (existing) {
        // Keep the demo account usable when an older local store created it
        // before roles were added. Do not reset its existing password/data.
        if (existing.role !== 'caseworker') {
          existing.role = 'caseworker';
          seededUsersChanged = true;
        }
        continue;
      }
      this.data.users.push({
        id: randomUUID(),
        username,
        displayName: seed.displayName,
        role: 'caseworker',
        organizationNumbers: [],
        passwordHash: hashPassword(seed.password),
      });
      seededUsersChanged = true;
    }
    if (seededUsersChanged) {
      await this.persist();
    }
  }

  publicUser(user: StoredUser): DemoUser {
    const { passwordHash: _passwordHash, ...publicUser } = user;
    return publicUser;
  }

  findUser(username: string): StoredUser | undefined {
    return this.data.users.find((user) => user.username.toLowerCase() === username.trim().toLowerCase());
  }

  authenticate(username: string, password: string): DemoUser | null {
    const user = this.findUser(username);
    return user && verifyPassword(password, user.passwordHash) ? this.publicUser(user) : null;
  }

  getUser(userId: string): DemoUser | null {
    const user = this.data.users.find((item) => item.id === userId);
    return user ? this.publicUser(user) : null;
  }

  async createUser(input: { username: string; displayName: string; password: string; role?: UserRole }): Promise<DemoUser> {
    const username = input.username.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) throw new Error('Brukernavn må være 3–32 tegn og kan inneholde bokstaver, tall, punktum, bindestrek og understrek.');
    if (input.password.length < 4) throw new Error('Passordet må ha minst fire tegn i demoen.');
    if (this.findUser(username)) throw new Error('Brukernavnet er allerede i bruk.');
    const user: StoredUser = {
      id: randomUUID(),
      username,
      displayName: input.displayName.trim() || username,
      role: input.role === 'caseworker' ? 'caseworker' : 'business',
      organizationNumbers: [],
      passwordHash: hashPassword(input.password),
    };
    this.data.users.push(user);
    await this.persist();
    return this.publicUser(user);
  }

  async addOrganization(userId: string, orgNumber: string): Promise<DemoUser | null> {
    const user = this.data.users.find((item) => item.id === userId);
    if (!user) return null;
    if (!user.organizationNumbers.includes(orgNumber)) user.organizationNumbers.push(orgNumber);
    await this.persist();
    return this.publicUser(user);
  }

  async setLastOrganization(userId: string, orgNumber: string): Promise<DemoUser | null> {
    const user = this.data.users.find((item) => item.id === userId);
    if (!user || !user.organizationNumbers.includes(orgNumber)) return null;
    user.lastOrganizationNumber = orgNumber;
    await this.persist();
    return this.publicUser(user);
  }

  async removeOrganization(userId: string, orgNumber: string): Promise<DemoUser | null> {
    const user = this.data.users.find((item) => item.id === userId);
    if (!user) return null;
    user.organizationNumbers = user.organizationNumbers.filter((item) => item !== orgNumber);
    await this.persist();
    return this.publicUser(user);
  }

  preferences(userId: string, orgNumber: string): TaskPreference[] {
    return this.data.taskPreferences.filter((item) => item.userId === userId && item.orgNumber === orgNumber);
  }

  organizationViewPreference(userId: string, orgNumber: string): OrganizationViewPreference | undefined {
    return this.data.organizationViewPreferences.find((item) => item.userId === userId && item.orgNumber === orgNumber);
  }

  async saveOrganizationViewPreference(userId: string, preference: OrganizationViewPreference): Promise<OrganizationViewPreference> {
    const savedPreference = { ...preference, userId };
    const index = this.data.organizationViewPreferences.findIndex((item) => item.userId === userId && item.orgNumber === preference.orgNumber);
    if (index >= 0) this.data.organizationViewPreferences[index] = savedPreference;
    else this.data.organizationViewPreferences.push(savedPreference);
    await this.persist();
    return savedPreference;
  }

  organizationProfile(userId: string, orgNumber: string): OrganizationProfile {
    return this.data.organizationProfiles.find((item) => item.userId === userId && item.orgNumber === orgNumber)
      ?? { userId, orgNumber, inputs: [] };
  }

  async saveOrganizationProfile(userId: string, orgNumber: string, inputs: OrganizationUserInput[]): Promise<OrganizationProfile> {
    const profile: OrganizationProfile = { userId, orgNumber, inputs };
    const index = this.data.organizationProfiles.findIndex((item) => item.userId === userId && item.orgNumber === orgNumber);
    if (index >= 0) this.data.organizationProfiles[index] = profile;
    else this.data.organizationProfiles.push(profile);
    await this.persist();
    return profile;
  }

  chatExchanges(userId: string, orgNumber: string, query = ''): ChatExchange[] {
    const normalizedQuery = query.trim().toLocaleLowerCase('nb-NO');
    return this.data.chatExchanges
      .filter((item) => item.userId === userId && item.orgNumber === orgNumber)
      .filter((item) => !normalizedQuery || `${item.question} ${item.answer}`.toLocaleLowerCase('nb-NO').includes(normalizedQuery))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  chatExchange(userId: string, exchangeId: string): ChatExchange | null {
    return this.data.chatExchanges.find((item) => item.userId === userId && item.id === exchangeId) ?? null;
  }

  async saveChatExchange(exchange: Omit<ChatExchange, 'id'>): Promise<ChatExchange> {
    const savedExchange: ChatExchange = { ...exchange, id: randomUUID() };
    this.data.chatExchanges.push(savedExchange);
    await this.persist();
    return savedExchange;
  }

  async updateChatFeedback(userId: string, exchangeId: string, feedback: ChatFeedback | undefined): Promise<ChatExchange | null> {
    const exchange = this.data.chatExchanges.find((item) => item.id === exchangeId && item.userId === userId);
    if (!exchange) return null;
    const wasUseful = exchange.feedback === 'useful';
    exchange.feedback = feedback;
    if (feedback === 'useful' && !wasUseful) {
      await this.addContributionEvent(userId, { type: 'useful_answer', points: 1, referenceId: exchange.id, description: 'Ga nyttig tilbakemelding på et los-svar.' });
      if (!exchange.share || exchange.share.status === 'withdrawn') exchange.share = { status: 'proposed' };
    }
    await this.persist();
    return exchange;
  }

  async updateChatShare(userId: string, exchangeId: string, share: ChatShareProposal): Promise<ChatExchange | null> {
    const exchange = this.data.chatExchanges.find((item) => item.id === exchangeId && item.userId === userId);
    if (!exchange || exchange.feedback !== 'useful') return null;
    const wasConsented = exchange.share?.status === 'consented';
    exchange.share = share;
    if (share.status === 'consented' && !wasConsented) {
      await this.addContributionEvent(userId, { type: 'faq_contribution', points: 5, referenceId: exchange.id, description: 'Samtykket til at et anonymisert los-svar kan vurderes som FAQ-bidrag.' });
    }
    await this.persist();
    return exchange;
  }

  async addContributionEvent(userId: string, input: { type: ContributionEventType; points: number; referenceId?: string; description: string }): Promise<ContributionEvent> {
    const existing = this.data.contributionEvents.find((event) => event.userId === userId && event.type === input.type && event.referenceId && input.referenceId && event.referenceId === input.referenceId);
    if (existing) return existing;
    const event: ContributionEvent = { ...input, id: randomUUID(), userId, createdAt: new Date().toISOString() };
    this.data.contributionEvents.push(event);
    await this.persist();
    return event;
  }

  contributionSummary(userId: string): ContributionSummary {
    const events = this.data.contributionEvents.filter((event) => event.userId === userId).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const points = events.reduce((sum, event) => sum + event.points, 0);
    const levels: Array<{ level: ContributionSummary['level']; threshold: number }> = [
      { level: 'Lokal bidragsyter', threshold: 0 },
      { level: 'Lokal skjemaguide', threshold: 10 },
      { level: 'Lokal skjemaguru', threshold: 30 },
    ];
    const current = [...levels].reverse().find((item) => points >= item.threshold) ?? levels[0];
    const next = levels.find((item) => item.threshold > points);
    return {
      points,
      level: current.level,
      ...(next ? { nextLevel: next.level, pointsToNextLevel: next.threshold - points } : {}),
      events: events.slice(0, 20),
    };
  }

  async saveProductFeedback(userId: string, message: string): Promise<ProductFeedback> {
    const feedback: ProductFeedback = { id: randomUUID(), userId, message: message.trim().slice(0, 4000), createdAt: new Date().toISOString() };
    this.data.productFeedback.push(feedback);
    await this.persist();
    await this.addContributionEvent(userId, { type: 'feedback_submitted', points: 2, referenceId: feedback.id, description: 'Sendte inn et forbedringsforslag til ORaKeL.' });
    return feedback;
  }

  async deleteChatExchange(userId: string, exchangeId: string): Promise<boolean> {
    const before = this.data.chatExchanges.length;
    this.data.chatExchanges = this.data.chatExchanges.filter((item) => !(item.id === exchangeId && item.userId === userId));
    if (this.data.chatExchanges.length === before) return false;
    await this.persist();
    return true;
  }

  async savePreference(userId: string, preference: TaskPreference): Promise<TaskPreference> {
    const savedPreference = { ...preference, userId };
    const index = this.data.taskPreferences.findIndex((item) => item.userId === userId && item.orgNumber === preference.orgNumber && item.obligationId === preference.obligationId);
    if (index >= 0) this.data.taskPreferences[index] = savedPreference;
    else this.data.taskPreferences.push(savedPreference);
    await this.persist();
    return savedPreference;
  }

  async activateAllMuted(userId: string, orgNumber: string): Promise<number> {
    let changed = 0;
    for (const preference of this.data.taskPreferences) {
      if (preference.userId !== userId || preference.orgNumber !== orgNumber) continue;
      if (!preference.muted && !preference.mutedUntil && !preference.mutedBefore) continue;
      preference.muted = false;
      preference.mutedUntil = undefined;
      preference.mutedBefore = undefined;
      changed += 1;
    }
    const organizationPreference = this.organizationViewPreference(userId, orgNumber);
    if (organizationPreference?.mutedBefore) {
      organizationPreference.mutedBefore = undefined;
      changed += 1;
    }
    if (changed > 0) await this.persist();
    return changed;
  }

  private async persist(): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      await writeFile(this.filePath, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    });
    await this.writeQueue;
  }
}

export { hashPassword, verifyPassword };
