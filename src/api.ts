import type { ChatAnswer, Obligation, Organization, Source, UserReportedRequirement } from './domain/types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) }, ...init });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.message ?? 'Noe gikk galt');
  return response.json() as Promise<T>;
}

export const api = {
  organization: (orgNumber: string) => request<Organization>(`/api/organizations/${orgNumber}`),
  obligations: (orgNumber: string) => request<Obligation[]>(`/api/organizations/${orgNumber}/obligations`),
  sources: (query = '') => request<Source[]>(`/api/sources?q=${encodeURIComponent(query)}`),
  reports: () => request<UserReportedRequirement[]>('/api/reported-requirements'),
  createReport: (input: Partial<UserReportedRequirement>) => request<UserReportedRequirement>('/api/reported-requirements', { method: 'POST', body: JSON.stringify(input) }),
  updateReport: (id: string, reviewStatus: UserReportedRequirement['reviewStatus']) => request<UserReportedRequirement>(`/api/reported-requirements/${id}`, { method: 'PATCH', body: JSON.stringify({ reviewStatus }) }),
  chat: (question: string, orgNumber: string) => request<ChatAnswer>('/api/chat', { method: 'POST', body: JSON.stringify({ question, orgNumber }) }),
};
