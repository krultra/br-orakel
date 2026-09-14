import type { ChatAnswer, DemoUser, Obligation, Organization, Source, TaskPreference, UserReportedRequirement } from './domain/types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) }, ...init });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.message ?? 'Noe gikk galt');
  return response.json() as Promise<T>;
}

export const api = {
  health: () => request<{ organizationProvider: 'live' | 'mock'; aiProvider: string }>('/api/health'),
  me: () => request<DemoUser>('/api/auth/me'),
  login: (username: string, password: string) => request<DemoUser>('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  register: (username: string, displayName: string, password: string) => request<DemoUser>('/api/auth/register', { method: 'POST', body: JSON.stringify({ username, displayName, password }) }),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  myOrganizations: () => request<Organization[]>('/api/me/organizations'),
  addMyOrganization: (orgNumber: string) => request<DemoUser>('/api/me/organizations', { method: 'POST', body: JSON.stringify({ orgNumber }) }),
  removeMyOrganization: (orgNumber: string) => request<DemoUser>(`/api/me/organizations/${encodeURIComponent(orgNumber)}`, { method: 'DELETE' }),
  organization: (orgNumber: string) => request<Organization>(`/api/organizations/${orgNumber}`),
  searchOrganizations: (query: string) => request<Organization[]>(`/api/organizations/search?q=${encodeURIComponent(query)}`),
  obligations: (orgNumber: string) => request<Obligation[]>(`/api/organizations/${orgNumber}/obligations`),
  sources: (query = '', orgNumber?: string) => request<Source[]>(`/api/sources?q=${encodeURIComponent(query)}${orgNumber ? `&orgNumber=${encodeURIComponent(orgNumber)}` : ''}`),
  reports: () => request<UserReportedRequirement[]>('/api/reported-requirements'),
  createReport: (input: Partial<UserReportedRequirement>) => request<UserReportedRequirement>('/api/reported-requirements', { method: 'POST', body: JSON.stringify(input) }),
  updateReport: (id: string, reviewStatus: UserReportedRequirement['reviewStatus']) => request<UserReportedRequirement>(`/api/reported-requirements/${id}`, { method: 'PATCH', body: JSON.stringify({ reviewStatus }) }),
  taskPreferences: (orgNumber: string) => request<TaskPreference[]>(`/api/organizations/${orgNumber}/task-preferences`),
  saveTaskPreference: (orgNumber: string, obligationId: string, preference: Partial<TaskPreference>) => request<TaskPreference>(`/api/organizations/${orgNumber}/task-preferences/${encodeURIComponent(obligationId)}`, { method: 'PUT', body: JSON.stringify(preference) }),
  chat: (question: string, orgNumber: string) => request<ChatAnswer>('/api/chat', { method: 'POST', body: JSON.stringify({ question, orgNumber }) }),
};
