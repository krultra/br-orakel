export type TrustLevel =
  | 'OFFICIAL'
  | 'OFFICIAL_GUIDANCE'
  | 'USER_REPORTED'
  | 'AI_SUGGESTION'
  | 'UNDER_REVIEW'
  | 'CONFIRMED'
  | 'REJECTED';

export type TaskStatus =
  | 'not_started'
  | 'in_progress'
  | 'completed';

export type ObligationTrigger = 'periodic' | 'event';

export type UserRole = 'business' | 'caseworker';

export interface DemoUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  organizationNumbers: string[];
}

export type RecurrenceFrequency = 'monthly' | 'quarterly' | 'yearly';

export interface TaskRecurrence {
  frequency: RecurrenceFrequency;
  interval: number;
  dayOfMonth: number;
  startDate: string;
  endDate?: string;
}

export interface TaskPreference {
  userId: string;
  obligationId: string;
  orgNumber: string;
  activated: boolean;
  comment?: string;
  recurrence?: TaskRecurrence;
  status?: TaskStatus;
  /** User-local status per recurring deadline instance. */
  statusByDate?: Record<string, TaskStatus>;
  /** User-local deadline overrides keyed by the official occurrence date. */
  deadlineByDate?: Record<string, string>;
  /** User-local comments keyed by the official occurrence date. */
  commentByDate?: Record<string, string>;
  /** User-local visibility overrides keyed by the official occurrence date. */
  hiddenByDate?: Record<string, { hiddenUntil?: string; hiddenForever?: boolean }>;
  /** A user-local deadline; official register data must remain unchanged. */
  deadlineOverride?: string | null;
  hiddenUntil?: string;
  hiddenForever?: boolean;
}

export interface TaskPreferenceUpdate extends Partial<TaskPreference> {
  /** The occurrence being edited; omitted for whole-obligation changes. */
  occurrenceDate?: string;
  hiddenScope?: 'instance' | 'all';
}

export interface Source {
  id: string;
  title: string;
  url: string;
  sourceType: 'register' | 'guidance' | 'law' | 'dataset';
  officiality: TrustLevel;
  retrievedAt: string;
  relevantExcerpt: string;
}

export interface Organization {
  orgNumber: string;
  name: string;
  organizationForm: string;
  organizationFormName?: string;
  industryCodes: string[];
  /** Undefined means the selected source does not publish an employee indicator. */
  hasEmployees?: boolean;
  employeeCount?: number;
  registeredInMvaRegister?: boolean;
  registeredInForetaksregister?: boolean;
  municipality: string;
  municipalityNumber?: string;
  parentOrgNumber?: string;
  registrationDate?: string;
  sources: string[];
}

export interface Obligation {
  id: string;
  name: string;
  description: string;
  officialStatus: TrustLevel;
  responsibleAgency: string;
  legalBasis: string;
  targetCriteria: string[];
  reportingWindowStart?: string;
  reportingWindowEnd?: string;
  deadline?: string;
  /** All known recurring deadline dates for the current reporting year. */
  deadlineDates?: string[];
  frequency: string;
  estimatedMinutes: number;
  requiredData: string[];
  attachments: string[];
  sourceLinks: string[];
  reportingForms?: string[];
  status: TaskStatus;
  /** User-local status per recurring deadline instance. */
  statusByDate?: Record<string, TaskStatus>;
  /** User-local deadline overrides keyed by the official occurrence date. */
  deadlineByDate?: Record<string, string>;
  /** User-local comments keyed by the official occurrence date. */
  localCommentByDate?: Record<string, string>;
  /** User-local visibility overrides keyed by the official occurrence date. */
  hiddenByDate?: Record<string, boolean>;
  /** User-local visibility preference; official obligation data remains unchanged. */
  isHidden?: boolean;
  /** User-local membership in the worklist; official obligations stay in the catalogue. */
  isActivated?: boolean;
  /** User-local adjustments, kept separate from official obligation fields. */
  localDeadline?: string;
  localComment?: string;
  trigger: ObligationTrigger;
  eventLabel?: string;
  registerId?: string;
}

export interface UserReportedRequirement {
  id: string;
  title: string;
  description: string;
  reportedBy: string;
  suspectedAgency?: string;
  suspectedLegalBasis?: string;
  targetGroup?: string;
  frequency?: string;
  deadline?: string;
  evidenceLinks: string[];
  aiSuggestions: string[];
  confidence: number;
  reviewStatus: 'new' | 'needs_more_info' | 'forwarded' | 'confirmed' | 'rejected' | 'duplicate';
  createdAt: string;
  updatedAt: string;
}

export interface ChatAnswer {
  answer: string;
  uncertainty: string;
  sourceIds: string[];
  followUpQuestions: string[];
}

export interface DatasetImportOptions {
  input: string;
  output: string;
  orgNumber?: string;
  format?: 'json' | 'csv' | 'jsonl' | 'parquet';
}
