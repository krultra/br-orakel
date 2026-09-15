import type { ChatAnswer, ChatExchange, ChatFeedback, ChatShareProposal, ContributionSummary, DemoUser, Obligation, Organization, OrganizationProfile, OrganizationViewPreference, OrganizationUserInput, Source, TaskPreference, TaskPreferenceUpdate, UserReportedRequirement } from './domain/types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) }, ...init });
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
  organizationViewPreference: (orgNumber: string) => request<OrganizationViewPreference>(`/api/organizations/${orgNumber}/view-preference`),
  saveOrganizationViewPreference: (orgNumber: string, mutedBefore?: string) => request<OrganizationViewPreference>(`/api/organizations/${orgNumber}/view-preference`, { method: 'PUT', body: JSON.stringify({ mutedBefore: mutedBefore || null }) }),
  organizationProfile: (orgNumber: string) => request<OrganizationProfile>(`/api/organizations/${orgNumber}/profile`),
  saveOrganizationProfile: (orgNumber: string, inputs: OrganizationUserInput[]) => request<OrganizationProfile>(`/api/organizations/${orgNumber}/profile`, { method: 'PUT', body: JSON.stringify({ inputs }) }),
  chatHistory: (orgNumber: string, query = '') => request<ChatExchange[]>(`/api/chat/history?orgNumber=${encodeURIComponent(orgNumber)}&q=${encodeURIComponent(query)}`),
  updateChatFeedback: (id: string, feedback?: ChatFeedback) => request<ChatExchange>(`/api/chat/history/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ feedback }) }),
  updateChatShare: (id: string, share: ChatShareProposal) => request<ChatExchange>(`/api/chat/history/${encodeURIComponent(id)}/share`, { method: 'PATCH', body: JSON.stringify(share) }),
  deleteChatExchange: (id: string) => request<{ ok: true }>(`/api/chat/history/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  contributionSummary: () => request<ContributionSummary>('/api/me/contributions'),
  createFeedback: (message: string) => request<{ id: string; createdAt: string }>('/api/feedback', { method: 'POST', body: JSON.stringify({ message }) }),
  sources: (query = '', orgNumber?: string) => request<Source[]>(`/api/sources?q=${encodeURIComponent(query)}${orgNumber ? `&orgNumber=${encodeURIComponent(orgNumber)}` : ''}`),
  reports: () => request<UserReportedRequirement[]>('/api/reported-requirements'),
  createReport: (input: Partial<UserReportedRequirement>) => request<UserReportedRequirement>('/api/reported-requirements', { method: 'POST', body: JSON.stringify(input) }),
  updateReport: (id: string, reviewStatus: UserReportedRequirement['reviewStatus']) => request<UserReportedRequirement>(`/api/reported-requirements/${id}`, { method: 'PATCH', body: JSON.stringify({ reviewStatus }) }),
  taskPreferences: (orgNumber: string) => request<TaskPreference[]>(`/api/organizations/${orgNumber}/task-preferences`),
  activateAllMuted: (orgNumber: string) => request<{ changed: number }>(`/api/organizations/${orgNumber}/task-preferences/activate-muted`, { method: 'POST' }),
  saveTaskPreference: (orgNumber: string, obligationId: string, preference: TaskPreferenceUpdate) => request<TaskPreference>(`/api/organizations/${orgNumber}/task-preferences/${encodeURIComponent(obligationId)}`, { method: 'PUT', body: JSON.stringify(preference) }),
  chat: (question: string, orgNumber: string, signal?: AbortSignal) => request<ChatAnswer>('/api/chat', { method: 'POST', body: JSON.stringify({ question, orgNumber }), signal }),
};
