import type { ChatAnswer, Obligation, Organization, Source, UserReportedRequirement } from './domain/types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) }, ...init });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.message ?? 'Noe gikk galt');
  return response.json() as Promise<T>;
}

export const api = {
  health: () => request<{ organizationProvider: 'live' | 'mock'; aiProvider: string }>('/api/health'),
  organization: (orgNumber: string) => request<Organization>(`/api/organizations/${orgNumber}`),
  searchOrganizations: (query: string) => request<Organization[]>(`/api/organizations/search?q=${encodeURIComponent(query)}`),
  obligations: (orgNumber: string) => request<Obligation[]>(`/api/organizations/${orgNumber}/obligations`),
  sources: (query = '', orgNumber?: string) => request<Source[]>(`/api/sources?q=${encodeURIComponent(query)}${orgNumber ? `&orgNumber=${encodeURIComponent(orgNumber)}` : ''}`),
  reports: () => request<UserReportedRequirement[]>('/api/reported-requirements'),
  createReport: (input: Partial<UserReportedRequirement>) => request<UserReportedRequirement>('/api/reported-requirements', { method: 'POST', body: JSON.stringify(input) }),
  updateReport: (id: string, reviewStatus: UserReportedRequirement['reviewStatus']) => request<UserReportedRequirement>(`/api/reported-requirements/${id}`, { method: 'PATCH', body: JSON.stringify({ reviewStatus }) }),
  chat: (question: string, orgNumber: string) => request<ChatAnswer>('/api/chat', { method: 'POST', body: JSON.stringify({ question, orgNumber }) }),
};
