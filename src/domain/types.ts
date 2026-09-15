export type TrustLevel =
  | 'OFFICIAL'
  | 'OFFICIAL_GUIDANCE'
  | 'USER_REPORTED'
  | 'AI_SUGGESTION'
  | 'UNDER_REVIEW'
  | 'CONFIRMED'
  | 'REJECTED';

export type SourceAuthority = 'AUTHORITATIVE' | 'OFFICIAL_GUIDANCE' | 'DISCOVERY' | 'UNVERIFIED';

export type TaskStatus =
  | 'not_started'
  | 'in_progress'
  | 'completed';

export type SubmissionMode = 'manual' | 'system' | 'unknown';
export type CompletionSource = 'user' | 'system' | 'rule' | 'unknown';
export type AutomaticCompletionPolicy = 'none' | 'after_deadline';

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
  /** User-local demping; this is separate from hiding and worklist membership. */
  muted?: boolean;
  mutedUntil?: string;
  /** User-local cutoff: recurring occurrences before this date are shown muted. */
  mutedBefore?: string;
}

export interface TaskPreferenceUpdate extends Partial<TaskPreference> {
  /** The occurrence being edited; omitted for whole-obligation changes. */
  occurrenceDate?: string;
  hiddenScope?: 'instance' | 'all';
}

export interface OrganizationViewPreference {
  userId: string;
  orgNumber: string;
  /** User-local cutoff that mutes historical occurrences across the catalogue. */
  mutedBefore?: string;
}

export type OrganizationFieldStatus = 'OFFICIAL' | 'USER_INPUT' | 'USER_SUGGESTION' | 'UNKNOWN';
export type OrganizationUserInputStatus = Extract<OrganizationFieldStatus, 'USER_INPUT' | 'USER_SUGGESTION'>;

export interface OrganizationUserInput {
  id: string;
  label: string;
  value: string;
  status: OrganizationUserInputStatus;
  updatedAt: string;
}

export interface OrganizationProfile {
  userId: string;
  orgNumber: string;
  inputs: OrganizationUserInput[];
}

export interface Source {
  id: string;
  title: string;
  url: string;
  sourceType: 'register' | 'guidance' | 'law' | 'dataset';
  officiality: TrustLevel;
  /** Policy classification based on the approved source catalogue. */
  authority?: SourceAuthority;
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
  /** Years for which the public Register of Annual Accounts exposes a filing. */
  submittedAnnualAccountYears?: number[];
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
  /** User-local demping; official obligation data remains unchanged. */
  isMuted?: boolean;
  mutedUntil?: string;
  /** User-local cutoff for muting historical recurring occurrences. */
  mutedBefore?: string;
  /** User-local organization-wide cutoff for muting historical occurrences. */
  organizationMutedBefore?: string;
  /** User-local adjustments, kept separate from official obligation fields. */
  localDeadline?: string;
  localComment?: string;
  /** How the report is normally submitted. */
  submissionMode?: SubmissionMode;
  /** How the displayed completion state was established. */
  completionSource?: CompletionSource;
  /** Rule for deriving completion when a system submission receipt is unavailable. */
  automaticCompletionPolicy?: AutomaticCompletionPolicy;
  /** Derived system completion by occurrence; never written as user preference. */
  automaticStatusByDate?: Record<string, TaskStatus>;
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
  /** Set by the application after a successful answer is stored. */
  exchangeId?: string;
}

export type ChatFeedback = 'useful' | 'not_useful';

export interface ChatExchangeSource {
  id: string;
  title: string;
  url: string;
  officiality: TrustLevel;
  authority?: SourceAuthority;
  retrievedAt: string;
  relevantExcerpt: string;
}

export interface ChatExchange {
  id: string;
  userId: string;
  orgNumber: string;
  question: string;
  answer: string;
  uncertainty: string;
  sourceIds: string[];
  sources: ChatExchangeSource[];
  followUpQuestions: string[];
  feedback?: ChatFeedback;
  createdAt: string;
}

export interface DatasetImportOptions {
  input: string;
  output: string;
  orgNumber?: string;
  format?: 'json' | 'csv' | 'jsonl' | 'parquet';
}
