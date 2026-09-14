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
  | 'ready'
  | 'submitted'
  | 'completed'
  | 'not_applicable'
  | 'needs_clarification';

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
  hiddenUntil?: string;
  hiddenForever?: boolean;
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
  hasEmployees: boolean;
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
  format?: 'json' | 'csv' | 'jsonl';
}
