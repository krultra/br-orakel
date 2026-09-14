import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import type { DemoUser, TaskPreference, UserRole } from '../src/domain/types.js';

interface StoredUser extends DemoUser {
  passwordHash: string;
}

interface StoreFile {
  users: StoredUser[];
  taskPreferences: TaskPreference[];
}

const emptyStore = (): StoreFile => ({ users: [], taskPreferences: [] });

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
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await mkdir(path.dirname(this.filePath), { recursive: true });
      this.data = emptyStore();
    }

    const seededUsername = process.env.DEMO_CASEWORKER_USERNAME ?? 'br-saksbehandler';
    if (!this.data.users.some((user) => user.username === seededUsername)) {
      this.data.users.push({
        id: randomUUID(),
        username: seededUsername,
        displayName: 'BR Saksbehandler',
        role: 'caseworker',
        organizationNumbers: [],
        passwordHash: hashPassword(process.env.DEMO_CASEWORKER_PASSWORD ?? 'demo'),
      });
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

  async savePreference(userId: string, preference: TaskPreference): Promise<TaskPreference> {
    const savedPreference = { ...preference, userId };
    const index = this.data.taskPreferences.findIndex((item) => item.userId === userId && item.orgNumber === preference.orgNumber && item.obligationId === preference.obligationId);
    if (index >= 0) this.data.taskPreferences[index] = savedPreference;
    else this.data.taskPreferences.push(savedPreference);
    await this.persist();
    return savedPreference;
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
