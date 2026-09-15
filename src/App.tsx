import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { AlertCircle, BookOpen, CalendarDays, Check, ChevronLeft, ChevronRight, CircleHelp, Clock3, ExternalLink, EyeOff, FileCheck2, Filter, History, Landmark, Plus, Search, Send, ShieldCheck, Sparkles, ThumbsDown, ThumbsUp, Trash2, UserRound, X } from 'lucide-react';
import { Alert, Button, Card, Heading, Paragraph, Tag, Textarea, Textfield } from '@digdir/designsystemet-react';
import { api } from './api';
import type { ChatAnswer, ChatExchange, ChatFeedback, ChatShareStatus, Concept, ContributionSummary, DemoUser, Obligation, Organization, OrganizationProfile, Source, SupportAward, SupportFollowUp, SupportRegistryResult, SupervisionNotice, SupervisionTheme, TaskStatus, UserReportedRequirement } from './domain/types';
import { buildEventGuides, obligationsForEvent, organizationEventContext, type EventGuide } from './data/event-navigator';
import { conceptQueryForDataElement } from './data/concept-hints';
import { isMutedForDate } from './domain/task-visibility';
import { statusForDate } from './domain/task-status';
import { estimateReportingMinutes } from './domain/reporting-metrics';
import { parseFormattedAnswer } from './format-answer';
import { appEnvironment, appVersion } from './version';
import { InlineConceptText } from './components/InlineConceptText';
import { ConceptLookup } from './components/ConceptLookup';

const slogans = [
  'Fra plikt til flyt',
  'Få orden på rapporteringen',
  'Rett oppgave, rett tid',
  'Se hva som gjelder for virksomheten din',
  'Mindre leting, mer oversikt',
  'Rapporter med ro i magen',
  'Samle pliktene på ett sted',
  'Gjør frister enklere å følge opp',
  'Kunnskap når du trenger den',
  'ORaKeL loser deg gjennom rapporteringen',
];

const statusLabels: Record<TaskStatus, string> = {
  not_started: 'Ikke påbegynt', in_progress: 'Under arbeid', completed: 'Ferdig',
};

const statusClass: Record<TaskStatus, string> = {
  not_started: 'status-neutral', in_progress: 'status-blue', completed: 'status-green',
};

function formatDate(value?: string, includeYear = false) {
  if (!value) return 'Ved hendelse';
  return new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short', ...(includeYear ? { year: 'numeric' } : {}) }).format(new Date(`${value}T12:00:00`));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('nb-NO', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function safeExternalUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

function formatDateInput(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
}

function parseDateInput(value: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return '';
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const candidate = new Date(year, month - 1, day);
  if (candidate.getFullYear() !== year || candidate.getMonth() !== month - 1 || candidate.getDate() !== day) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function effectiveDeadline(obligation: Obligation) {
  return obligation.localDeadline ?? obligation.deadline;
}

const supportFollowUpTypeLabels: Record<SupportFollowUp['taskType'], string> = { apply: 'Søke støtte', clarify: 'Avklare støtte', follow_up: 'Følge opp støtte' };

function supportFollowUpAsObligation(followUp: SupportFollowUp): Obligation {
  const frequency = followUp.recurrence ? ({ monthly: 'Månedlig', quarterly: 'Kvartalsvis', yearly: 'Årlig' } as const)[followUp.recurrence.frequency] : 'Engangsoppgave';
  return {
    id: `support-follow-up:${followUp.id}`,
    name: `${supportFollowUpTypeLabels[followUp.taskType]}: ${followUp.schemeName}`,
    description: `Lokal støtteoppfølging basert på registrert støtte fra ${followUp.providerName}. Dette er et brukerregistrert planleggingspunkt, ikke en bekreftet rettighet eller rapporteringsplikt.`,
    officialStatus: followUp.trustLevel,
    responsibleAgency: followUp.providerName,
    legalBasis: 'Ikke en rapporteringsplikt',
    targetCriteria: [],
    deadline: followUp.deadline ?? followUp.deadlineDates?.[0],
    deadlineDates: followUp.deadlineDates,
    frequency,
    estimatedMinutes: 30,
    requiredData: [],
    attachments: [],
    sourceLinks: [],
    guidanceLinks: followUp.sourceLinks.map((url) => ({ title: `Kilde: ${followUp.schemeName}`, url, sourceLabel: 'Offisiell etat' as const })),
    status: followUp.status,
    localComment: followUp.comment,
    isActivated: true,
    trigger: 'periodic',
    kind: 'support_follow_up',
    supportFollowUpId: followUp.id,
  };
}

function monthStart(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function shiftMonth(value: Date, amount: number) {
  return new Date(value.getFullYear(), value.getMonth() + amount, 1);
}

function dateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function monthName(value: Date) {
  return new Intl.DateTimeFormat('nb-NO', { month: 'short' }).format(value).replace('.', '');
}

function occurrenceDatesForWindow(obligation: Obligation, start: Date, monthCount: number) {
  const windowStart = dateKey(start);
  const windowEnd = dateKey(shiftMonth(start, monthCount));
  const sourceDates = obligation.localDeadline && !obligation.deadlineDates?.length
    ? [obligation.localDeadline]
    : obligation.deadlineDates?.length
      ? obligation.deadlineDates
      : [obligation.reportingWindowStart ?? obligation.deadline].filter((date): date is string => Boolean(date));
  if (!sourceDates.length) return [];
  const dates = new Set<string>();
  for (const sourceDate of sourceDates) {
    const month = Number(sourceDate.slice(5, 7)) - 1;
    const day = Number(sourceDate.slice(8, 10));
    if (!Number.isInteger(month) || !Number.isInteger(day)) continue;
    for (let year = start.getFullYear() - 1; year <= shiftMonth(start, monthCount - 1).getFullYear() + 1; year += 1) {
      const candidate = new Date(year, month, day);
      if (candidate.getFullYear() !== year || candidate.getMonth() !== month || candidate.getDate() !== day) continue;
      const key = dateKey(candidate);
      if (key >= windowStart && key < windowEnd) dates.add(key);
    }
  }
  return [...dates].sort();
}

function occurrenceDeadline(obligation: Obligation, occurrenceDate?: string) {
  return occurrenceDate ? obligation.deadlineByDate?.[occurrenceDate] ?? occurrenceDate : effectiveDeadline(obligation);
}

function occurrenceHidden(obligation: Obligation, occurrenceDate?: string) {
  return occurrenceDate ? obligation.isHidden === true || obligation.hiddenByDate?.[occurrenceDate] === true : obligation.isHidden === true;
}

function isAutomated(obligation: Obligation) {
  return obligation.submissionMode === 'system';
}

function itemStatusForDate(obligation: Obligation, date?: string) {
  if (date && obligation.statusByDate && Object.prototype.hasOwnProperty.call(obligation.statusByDate, date)) {
    return statusForDate(obligation.status, date, obligation.statusByDate);
  }
  return date && obligation.automaticStatusByDate?.[date]
    ? obligation.automaticStatusByDate[date]
    : statusForDate(obligation.status, date, obligation.statusByDate);
}

type DeadlineState = 'none' | 'normal' | 'soon' | 'overdue' | 'completed';

function deadlineState(status: TaskStatus, date?: string, automated = false): DeadlineState {
  if (!date) return 'none';
  if (status === 'completed') return 'completed';
  if (automated) return 'normal';
  const today = monthStart(new Date());
  const target = new Date(`${date}T12:00:00`);
  const days = Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return 'overdue';
  if (days <= 14) return 'soon';
  return 'normal';
}

function deadlineStateLabel(state: DeadlineState) {
  return ({ none: '', normal: '', soon: 'Nær frist', overdue: 'Forfalt', completed: 'Levert' } as Record<DeadlineState, string>)[state];
}

function automationLabel(obligation: Obligation) {
  return isAutomated(obligation) ? 'Systeminnsending' : '';
}

function isCurrentMonth(value: Date) {
  const now = new Date();
  return value.getFullYear() === now.getFullYear() && value.getMonth() === now.getMonth();
}

function isEventLike(obligation: Obligation) {
  return obligation.trigger === 'event' || (!obligation.deadline && !obligation.deadlineDates?.length && !obligation.localDeadline);
}

function eventCategory(obligation: Obligation) {
  return obligation.eventLabel && !/^\(beskrives\)$/i.test(obligation.eventLabel.trim()) ? obligation.eventLabel : 'Hendelse ikke spesifisert';
}

function FormattedAnswer({ text }: { text: string }) {
  const inline = (value: string): ReactNode[] => value.split(/(\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_)/g).filter(Boolean).map((part, index) => {
    if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) return <em key={index}>{part.slice(1, -1)}</em>;
    return <span key={index}>{part}</span>;
  });
  return <div className="formatted-answer">{parseFormattedAnswer(text).map((block, index) => {
    if (block.kind === 'paragraph') return <p key={`paragraph-${index}`}>{inline(block.text)}</p>;
    if (block.kind === 'heading') { const HeadingTag = (`h${Math.min(6, block.level + 3)}`) as 'h4' | 'h5' | 'h6'; return <HeadingTag key={`heading-${index}`}>{inline(block.text)}</HeadingTag>; }
    if (block.kind === 'ordered') return <ol key={`ordered-${index}`}>{block.items.map((item, itemIndex) => <li key={`${index}-${itemIndex}`}>{inline(item)}</li>)}</ol>;
    return <ul key={`unordered-${index}`}>{block.items.map((item, itemIndex) => <li key={`${index}-${itemIndex}`}>{inline(item)}</li>)}</ul>;
  })}</div>;
}

function TrustLabel({ level }: { level: string }) {
  const labels: Record<string, string> = { OFFICIAL: 'Offisiell oppgave', OFFICIAL_GUIDANCE: 'Offisiell veiledning', USER_REPORTED: 'Brukerinnspill', AI_SUGGESTION: 'KI-forslag', UNDER_REVIEW: 'Under vurdering' };
  return <span className={`trust trust-${level.toLowerCase()}`}><ShieldCheck size={14} /> {labels[level] ?? level}</span>;
}

function sourceAuthorityLabel(authority?: Source['authority']) {
  return ({ AUTHORITATIVE: 'Autoritativ kilde', OFFICIAL_GUIDANCE: 'Offisiell veiledning', DISCOVERY: 'Oppdagelseskilde', UNVERIFIED: 'Ikke verifisert' } as Record<string, string>)[authority ?? 'UNVERIFIED'];
}

function App() {
  const [user, setUser] = useState<DemoUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [orgNumber, setOrgNumber] = useState('');
  const [savedOrganizations, setSavedOrganizations] = useState<Organization[]>([]);
  const [organizationSearchResults, setOrganizationSearchResults] = useState<Organization[]>([]);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [organizationProfile, setOrganizationProfile] = useState<OrganizationProfile | null>(null);
  const [organizationMutedBefore, setOrganizationMutedBefore] = useState('');
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [supervisionThemes, setSupervisionThemes] = useState<SupervisionTheme[]>([]);
  const [supervisionNotices, setSupervisionNotices] = useState<SupervisionNotice[]>([]);
  const [supportFollowUps, setSupportFollowUps] = useState<SupportFollowUp[]>([]);
  const [reports, setReports] = useState<UserReportedRequirement[]>([]);
  const [selectedObligationId, setSelectedObligationId] = useState<string | null>(null);
  const [selectedOccurrenceDate, setSelectedOccurrenceDate] = useState<string | null>(null);
  const [view, setView] = useState<'overview' | 'admin'>('overview');
  const [calendarMode, setCalendarMode] = useState<'year' | 'list'>('year');
  const [calendarStart, setCalendarStart] = useState(() => shiftMonth(monthStart(new Date()), -3));
  const [statusFilter, setStatusFilter] = useState<'all' | TaskStatus>('all');
  const [visibilityFilter, setVisibilityFilter] = useState<'visible' | 'hidden' | 'muted' | 'all'>('visible');
  const [loading, setLoading] = useState(false);
  const [searchingOrganizations, setSearchingOrganizations] = useState(false);
  const [toast, setToast] = useState('');
  const [showOrganizationProfile, setShowOrganizationProfile] = useState(false);
  const [showOrganizationChooser, setShowOrganizationChooser] = useState(false);
  const [contributionSummary, setContributionSummary] = useState<ContributionSummary | null>(null);
  const [contributionNotice, setContributionNotice] = useState<{ summary: ContributionSummary; points: number; action: string } | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [sloganIndex, setSloganIndex] = useState(0);
  const [chatPrompt, setChatPrompt] = useState('');
  const [chatPromptConceptId, setChatPromptConceptId] = useState<string | undefined>();
  const [chatOpenRequest, setChatOpenRequest] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setSloganIndex((current) => (current + 1) % slogans.length), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!contributionNotice) return undefined;
    const timer = window.setTimeout(() => setContributionNotice(null), 10_000);
    return () => window.clearTimeout(timer);
  }, [contributionNotice]);

  const loadOrganization = async (number = orgNumber, preserveSelection = false) => {
    setLoading(true);
    try {
      const [nextOrg, nextObligations, nextSources, nextViewPreference, nextProfile, nextSupervisionThemes, nextSupervisionNotices, nextSupportFollowUps] = await Promise.all([api.organization(number), api.obligations(number), api.sources('', number), api.organizationViewPreference(number), api.organizationProfile(number), api.supervisionThemes(number), api.supervisionNotices(number), api.supportFollowUps(number)]);
      const nextAllObligations = [...nextObligations, ...nextSupportFollowUps.map(supportFollowUpAsObligation)];
      setOrganization(nextOrg); setOrganizationProfile(nextProfile); setOrganizationMutedBefore(nextViewPreference.mutedBefore ?? ''); setObligations(nextAllObligations); setSupportFollowUps(nextSupportFollowUps); setSources(nextSources); setSupervisionThemes(nextSupervisionThemes); setSupervisionNotices(nextSupervisionNotices); setSelectedObligationId((current) => preserveSelection ? (current && nextAllObligations.some((item) => item.id === current) ? current : null) : null); if (!preserveSelection) setSelectedOccurrenceDate(null); setOrganizationSearchResults([]); setToast('Virksomhetsoversikten er oppdatert.');
    } catch (error) { setOrganization(null); setOrganizationProfile(null); setOrganizationMutedBefore(''); setSupportFollowUps([]); setSupervisionThemes([]); setSupervisionNotices([]); setToast(error instanceof Error ? error.message : 'Kunne ikke laste virksomheten.'); }
    finally { setLoading(false); }
  };

  const rememberLastOrganization = async (number: string) => {
    try {
      const nextUser = await api.setLastOrganization(number);
      setUser(nextUser);
    } catch {
      // Remembering the selection must not interrupt loading the organization.
    }
  };

  const searchOrganizations = async () => {
    const query = orgNumber.trim();
    if (!query) return;
    if (/^\d[\d\s]{8,}$/.test(query)) {
      await loadOrganization(query);
      if (savedOrganizations.some((item) => item.orgNumber === query.replace(/\s/g, ''))) await rememberLastOrganization(query);
      return;
    }
    setSearchingOrganizations(true);
    try {
      const results = await api.searchOrganizations(query);
      setOrganizationSearchResults(results);
      setToast(results.length ? `${results.length} virksomheter funnet.` : 'Ingen virksomheter funnet.');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Kunne ikke søke etter virksomheter.');
    } finally {
      setSearchingOrganizations(false);
    }
  };

  useEffect(() => {
    void api.me().then(async (nextUser) => {
      setUser(nextUser);
      void api.contributionSummary().then(setContributionSummary).catch(() => setContributionSummary(null));
      const organizationsForUser = await api.myOrganizations();
      setSavedOrganizations(organizationsForUser);
      if (nextUser.role === 'caseworker') setReports(await api.reports());
      const initialOrganization = organizationsForUser.find((item) => item.orgNumber === nextUser.lastOrganizationNumber) ?? organizationsForUser[0];
      if (initialOrganization) {
        setOrgNumber(initialOrganization.orgNumber);
        await loadOrganization(initialOrganization.orgNumber);
      }
    }).catch(() => undefined).finally(() => setAuthChecking(false));
  }, []);

  const addCurrentOrganization = async () => {
    if (!organization) return;
    try {
      const nextUser = await api.addMyOrganization(organization.orgNumber);
      setUser(nextUser);
      setSavedOrganizations(await api.myOrganizations());
      await rememberLastOrganization(organization.orgNumber);
      setToast('Virksomheten er lagt til i Mine virksomheter.');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Kunne ikke lagre virksomheten.');
    }
  };

  const signOut = async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
      setContributionSummary(null);
      setShowFeedback(false);
      setShowOrganizationChooser(false);
      setShowOrganizationProfile(false);
      setOrganization(null);
      setOrganizationProfile(null);
      setOrganizationMutedBefore('');
      setObligations([]);
      setSupportFollowUps([]);
      setSources([]);
      setSupervisionThemes([]);
      setSupervisionNotices([]);
      setReports([]);
      setSelectedObligationId(null);
    }
  };

  const handleAuthenticated = async (nextUser: DemoUser) => {
    setUser(nextUser);
    void api.contributionSummary().then(setContributionSummary).catch(() => setContributionSummary(null));
    const organizationsForUser = await api.myOrganizations();
    setSavedOrganizations(organizationsForUser);
    if (nextUser.role === 'caseworker') setReports(await api.reports());
    const initialOrganization = organizationsForUser.find((item) => item.orgNumber === nextUser.lastOrganizationNumber) ?? organizationsForUser[0];
    if (initialOrganization) {
      setOrgNumber(initialOrganization.orgNumber);
      await loadOrganization(initialOrganization.orgNumber);
    }
  };

  const refreshContributionSummary = async (points?: number, action?: string) => {
    try {
      const summary = await api.contributionSummary();
      setContributionSummary(summary);
      if (points && action) setContributionNotice({ summary, points, action });
    } catch {
      // Contribution feedback must not interrupt the main user flow.
    }
  };

  const openLos = (prompt: string, conceptId?: string) => {
    setChatPrompt(prompt);
    setChatPromptConceptId(conceptId);
    setChatOpenRequest((current) => current + 1);
  };

  if (authChecking) return <div className="auth-shell"><p>Laster ORaKeL…</p></div>;
  if (!user) return <AuthScreen onAuthenticated={(nextUser) => { void handleAuthenticated(nextUser); }} />;

  const selectedObligation = obligations.find((item) => item.id === selectedObligationId) ?? null;
  const filteredByStatus = statusFilter === 'all' ? obligations : obligations.filter((item) => item.status === statusFilter);
  const filteredObligations = visibilityFilter === 'all'
    ? filteredByStatus
    : filteredByStatus.filter((item) => visibilityFilter === 'hidden' ? item.isHidden === true : visibilityFilter === 'muted' ? item.isMuted === true || Boolean(item.mutedBefore) || Boolean(item.organizationMutedBefore) : item.isHidden !== true);
  // Demping affects the calendar/catalogue, but a muted task is intentionally
  // not part of the active worklist until the user activates it again.
  const activeObligations = filteredObligations.filter((item) => item.isActivated === true && item.isMuted !== true);

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand-lockup"><img src="/orakel-logo.svg" alt="ORaKeL" /><div><strong>ORaKeL</strong><span>KI-assistert rapporteringslos</span><small className="app-version">v{appVersion} · {appEnvironment}</small></div></div>
      {user.role === 'business' && <button className="organization-topbar-trigger" onClick={() => organization ? setShowOrganizationProfile(true) : setShowOrganizationChooser(true)}><Landmark size={16} /><span>{organization ? <><strong>{organization.name}</strong><small>{organization.orgNumber}</small></> : <><strong>Velg virksomhet</strong><small>Søk eller velg en lagret virksomhet</small></>}</span><ChevronRight size={16} /></button>}
      {user.role === 'business' && contributionSummary && <span className="contribution-pill" title={contributionSummary.nextLevel ? `${contributionSummary.pointsToNextLevel} poeng til ${contributionSummary.nextLevel}` : 'Høyeste demo-nivå nådd'}><Sparkles size={14} /> {contributionSummary.level} · {contributionSummary.points} poeng</span>}<button className="feedback-button" onClick={() => setShowFeedback(true)}><CircleHelp size={14} /> Gi tilbakemelding</button><div className="user-pill"><div className="avatar">{user.displayName.slice(0, 2).toUpperCase()}</div><span>{user.displayName}</span><small>{user.role === 'caseworker' ? 'Saksbehandler' : 'Virksomhet'}</small><button onClick={() => void signOut()}>Logg ut</button></div>
    </header>

    <main className="page-container">
      {user.role === 'business' && <section className="hero-row">
        <div className="slogan-field" aria-live="polite"><p className="eyebrow">ORaKeL · rapporteringsnavigator</p><div className="slogan-banner"><Heading level={1} data-size="2xl" key={sloganIndex}>{slogans[sloganIndex]}</Heading></div><Paragraph>Enklere oversikt over plikter, frister, kilder og avklaringer.</Paragraph></div>
      </section>}

      {toast && <div className="toast" role="status"><Check size={16} /> {toast}<button onClick={() => setToast('')} aria-label="Lukk melding"><X size={16} /></button></div>}
      {contributionNotice && <div className="global-contribution-notice"><ContributionNotice notice={contributionNotice} onClose={() => setContributionNotice(null)} /></div>}

      {user.role === 'caseworker' && <AdminView reports={reports} onStatusChange={async (id, status, note) => { const updated = await api.updateReport(id, status, note); setReports((items) => items.map((item) => item.id === id ? updated : item)); setToast('Innspillet er oppdatert og endringen er logget i demoen.'); }} onReportChanged={(updated) => setReports((items) => items.map((item) => item.id === updated.id ? updated : item))} />}
      {user.role === 'business' && organization && <Overview organization={organization} organizationMutedBefore={organizationMutedBefore} obligations={activeObligations} catalogObligations={filteredObligations} allObligations={obligations} supportFollowUps={supportFollowUps} sources={sources} supervisionThemes={supervisionThemes} supervisionNotices={supervisionNotices} selectedObligation={selectedObligation} selectedOccurrenceDate={selectedOccurrenceDate} setSelectedObligationId={setSelectedObligationId} setSelectedOccurrenceDate={setSelectedOccurrenceDate} calendarStart={calendarStart} setCalendarStart={setCalendarStart} calendarMode={calendarMode} setCalendarMode={setCalendarMode} statusFilter={statusFilter} setStatusFilter={setStatusFilter} visibilityFilter={visibilityFilter} setVisibilityFilter={setVisibilityFilter} onTaskChanged={(nextSelectedId) => { if (nextSelectedId !== undefined) setSelectedObligationId(nextSelectedId); void loadOrganization(organization.orgNumber, true); }} onOrganizationViewChanged={() => { void loadOrganization(organization.orgNumber, true); }} onSupportFollowUpChanged={() => { void loadOrganization(organization.orgNumber, true); }} onSupervisionNoticeCreated={(notice) => setSupervisionNotices((items) => [notice, ...items])} onContributionChanged={(points, action) => refreshContributionSummary(points, action)} onAskLos={openLos} chatPrompt={chatPrompt} chatPromptConceptId={chatPromptConceptId} chatOpenRequest={chatOpenRequest} />}
      {user.role === 'business' && !organization && <Card className="surface-card empty-state"><Heading level={2}>Velkommen til ORaKeL</Heading><Paragraph>Velg «Velg virksomhet» i topplinjen for å søke etter virksomheten din eller velge en lagret virksomhet.</Paragraph></Card>}
      {showOrganizationChooser && user.role === 'business' && <OrganizationChooserDialog savedOrganizations={savedOrganizations} organization={organization} orgNumber={orgNumber} organizationSearchResults={organizationSearchResults} loading={loading} searching={searchingOrganizations} onClose={() => setShowOrganizationChooser(false)} onSearchTermChange={(value) => { setOrgNumber(value); setOrganizationSearchResults([]); }} onSearch={() => void searchOrganizations()} onSelectSaved={async (number) => { setOrgNumber(number); await loadOrganization(number); await rememberLastOrganization(number); setShowOrganizationChooser(false); }} onSelectResult={async (number) => { setOrgNumber(number); await loadOrganization(number); if (savedOrganizations.some((item) => item.orgNumber === number)) await rememberLastOrganization(number); }} onAdd={async () => { await addCurrentOrganization(); setShowOrganizationChooser(false); }} />}
      {showOrganizationProfile && organization && organizationProfile && <OrganizationProfileDialog organization={organization} profile={organizationProfile} sources={sources} onClose={() => setShowOrganizationProfile(false)} onSwitch={() => { setShowOrganizationProfile(false); setShowOrganizationChooser(true); }} onSaved={(nextProfile) => { setOrganizationProfile(nextProfile); setToast('Virksomhetsprofilen er lagret.'); }} />}
      {showFeedback && <FeedbackDialog onClose={() => setShowFeedback(false)} onCreated={() => { setShowFeedback(false); void refreshContributionSummary(2, 'forbedringsforslag til ORaKeL'); setToast('Takk for tilbakemeldingen.'); }} />}
    </main>
  </div>;
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: DemoUser) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setError('');
    try {
      const user = mode === 'login' ? await api.login(username, password) : await api.register(username, displayName, password);
      onAuthenticated(user);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Kunne ikke logge inn.');
    } finally { setBusy(false); }
  };
  return <main className="auth-shell"><Card className="auth-card"><form onSubmit={(event) => { event.preventDefault(); void submit(); }}><img src="/orakel-logo.svg" alt="ORaKeL" className="auth-logo" /><p className="eyebrow">Demo-tilgang</p><Heading level={1}>{mode === 'login' ? 'Logg inn i ORaKeL' : 'Opprett demo-bruker'}</Heading><Paragraph>{mode === 'login' ? 'Velg virksomhetsbruker eller saksbehandler for å starte.' : 'Brukeren lagres kun i denne hackathon-instansen.'}</Paragraph>{mode === 'register' && <Textfield label="Navn som vises" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />}{<Textfield label="Brukernavn" value={username} onChange={(event) => setUsername(event.target.value)} />}{<Textfield label="Passord" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />}{error && <Alert data-color="danger"><AlertCircle size={17} />{error}</Alert>}<Button type="submit" disabled={busy || !username || !password}>{busy ? 'Arbeider…' : mode === 'login' ? 'Logg inn' : 'Opprett bruker'}</Button><button type="button" className="auth-switch" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>{mode === 'login' ? 'Opprett ny virksomhetsbruker' : 'Jeg har allerede bruker'}</button>{mode === 'login' && <p className="demo-credentials">Demo-saksbehandler: <code>br-saksbehandler</code> / <code>demo</code></p>}</form></Card></main>;
}

function OrganizationChooserDialog({ savedOrganizations, organization, orgNumber, organizationSearchResults, loading, searching, onClose, onSearchTermChange, onSearch, onSelectSaved, onSelectResult, onAdd }: { savedOrganizations: Organization[]; organization: Organization | null; orgNumber: string; organizationSearchResults: Organization[]; loading: boolean; searching: boolean; onClose: () => void; onSearchTermChange: (value: string) => void; onSearch: () => void; onSelectSaved: (orgNumber: string) => Promise<void>; onSelectResult: (orgNumber: string) => Promise<void>; onAdd: () => Promise<void> }) {
  return <div className="dialog-backdrop" role="presentation"><div className="dialog organization-chooser-dialog" role="dialog" aria-modal="true" aria-labelledby="organization-chooser-title"><div className="dialog-heading"><div><p className="eyebrow">Virksomhetsvelger</p><Heading level={2} id="organization-chooser-title">Velg virksomhet</Heading><Paragraph>Velg en virksomhet du har lagret, eller søk etter navn eller organisasjonsnummer.</Paragraph></div><button onClick={onClose} aria-label="Lukk"><X /></button></div><section className="organization-chooser-section"><label htmlFor="saved-organizations">Mine virksomheter</label>{savedOrganizations.length > 0 ? <select id="saved-organizations" value="" onChange={(event) => { if (event.target.value) void onSelectSaved(event.target.value); }}><option value="">Velg lagret virksomhet…</option>{savedOrganizations.map((item) => <option key={item.orgNumber} value={item.orgNumber}>{item.name} ({item.orgNumber})</option>)}</select> : <p className="muted">Du har ingen lagrede virksomheter ennå.</p>}</section><form className="organization-search-form" onSubmit={(event) => { event.preventDefault(); onSearch(); }}><Textfield id="organization-search" label="Søk etter virksomhet" value={orgNumber} onChange={(event) => onSearchTermChange(event.target.value)} placeholder="Navn eller ni siffer" /><Button type="submit" disabled={loading || searching}>{loading ? 'Laster…' : searching ? 'Søker…' : 'Søk'}</Button></form><span className="field-hint">Velg et søkeresultat for å laste virksomheten. Du kan deretter legge den til i Mine virksomheter.</span>{organizationSearchResults.length > 0 && <div className="org-search-results" aria-label="Søkeresultater">{organizationSearchResults.map((item) => <button type="button" key={item.orgNumber} className="org-search-result" onClick={() => void onSelectResult(item.orgNumber)}><strong>{item.name}</strong><span>{item.orgNumber} · {item.organizationForm} · {item.municipality || 'Kommune ikke oppgitt'}</span></button>)}</div>}{organization && !savedOrganizations.some((item) => item.orgNumber === organization.orgNumber) && <Button variant="secondary" onClick={() => void onAdd()}>Legg til i Mine virksomheter</Button>}<div className="dialog-actions"><Button variant="secondary" onClick={onClose}>Lukk</Button></div></div></div>;
}

function OrganizationProfileDialog({ organization, profile, sources, onClose, onSwitch, onSaved }: { organization: Organization; profile: OrganizationProfile; sources: Source[]; onClose: () => void; onSwitch: () => void; onSaved: (profile: OrganizationProfile) => void }) {
  const [inputs, setInputs] = useState(profile.inputs);
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const officialFields: Array<[string, string]> = [
    ['Organisasjonsnummer', organization.orgNumber],
    ['Organisasjonsform', organization.organizationFormName ? `${organization.organizationFormName} (${organization.organizationForm})` : organization.organizationForm],
    ['Næringskoder', organization.industryCodes.length ? organization.industryCodes.join(', ') : 'Ikke oppgitt'],
    ['Kommune', organization.municipality || 'Ikke oppgitt'],
    ['Ansatte/arbeidsgiver', organization.hasEmployees === undefined ? 'Ikke oppgitt' : organization.hasEmployees ? `Ja${organization.employeeCount === undefined ? '' : ` · ${organization.employeeCount} registrert`}` : 'Nei'],
    ['Innsendte årsregnskap', organization.submittedAnnualAccountYears?.length ? organization.submittedAnnualAccountYears.join(', ') : 'Ikke oppgitt'],
    ['MVA-registeret', organization.registeredInMvaRegister === undefined ? 'Ikke oppgitt' : organization.registeredInMvaRegister ? 'Registrert' : 'Ikke registrert'],
    ['Foretaksregisteret', organization.registeredInForetaksregister === undefined ? 'Ikke oppgitt' : organization.registeredInForetaksregister ? 'Registrert' : 'Ikke registrert'],
    ['Registrert fra', organization.registrationDate ? formatDate(organization.registrationDate, true) : 'Ikke oppgitt'],
  ];
  const addInput = () => {
    if (!label.trim() || !value.trim()) return;
    setInputs((current) => [...current, { id: `local-${Date.now()}`, label: label.trim(), value: value.trim(), status: 'USER_INPUT', updatedAt: new Date().toISOString() }]);
    setLabel('');
    setValue('');
  };
  const save = async () => {
    setSaving(true);
    try {
      const nextProfile = await api.saveOrganizationProfile(organization.orgNumber, inputs);
      onSaved(nextProfile);
    } finally {
      setSaving(false);
    }
  };
  return <div className="dialog-backdrop" role="presentation"><div className="dialog organization-profile-dialog" role="dialog" aria-modal="true" aria-labelledby="organization-profile-title"><div className="dialog-heading"><div><p className="eyebrow">Virksomhetsprofil</p><Heading level={2} id="organization-profile-title">{organization.name}</Heading><Paragraph>Offisielle registeropplysninger og dine egne opplysninger holdes adskilt.</Paragraph></div><button onClick={onClose} aria-label="Lukk"><X /></button></div><section className="profile-section"><div className="profile-section-heading"><div><strong>Offisielle opplysninger</strong><span>Hentet fra virksomhetskilden</span></div><span className="trust trust-official"><ShieldCheck size={14} /> Offisiell</span></div><dl className="profile-fields">{officialFields.map(([field, fieldValue]) => <div key={field}><dt>{field}</dt><dd>{fieldValue}</dd></div>)}</dl></section><section className="profile-section"><div className="profile-section-heading"><div><strong>Egne opplysninger</strong><span>Dette er brukerinput og kan ikke endre registerdata eller juridiske konklusjoner.</span></div><span className="trust trust-user_input">Brukerinput</span></div>{inputs.length > 0 && <div className="user-input-list">{inputs.map((input) => <div className="user-input-row" key={input.id}><div><strong>{input.label}</strong><span>{input.value}</span><small>Brukerinput · oppdatert {formatDate(input.updatedAt.slice(0, 10), true)}</small></div><button type="button" onClick={() => setInputs((current) => current.filter((item) => item.id !== input.id))} aria-label={`Fjern ${input.label}`}><X size={15} /></button></div>)}</div>}<div className="profile-input-form"><Textfield label="Felt eller tema" placeholder="For eksempel regnskapssystem" value={label} onChange={(event) => setLabel(event.target.value)} /><Textfield label="Opplysning" placeholder="For eksempel Tripletex" value={value} onChange={(event) => setValue(event.target.value)} /><Button variant="secondary" onClick={addInput} disabled={!label.trim() || !value.trim()}>Legg til</Button></div></section><section className="profile-section"><div className="profile-section-heading"><div><strong>Kilder</strong><span>Opplysningene kan endres når kildene oppdateres.</span></div></div>{organization.sources.map((sourceId) => { const source = sources.find((item) => item.id === sourceId); return source ? <a className="profile-source" href={source.url} target="_blank" rel="noreferrer" key={source.id}><ShieldCheck size={15} /><span><strong>{source.title}</strong><small>Sist hentet {formatDate(source.retrievedAt.slice(0, 10), true)}</small></span><ChevronRight size={15} /></a> : null; })}</section><div className="dialog-actions"><Button variant="secondary" onClick={onSwitch}>Bytt virksomhet</Button><Button variant="secondary" onClick={onClose}>Lukk</Button><Button onClick={() => void save()} disabled={saving}>{saving ? 'Lagrer…' : 'Lagre egne opplysninger'}</Button></div></div></div>;
}

function Overview({ organization, organizationMutedBefore, obligations, catalogObligations, allObligations, supportFollowUps, sources, supervisionThemes, supervisionNotices, selectedObligation, selectedOccurrenceDate, setSelectedObligationId, setSelectedOccurrenceDate, calendarStart, setCalendarStart, calendarMode, setCalendarMode, statusFilter, setStatusFilter, visibilityFilter, setVisibilityFilter, onTaskChanged, onOrganizationViewChanged, onSupportFollowUpChanged, onSupervisionNoticeCreated, onContributionChanged, onAskLos, chatPrompt, chatPromptConceptId, chatOpenRequest }: { organization: Organization; organizationMutedBefore: string; obligations: Obligation[]; catalogObligations: Obligation[]; allObligations: Obligation[]; supportFollowUps: SupportFollowUp[]; sources: Source[]; supervisionThemes: SupervisionTheme[]; supervisionNotices: SupervisionNotice[]; selectedObligation: Obligation | null; selectedOccurrenceDate: string | null; setSelectedObligationId: (id: string | null) => void; setSelectedOccurrenceDate: (date: string | null) => void; calendarStart: Date; setCalendarStart: (date: Date) => void; calendarMode: 'year' | 'list'; setCalendarMode: (mode: 'year' | 'list') => void; statusFilter: 'all' | TaskStatus; setStatusFilter: (value: 'all' | TaskStatus) => void; visibilityFilter: 'visible' | 'hidden' | 'muted' | 'all'; setVisibilityFilter: (value: 'visible' | 'hidden' | 'muted' | 'all') => void; onTaskChanged: (nextSelectedId?: string | null) => void; onOrganizationViewChanged: () => void; onSupportFollowUpChanged: () => void; onSupervisionNoticeCreated: (notice: SupervisionNotice) => void; onContributionChanged: (points?: number, action?: string) => Promise<void>; onAskLos: (prompt: string, conceptId?: string) => void; chatPrompt: string; chatPromptConceptId?: string; chatOpenRequest: number }) {
  const [showReport, setShowReport] = useState(false);
  const [workspaceView, setWorkspaceView] = useState<'calendar' | 'events' | 'supervision' | 'concepts' | 'support' | 'worklist' | 'report'>('calendar');
  const [taskQuery, setTaskQuery] = useState('');
  const [taskTypeFilter, setTaskTypeFilter] = useState<'all' | 'periodic' | 'event'>('all');
  const [eventFilter, setEventFilter] = useState('all');
  const [taskSort, setTaskSort] = useState<'deadline' | 'status' | 'agency'>('deadline');
  const [activatingAllMuted, setActivatingAllMuted] = useState(false);
  const mainColumnRef = useRef<HTMLDivElement>(null);
  const mainScrollTop = useRef(0);
  const preserveMainScroll = (change: () => void) => { mainScrollTop.current = mainColumnRef.current?.scrollTop ?? 0; change(); };
  const eventOptions = useMemo(() => [...new Set(obligations.filter(isEventLike).map(eventCategory))].sort((left, right) => left.localeCompare(right, 'nb')), [obligations]);
  const eventGuides = useMemo(() => buildEventGuides(allObligations), [allObligations]);
  const filteredTaskObligations = useMemo(() => {
    const query = taskQuery.trim().toLocaleLowerCase('nb-NO');
    return obligations.filter((item) => {
      if (taskTypeFilter === 'event' && !isEventLike(item)) return false;
      if (taskTypeFilter === 'periodic' && isEventLike(item)) return false;
      if (taskTypeFilter === 'event' && eventFilter !== 'all' && eventCategory(item) !== eventFilter) return false;
      if (!query) return true;
      return `${item.name} ${item.description} ${item.responsibleAgency} ${item.eventLabel ?? ''}`.toLocaleLowerCase('nb-NO').includes(query);
    }).sort((left, right) => {
      if (taskSort === 'agency') return left.responsibleAgency.localeCompare(right.responsibleAgency, 'nb');
      if (taskSort === 'status') return statusLabels[left.status].localeCompare(statusLabels[right.status], 'nb') || left.name.localeCompare(right.name, 'nb');
      return (occurrenceDeadline(left, left.deadlineDates?.[0]) ?? '9999-12-31').localeCompare(occurrenceDeadline(right, right.deadlineDates?.[0]) ?? '9999-12-31') || left.name.localeCompare(right.name, 'nb');
    });
  }, [eventFilter, obligations, taskQuery, taskSort, taskTypeFilter]);
  useLayoutEffect(() => { if (mainColumnRef.current) mainColumnRef.current.scrollTop = mainScrollTop.current; }, [visibilityFilter, statusFilter]);
  const mutedCount = catalogObligations.filter((item) => item.isMuted === true || Boolean(item.mutedBefore) || Boolean(item.organizationMutedBefore)).length;
  const activateAllMuted = async () => {
    setActivatingAllMuted(true);
    try {
      await api.activateAllMuted(organization.orgNumber);
      onTaskChanged();
    } finally {
      setActivatingAllMuted(false);
    }
  };
  return <>
    <ReportingMetrics obligations={obligations} catalogObligations={allObligations} />
    <div className="los-dock"><ChatPanel orgNumber={organization.orgNumber} sources={sources} prefillQuestion={chatPrompt} prefillConceptId={chatPromptConceptId} openRequest={chatOpenRequest} onContributionChanged={onContributionChanged} /></div>
    <nav className="workspace-switcher" aria-label="Velg arbeidsflate"><span>Arbeidsflate</span><button className={workspaceView === 'calendar' ? 'selected' : ''} onClick={() => setWorkspaceView('calendar')}>Årshjul</button><button className={workspaceView === 'events' ? 'selected' : ''} onClick={() => setWorkspaceView('events')}>Hendelser</button><button className={workspaceView === 'supervision' ? 'selected' : ''} onClick={() => setWorkspaceView('supervision')}>Tilsyn</button><button className={workspaceView === 'concepts' ? 'selected' : ''} onClick={() => setWorkspaceView('concepts')}>Begreper</button><button className={workspaceView === 'support' ? 'selected' : ''} onClick={() => setWorkspaceView('support')}>Støtte</button><button className={workspaceView === 'worklist' ? 'selected' : ''} onClick={() => setWorkspaceView('worklist')}>Arbeidsliste</button><button className={workspaceView === 'report' ? 'selected' : ''} onClick={() => setWorkspaceView('report')}>Meld inn</button></nav>
    <section className="dashboard-grid">
      <div className="main-column" ref={mainColumnRef}>
        {workspaceView === 'events' ? <EventNavigator organization={organization} obligations={allObligations} guides={eventGuides} sources={sources} onSelectObligation={(id) => { setSelectedObligationId(id); setSelectedOccurrenceDate(null); }} onAskLos={onAskLos} /> : workspaceView === 'supervision' ? <SupervisionWorkspace organization={organization} themes={supervisionThemes} notices={supervisionNotices} obligations={allObligations} sources={sources} onSelectObligation={(id) => { setSelectedObligationId(id); setSelectedOccurrenceDate(null); }} onAskLos={onAskLos} onNoticeCreated={onSupervisionNoticeCreated} /> : workspaceView === 'concepts' ? <ConceptWorkspace selectedObligation={selectedObligation} onAskLos={onAskLos} /> : workspaceView === 'support' ? <SupportWorkspace organization={organization} followUps={supportFollowUps} onFollowUpChanged={onSupportFollowUpChanged} onAskLos={onAskLos} /> : workspaceView === 'report' ? <ReportWorkspace onOpen={() => setShowReport(true)} /> : <>
        {workspaceView !== 'worklist' && <><Card className="surface-card calendar-card"><div className="card-heading-row"><div><p className="eyebrow">Rullerende 12 måneder</p><Heading level={2}>Årshjul</Heading><span className="calendar-caption">Katalog over relevante oppgaver. Velg en oppgave for å legge den i arbeidslisten.</span></div><div className="calendar-controls"><button className="calendar-nav" onClick={() => setCalendarStart(shiftMonth(calendarStart, -1))} aria-label="Vis forrige måned"><ChevronLeft size={17} /></button><span>{formatDate(dateKey(calendarStart), true)} – {formatDate(dateKey(shiftMonth(calendarStart, 11)), true)}</span><button className="calendar-nav" onClick={() => setCalendarStart(shiftMonth(calendarStart, 1))} aria-label="Vis neste måned"><ChevronRight size={17} /></button><button className="calendar-today" onClick={() => setCalendarStart(shiftMonth(monthStart(new Date()), -3))}>I dag</button><div className="segmented"><button className={calendarMode === 'year' ? 'selected' : ''} onClick={() => setCalendarMode('year')}>Årshjul</button><button className={calendarMode === 'list' ? 'selected' : ''} onClick={() => setCalendarMode('list')}>Liste</button></div></div></div>{calendarMode === 'year' ? <YearWheel obligations={catalogObligations} start={calendarStart} includeHidden={visibilityFilter !== 'visible'} selectedId={selectedObligation?.id} selectedOccurrenceDate={selectedOccurrenceDate ?? undefined} onSelect={(id, date) => { setSelectedObligationId(id); setSelectedOccurrenceDate(date ?? null); }} /> : <ObligationList obligations={catalogObligations} selectedId={selectedObligation?.id} onSelect={(id, date) => { setSelectedObligationId(id); setSelectedOccurrenceDate(date ?? null); }} />}</Card><div className="workspace-mute-controls">{selectedObligation && selectedObligation.kind !== 'support_follow_up' && <MuteControl orgNumber={organization.orgNumber} obligation={selectedObligation} onTaskChanged={onTaskChanged} />}<OrganizationMuteControl orgNumber={organization.orgNumber} mutedBefore={organizationMutedBefore} onChanged={onOrganizationViewChanged} /></div></>}
        {workspaceView === 'worklist' && <>
        <div className="workspace-heading"><div><p className="eyebrow">Arbeidsliste</p><Heading level={2}>{taskTypeFilter === 'event' ? 'Hendelser som krever oppfølging' : 'Det som må gjøres'}</Heading><span className="calendar-caption">Bare oppgaver du har aktivert med frist eller gjentakelse vises her.</span></div><div className="filter-row"><Filter size={16} /><select value={statusFilter} onChange={(event) => preserveMainScroll(() => setStatusFilter(event.target.value as typeof statusFilter))} aria-label="Filtrer oppgaver"><option value="all">Alle statuser</option>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><select value={visibilityFilter} onChange={(event) => preserveMainScroll(() => setVisibilityFilter(event.target.value as typeof visibilityFilter))} aria-label="Filtrer synlighet"><option value="visible">Synlige</option><option value="muted">Dempede</option><option value="hidden">Skjulte</option><option value="all">Alle oppgaver</option></select>{visibilityFilter === 'muted' && mutedCount > 0 && <Button variant="secondary" onClick={() => void activateAllMuted()} disabled={activatingAllMuted}>{activatingAllMuted ? 'Aktiverer…' : `Aktiver alle dempede (${mutedCount})`}</Button>}<select value={taskTypeFilter} onChange={(event) => { setTaskTypeFilter(event.target.value as typeof taskTypeFilter); setEventFilter('all'); }} aria-label="Filtrer oppgavetype"><option value="all">Alle oppgavetyper</option><option value="periodic">Med fast frist</option><option value="event">Ved hendelse</option></select>{taskTypeFilter === 'event' && <select value={eventFilter} onChange={(event) => setEventFilter(event.target.value)} aria-label="Filtrer hendelse"><option value="all">Alle hendelser</option>{eventOptions.map((event) => <option key={event} value={event}>{event}</option>)}</select>}<select value={taskSort} onChange={(event) => setTaskSort(event.target.value as typeof taskSort)} aria-label="Sorter arbeidsliste"><option value="deadline">Nærmeste frist først</option><option value="status">Sorter på status</option><option value="agency">Sorter på etat</option></select><Textfield className="task-search" aria-label="Søk i arbeidslisten" placeholder="Søk i aktive oppgaver" value={taskQuery} onChange={(event) => setTaskQuery(event.target.value)} /></div></div>
        {filteredTaskObligations.length > 0 ? <div className="task-list">{filteredTaskObligations.map((item) => <TaskRow key={item.id} obligation={item} selected={selectedObligation?.id === item.id} onClick={() => { setSelectedObligationId(item.id); setSelectedOccurrenceDate(item.deadlineDates?.[0] ?? null); }} />)}</div> : <div className="task-empty"><strong>Ingen aktive oppgaver matcher filteret</strong><span>Velg en oppgave i katalogen ovenfor og lagre en frist eller gjentakelse for å legge den til.</span></div>}
        <button className="report-cta" onClick={() => setShowReport(true)}><div className="report-cta-icon"><Plus size={20} /></div><div><strong>Finner du en plikt som mangler?</strong><span>Meld inn et mulig krav til menneskelig gjennomgang.</span></div><ChevronRight size={20} /></button>
        <div className="workspace-mute-controls">{selectedObligation && selectedObligation.kind !== 'support_follow_up' && <MuteControl orgNumber={organization.orgNumber} obligation={selectedObligation} onTaskChanged={onTaskChanged} />}<OrganizationMuteControl orgNumber={organization.orgNumber} mutedBefore={organizationMutedBefore} onChanged={onOrganizationViewChanged} /></div>
        </>}
        </>}
      </div>
      <aside className="side-column"><ObligationDetail orgNumber={organization.orgNumber} obligation={selectedObligation} occurrenceDate={selectedOccurrenceDate} sources={sources} onTaskChanged={onTaskChanged} /></aside>
    </section>
    {showReport && <ReportDialog onClose={() => setShowReport(false)} onCreated={() => { setShowReport(false); void onContributionChanged(3, 'forslag til mulig manglende plikt'); }} />}
  </>;
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} t ${remainder} min` : `${hours} t`;
}

function ReportingMetrics({ obligations, catalogObligations }: { obligations: Obligation[]; catalogObligations: Obligation[] }) {
  const currentMonth = monthStart(new Date());
  const thisMonth = estimateReportingMinutes(catalogObligations, currentMonth, 1);
  const nextTwelveMonths = estimateReportingMinutes(catalogObligations, currentMonth, 12);
  const worklist = estimateReportingMinutes(obligations, currentMonth, 12);
  return <section className="metrics-bar" aria-label="Rapporteringsstatistikk">
    <div className="metrics-intro"><p className="eyebrow">Rapporteringsbelastning</p><strong>Et realistisk bilde av arbeidsmengden</strong><span>Estimater oppdateres når oppgaver skjules eller dempes.</span></div>
    <div className="metrics-facts">
      <span><strong>{catalogObligations.length}</strong><small>i katalogen</small></span>
      <span><strong>{obligations.length}</strong><small>i arbeidslisten</small></span>
      <span title={`${thisMonth.occurrenceCount} synlige forekomster`}><Clock3 size={15} /><strong>{formatDuration(thisMonth.minutes)}</strong><small>denne måneden</small></span>
      <span title={`${nextTwelveMonths.occurrenceCount} synlige forekomster`}><Clock3 size={15} /><strong>{formatDuration(nextTwelveMonths.minutes)}</strong><small>neste 12 måneder</small></span>
      <span title={`${worklist.occurrenceCount} synlige forekomster`}><Clock3 size={15} /><strong>{formatDuration(worklist.minutes)}</strong><small>arbeidsliste · 12 md.</small></span>
    </div>
  </section>;
}

function ReportWorkspace({ onOpen }: { onOpen: () => void }) {
  return <Card className="surface-card workspace-landing-card"><div className="workspace-landing-icon"><Plus size={20} /></div><p className="eyebrow">Uoffisielt innspill</p><Heading level={2}>Meld inn en mulig manglende plikt</Heading><Paragraph>Finner dere en rapportering som ikke ser ut til å være med i katalogen? Send inn et forslag til menneskelig gjennomgang. Innspillet blir ikke en offisiell oppgave automatisk.</Paragraph><div className="workspace-landing-actions"><Button onClick={onOpen}><Plus size={16} /> Meld inn mulig plikt</Button><span><ShieldCheck size={15} /> KI-forslag og brukerinnspill holdes adskilt fra offisielle opplysninger.</span></div></Card>;
}

function EventNavigator({ organization, obligations, guides, sources, onSelectObligation, onAskLos }: { organization: Organization; obligations: Obligation[]; guides: EventGuide[]; sources: Source[]; onSelectObligation: (id: string) => void; onAskLos: (prompt: string) => void }) {
  const [selectedEventId, setSelectedEventId] = useState(guides[0]?.id ?? '');
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (!guides.some((guide) => guide.id === selectedEventId)) setSelectedEventId(guides[0]?.id ?? '');
  }, [guides, selectedEventId]);
  const visibleGuides = guides.filter((guide) => `${guide.label} ${guide.title} ${guide.summary}`.toLocaleLowerCase('nb-NO').includes(query.trim().toLocaleLowerCase('nb-NO')));
  const selectedGuide = guides.find((guide) => guide.id === selectedEventId) ?? visibleGuides[0] ?? guides[0];
  const relatedObligations = selectedGuide ? obligationsForEvent(selectedGuide, obligations) : [];
  const undatedObligations = obligations.filter((item) => !item.deadline && !item.deadlineDates?.length && !item.localDeadline);
  const relatedSources = selectedGuide ? sources.filter((source) => selectedGuide.sourceIds.includes(source.id)) : [];
  const losQuestion = selectedGuide ? `Det har skjedd «${selectedGuide.label}» i ${organization.name}. Hvilke rapporteringsplikter og neste steg bør vi undersøke, basert på virksomhetsinformasjonen du har?` : '';
  return <div className="event-navigator-view">
    <Card className="surface-card event-navigator-intro"><div><p className="eyebrow">Rapporteringsnavigator</p><Heading level={2}>Hva gjør vi når noe skjer?</Heading><Paragraph>Velg hendelsen som passer best. Veiledningen er et arbeidsutgangspunkt; kontroller alltid viktige forhold i kildene.</Paragraph></div><div className="event-org-context"><Landmark size={17} /><span>{organizationEventContext(organization)}</span></div></Card>
    <div className="event-navigator-toolbar"><Textfield aria-label="Søk i hendelser" placeholder="Søk etter hendelse" value={query} onChange={(event) => setQuery(event.target.value)} /><span>{visibleGuides.length} hendelser</span></div>
    <div className="event-navigator-layout">
      <div className="event-guide-list" aria-label="Hendelser">{visibleGuides.map((guide) => <button key={guide.id} className={selectedGuide?.id === guide.id ? 'selected' : ''} onClick={() => setSelectedEventId(guide.id)}><span className="event-guide-icon"><CircleHelp size={17} /></span><span><strong>{guide.label}</strong><small>{guide.isPredefined ? 'Forhåndsveiledning' : 'Fra Oppgaveregisteret'}</small></span><ChevronRight size={16} /></button>)}{visibleGuides.length === 0 && <p className="muted">Ingen hendelser matcher søket.</p>}</div>
      {selectedGuide && <Card className="surface-card event-guide-detail"><div className="event-detail-heading"><div><p className="eyebrow">{selectedGuide.isPredefined ? 'Forhåndsveiledning' : 'Kataloghendelse'}</p><Heading level={2}>{selectedGuide.title}</Heading></div><Tag>{selectedGuide.label}</Tag></div><Paragraph>{selectedGuide.summary}</Paragraph><div className="event-criteria"><strong>Relevant for denne virksomheten</strong><span>{selectedGuide.criteria.join(' · ')}</span></div><div className="event-step-section"><strong>Foreslått sjekkliste</strong><ol>{selectedGuide.steps.map((step) => <li key={step}>{step}</li>)}</ol></div><div className="event-task-section"><div className="section-title"><strong>Relevante rapporteringsoppgaver</strong><span>{relatedObligations.length}</span></div>{relatedObligations.length > 0 ? <div className="event-related-tasks">{relatedObligations.map((obligation) => <button key={obligation.id} onClick={() => onSelectObligation(obligation.id)}><span><strong>{obligation.name}</strong><small>{obligation.responsibleAgency} · {obligation.frequency}</small></span><ChevronRight size={16} /></button>)}</div> : <p className="muted">Ingen oppgave i katalogen er koblet direkte til denne hendelsen ennå.</p>}</div><div className="event-questions"><strong>Mulige spørsmål til losen</strong>{selectedGuide.questions.map((question) => <button key={question} onClick={() => onAskLos(`${question} Tilpass svaret til ${organization.name} og opplysningene som finnes om virksomheten.`)}>{question}</button>)}{losQuestion && <Button variant="secondary" onClick={() => onAskLos(losQuestion)}><Sparkles size={15} /> Forbered spørsmål om denne hendelsen</Button>}</div>{relatedSources.length > 0 && <div className="event-sources"><strong>Kilder i veiledningen</strong>{relatedSources.map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={source.id}><ShieldCheck size={14} />{source.title}</a>)}</div>}</Card>}
    </div>
    {undatedObligations.length > 0 && <div className="event-undated-tasks"><NoDatePanel items={undatedObligations.map((item) => ({ item }))} selectedId={undefined} onSelect={(id) => onSelectObligation(id)} /></div>}
  </div>;
}

function formatSupportAmount(value?: number, currency = 'NOK') {
  if (value === undefined) return 'Beløp ikke oppgitt';
  return new Intl.NumberFormat('nb-NO', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
}

function SupportWorkspace({ organization, followUps, onFollowUpChanged, onAskLos }: { organization: Organization; followUps: SupportFollowUp[]; onFollowUpChanged: () => void; onAskLos: (prompt: string) => void }) {
  const [result, setResult] = useState<SupportRegistryResult | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedAward, setSelectedAward] = useState<SupportAward | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void api.support(organization.orgNumber).then((nextResult) => {
      if (active) setResult(nextResult);
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Støtteregisteret kunne ikke søkes akkurat nå.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [organization.orgNumber]);
  const filteredAwards = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('nb-NO');
    if (!result) return [];
    return result.awards.filter((award) => !normalized || `${award.schemeName ?? ''} ${award.providerName} ${award.purpose ?? ''} ${award.instrument ?? ''} ${award.region ?? ''}`.toLocaleLowerCase('nb-NO').includes(normalized));
  }, [query, result]);
  const currentYear = new Date().getFullYear();
  const previousYear = currentYear - 1;
  const totalStats = supportStats(result?.awards ?? []);
  const previousYearStats = supportStats(result?.awards ?? [], previousYear);
  const yearToDateStats = supportStats(result?.awards ?? [], currentYear, new Date().toISOString().slice(0, 10));
  const sourceLabel = result?.sourceType === 'mock' ? 'Mockdata for demo' : 'Hackathon-datasett';
  return <div className="support-workspace">
    <Card className="surface-card support-intro"><div className="workspace-landing-icon"><Landmark size={20} /></div><div><p className="eyebrow">Støtteregisteret</p><Heading level={2}>Registrert offentlig støtte</Heading><Paragraph>Se publiserte støttetildelinger knyttet til {organization.name}. Dette er virksomhetskontekst – ikke en oversikt over støtte virksomheten har krav på eller kan søke om.</Paragraph><div className="support-org-context"><Landmark size={16} />{organization.name} · {organization.orgNumber}</div></div></Card>
    {error && <Alert data-color="danger"><AlertCircle size={16} />{error}</Alert>}
    {loading ? <Card className="surface-card support-loading"><Sparkles size={16} /> Henter støtteopplysninger…</Card> : <>
      <div className="support-summary"><Card className="surface-card support-stat"><small>Totalt i uttrekket</small><strong>{totalStats.count} tildelinger</strong><span>{formatSupportAmount(totalStats.amount)} publisert</span></Card><Card className="surface-card support-stat"><small>Forrige kalenderår ({previousYear})</small><strong>{previousYearStats.count} tildelinger</strong><span>{formatSupportAmount(previousYearStats.amount)} publisert</span></Card><Card className="surface-card support-stat"><small>Hittil i år ({currentYear})</small><strong>{yearToDateStats.count} tildelinger</strong><span>{formatSupportAmount(yearToDateStats.amount)} publisert</span></Card><Card className="surface-card support-stat"><small>Sist hentet</small><strong>{result ? formatDate(result.retrievedAt.slice(0, 10), true) : '–'}</strong><span>{sourceLabel}</span></Card></div>
      <Card className="surface-card support-list-card"><div className="support-list-heading"><div><p className="eyebrow">Tildelinger</p><Heading level={3}>{filteredAwards.length} treff</Heading></div><Textfield aria-label="Søk i støttetildelinger" placeholder="Søk på ordning, støttegiver eller formål" value={query} onChange={(event) => setQuery(event.target.value)} /></div>{filteredAwards.length > 0 ? <div className="support-award-list">{filteredAwards.map((award) => <SupportAwardCard award={award} key={award.id} isFollowUpCreated={followUps.some((item) => item.schemeName === (award.schemeName ?? 'Støtteordning ikke oppgitt') && item.providerName === award.providerName)} onFollowUp={() => setSelectedAward(award)} />)}</div> : <div className="support-empty"><strong>Ingen registrerte tildelinger funnet</strong><span>Det betyr ikke nødvendigvis at virksomheten ikke har mottatt støtte.</span></div>}<div className="support-footer"><span><ShieldCheck size={14} /> {sourceLabel} · hentet {result ? formatDate(result.retrievedAt.slice(0, 10), true) : '–'}</span><a href={SUPPORT_REGISTRY_SOURCE_URL} target="_blank" rel="noreferrer">Åpne Støtteregisteret <ExternalLink size={13} /></a></div></Card>
      {followUps.length > 0 && <Card className="surface-card support-followups-card"><div><p className="eyebrow">Mine støtteoppfølginger</p><Heading level={3}>{followUps.length} planlagte oppfølginger</Heading><Paragraph>Disse lokale oppgavene vises også i arbeidslisten og årshjulet. De er ikke bekreftede støtteordninger eller rapporteringsplikter.</Paragraph></div><div className="support-followup-list">{followUps.map((followUp) => <div className="support-followup-summary" key={followUp.id}><span><strong>{supportFollowUpTypeLabels[followUp.taskType]}: {followUp.schemeName}</strong><small>{followUp.recurrence ? `Gjentakelse: ${followUp.recurrence.frequency === 'yearly' ? 'årlig' : followUp.recurrence.frequency === 'quarterly' ? 'kvartalsvis' : 'månedlig'}` : 'Engangsoppgave'} · {followUp.deadline ? `frist ${formatDate(followUp.deadline, true)}` : 'frist satt'}</small></span><TrustLabel level={followUp.trustLevel} /></div>)}</div></Card>}
      {result && <Card className="surface-card support-los-card"><div><p className="eyebrow">Videre utforsking</p><strong>Vil du forstå støttehistorikken?</strong><p>Losen kan hjelpe med å oppsummere registrerte tildelinger, støttegivere og begreper – med tydelig forbehold om datadekning.</p></div><Button variant="secondary" onClick={() => onAskLos(`Oppsummer de registrerte støttetildelingene for ${organization.name}. Bruk bare støtteopplysningene som er tilgjengelige i ORaKeL, forklar hva som er publisert, og skill tydelig mellom fakta, tolkning og det vi ikke vet.`)}><Sparkles size={15} /> Spør losen</Button></Card>}
      <p className="support-disclaimer">{result?.coverageNote}</p>
    </>}
    {selectedAward && <SupportFollowUpDialog organizationNumber={organization.orgNumber} award={selectedAward} onClose={() => setSelectedAward(null)} onCreated={() => { setSelectedAward(null); onFollowUpChanged(); }} />}
  </div>;
}

function supportStats(awards: SupportAward[], year?: number, throughDate?: string) {
  const matching = year === undefined ? awards : awards.filter((award) => award.awardDate?.slice(0, 4) === String(year) && (!throughDate || (award.awardDate ?? '') <= throughDate));
  return { count: matching.length, amount: matching.reduce((sum, award) => sum + (award.amount ?? 0), 0) };
}

const SUPPORT_REGISTRY_SOURCE_URL = 'https://stotte.brreg.no/';

function SupportAwardCard({ award, isFollowUpCreated, onFollowUp }: { award: SupportAward; isFollowUpCreated: boolean; onFollowUp: () => void }) {
  const schemeUrl = safeExternalUrl(award.schemeUrl ?? '') ?? SUPPORT_REGISTRY_SOURCE_URL;
  const schemeLinkLabel = award.schemeUrl ? 'Les mer om ordningen' : 'Åpne Støtteregisteret';
  return <article className="support-award"><div className="support-award-topline"><strong>{award.schemeName ?? 'Støtteordning ikke oppgitt'}</strong><span>{formatSupportAmount(award.amount, award.currency)}</span></div><div className="support-award-facts"><span>{award.providerName}</span>{award.awardDate && <span>Tildelt {formatDate(award.awardDate, true)}</span>}{award.instrument && <span>{award.instrument}</span>}</div><div className="support-award-details">{award.purpose && <span><small>Formål</small>{award.purpose}</span>}{award.region && <span><small>Region</small>{award.region}</span>}{award.measureNumber && <span><small>Støttetiltak</small>{award.measureNumber}</span>}{award.legalBasis && <span><small>Rettslig grunnlag</small>{award.legalBasis}</span>}</div><div className="support-award-actions"><a href={schemeUrl} target="_blank" rel="noopener noreferrer">{schemeLinkLabel} <ExternalLink size={13} /></a><Button variant="secondary" onClick={onFollowUp} disabled={isFollowUpCreated}>{isFollowUpCreated ? 'Oppfølging opprettet' : 'Følg opp i år'}</Button></div><small className="support-trust"><ShieldCheck size={13} /> Offisiell registerinformasjon</small></article>;
}

function SupportFollowUpDialog({ organizationNumber, award, onClose, onCreated }: { organizationNumber: string; award: SupportAward; onClose: () => void; onCreated: () => void }) {
  const awardYear = award.awardDate ? Number(award.awardDate.slice(0, 4)) : NaN;
  const suggestedDeadline = award.awardDate && /^\d{4}-\d{2}-\d{2}$/.test(award.awardDate) ? `${new Date().getFullYear()}${award.awardDate.slice(4)}` : '';
  const [taskType, setTaskType] = useState<SupportFollowUp['taskType']>('apply');
  const [deadline, setDeadline] = useState(suggestedDeadline);
  const [repeatYearly, setRepeatYearly] = useState(true);
  const [endDate, setEndDate] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const schemeName = award.schemeName ?? 'Støtteordning ikke oppgitt';
  const submit = async () => {
    if (!deadline) { setError('Velg en frist før du lagrer oppfølgingen.'); return; }
    setSaving(true); setError('');
    try {
      const recurrence = repeatYearly ? { frequency: 'yearly' as const, interval: 1, dayOfMonth: Number(deadline.slice(8, 10)), startDate: deadline, ...(endDate ? { endDate } : {}) } : undefined;
      await api.createSupportFollowUp(organizationNumber, { schemeName, providerName: award.providerName, sourceAwardIds: [award.id], sourceLinks: [award.schemeUrl ?? SUPPORT_REGISTRY_SOURCE_URL], taskType, deadline, ...(recurrence ? { recurrence } : {}), status: 'not_started', ...(comment.trim() ? { comment: comment.trim() } : {}), trustLevel: 'USER_REPORTED' });
      onCreated();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Kunne ikke lagre støtteoppfølgingen.');
    } finally { setSaving(false); }
  };
  return <div className="dialog-backdrop" role="presentation"><div className="dialog support-followup-dialog" role="dialog" aria-modal="true" aria-labelledby="support-followup-title"><div className="dialog-heading"><div><p className="eyebrow">Lokal planlegging</p><Heading level={2} id="support-followup-title">Følg opp støtte</Heading><Paragraph>{schemeName} · {award.providerName}</Paragraph></div><button type="button" onClick={onClose} aria-label="Lukk"><X /></button></div><Alert data-color="warning"><AlertCircle size={17} />Dette oppretter en lokal oppgave for virksomheten. Tidligere tildeling er bare et signal – ORaKeL konkluderer ikke med at dere har krav på støtte eller at ordningen finnes i år.</Alert><div className="form-grid"><label>Hva vil du følge opp?<select value={taskType} onChange={(event) => setTaskType(event.target.value as SupportFollowUp['taskType'])}><option value="apply">Søke støtte</option><option value="clarify">Avklare støtte</option><option value="follow_up">Følge opp tidligere støtte</option></select></label><DateField label="Frist" value={deadline} onChange={setDeadline} /><label className="support-repeat-option"><input type="checkbox" checked={repeatYearly} onChange={(event) => setRepeatYearly(event.target.checked)} /> Gjenta årlig på samme dato</label>{repeatYearly && <DateField label="Gjenta til (valgfritt)" value={endDate} onChange={setEndDate} />}<label className="local-comment wide-field">Kommentar (valgfritt)<Textarea rows={4} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="For eksempel: Kontroller om ny utlysning kommer i februar." /></label></div>{Number.isFinite(awardYear) && <p className="muted support-followup-hint">Forslaget er basert på en registrert tildeling fra {awardYear}. Kontroller selv at fristen og gjentakelsen passer.</p>}{error && <Alert data-color="danger"><AlertCircle size={16} />{error}</Alert>}<div className="dialog-actions"><Button variant="secondary" onClick={onClose} disabled={saving}>Avbryt</Button><Button onClick={() => void submit()} disabled={saving}>{saving ? 'Lagrer…' : 'Lagre i arbeidsliste'}</Button></div></div></div>;
}

const supervisionNoticeTypeLabels: Record<SupervisionNotice['noticeType'], string> = {
  ANNOUNCED: 'Varslet tilsyn', UNANNOUNCED: 'Uanmeldt tilsyn', DOCUMENT_REVIEW: 'Dokumenttilsyn', UNKNOWN: 'Type ikke avklart',
};

function SupervisionWorkspace({ organization, themes, notices, obligations, sources, onSelectObligation, onAskLos, onNoticeCreated }: { organization: Organization; themes: SupervisionTheme[]; notices: SupervisionNotice[]; obligations: Obligation[]; sources: Source[]; onSelectObligation: (id: string) => void; onAskLos: (prompt: string) => void; onNoticeCreated: (notice: SupervisionNotice) => void }) {
  const [selectedId, setSelectedId] = useState(themes[0]?.id ?? '');
  const [showNoticeDialog, setShowNoticeDialog] = useState(false);
  useEffect(() => {
    if (!themes.some((theme) => theme.id === selectedId)) setSelectedId(themes[0]?.id ?? '');
  }, [selectedId, themes]);
  const selected = themes.find((theme) => theme.id === selectedId) ?? themes[0];
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const relatedObligations = selected ? obligations.filter((obligation) => selected.relatedObligationIds.includes(obligation.id)) : [];
  return <div className="supervision-workspace">
    <Card className="surface-card supervision-intro"><div className="workspace-landing-icon"><ShieldCheck size={20} /></div><div><p className="eyebrow">Tilsyn og forberedelse</p><Heading level={2}>Hva kan være relevant for virksomheten?</Heading><Paragraph>Dette er generelle tilsynstemaer, ikke varsler om tilsyn. Et konkret varsel må registreres og dokumenteres separat før det kan vises som offisiell informasjon.</Paragraph><div className="supervision-org-context"><Landmark size={16} />{organization.name} · {organization.orgNumber}</div></div></Card>
    <div className="supervision-layout"><div className="supervision-theme-list" aria-label="Mulige tilsynstemaer">{themes.map((theme) => <button key={theme.id} className={selected?.id === theme.id ? 'selected' : ''} onClick={() => setSelectedId(theme.id)}><span><strong>{theme.title}</strong><small>{theme.responsibleAgency}</small></span><ChevronRight size={16} /></button>)}</div>{selected && <Card className="surface-card supervision-detail"><div className="detail-topline"><span className="eyebrow">Mulig relevant tema</span><TrustLabel level={selected.officialStatus} /></div><Heading level={2}>{selected.title}</Heading><p className="supervision-agency">Forvaltes av {selected.responsibleAgency}</p><Paragraph>{selected.description}</Paragraph><div className="supervision-reasons"><strong>Hvorfor vises dette?</strong>{selected.relevanceReasons.length > 0 ? selected.relevanceReasons.map((reason) => <span key={reason}>✓ {reason}</span>) : <span>Ingen virksomhetsspesifikk treffgrunn er bekreftet ennå.</span>}{selected.missingInformation.map((item) => <span className="supervision-missing" key={item}>? Må avklares: {item}</span>)}</div><div className="detail-section"><strong>Områder å ha oversikt over</strong><div className="tag-row">{selected.topics.map((topic) => <Tag key={topic}>{topic}</Tag>)}</div></div>{relatedObligations.length > 0 && <div className="detail-section"><strong>Koblede rapporteringsoppgaver</strong><div className="supervision-related-tasks">{relatedObligations.map((obligation) => <button key={obligation.id} onClick={() => onSelectObligation(obligation.id)}><span>{obligation.name}</span><ChevronRight size={15} /></button>)}</div></div>}<div className="supervision-actions"><Button onClick={() => onAskLos(`Forklar tilsynstemaet «${selected.title}» for ${organization.name}. Bruk virksomhetsinformasjonen som kontekst, skill mellom generell veiledning og konkrete opplysninger, og vis hva som må avklares.`)}><Sparkles size={15} /> Spør losen om temaet</Button></div><div className="detail-section supervision-sources"><strong>Autoritative kilder og veiledere</strong>{selected.sourceLinks.map((sourceId) => { const source = sourceById.get(sourceId); return source ? <a href={source.url} target="_blank" rel="noreferrer" key={source.id}><ShieldCheck size={14} />{source.title}<ExternalLink size={13} /></a> : null; })}</div><p className="supervision-disclaimer">Tilsynstemaet er et kunnskapsforslag. ORaKeL viser ikke at et tilsyn er varslet eller at en bestemt plikt gjelder.</p></Card>}</div>
    <Card className="surface-card supervision-notices"><div className="supervision-notices-heading"><div><p className="eyebrow">Virksomhetens dokumentasjon</p><Heading level={3}>Mottatte tilsynsvarsler</Heading><Paragraph>Registrer et varsel dere faktisk har mottatt. Det lagres som brukerinnspill og blir ikke tolket som et offisielt varsel før det er kontrollert.</Paragraph></div><Button variant="secondary" onClick={() => setShowNoticeDialog(true)}><Plus size={15} /> Registrer varsel</Button></div>{notices.length > 0 ? <div className="supervision-notice-list">{notices.map((notice) => <article className="supervision-notice" key={notice.id}><div className="detail-topline"><TrustLabel level={notice.trustLevel} /><Tag>{supervisionNoticeTypeLabels[notice.noticeType]}</Tag></div><Heading level={4}>{notice.title}</Heading><div className="supervision-notice-facts"><span><Landmark size={14} />{notice.responsibleAgency}</span>{notice.date && <span>Dato: {formatDate(notice.date, true)}</span>}{notice.deadline && <span>Svarfrist: {formatDate(notice.deadline, true)}</span>}</div><p>{notice.description}</p>{notice.sourceLinks.length > 0 && <div className="supervision-notice-links">{notice.sourceLinks.map((link) => <a href={link} target="_blank" rel="noreferrer" key={link}>{link}<ExternalLink size={13} /></a>)}</div>}<small>Kun brukerregistrert dokumentasjon · ikke verifisert av ORaKeL</small></article>)}</div> : <div className="supervision-notices-empty"><ShieldCheck size={18} /><span>Ingen mottatte varsler er registrert for denne virksomheten ennå.</span></div>}</Card>
    {showNoticeDialog && <SupervisionNoticeDialog organizationNumber={organization.orgNumber} themes={themes} onClose={() => setShowNoticeDialog(false)} onCreated={(notice) => { onNoticeCreated(notice); setShowNoticeDialog(false); }} />}
  </div>;
}

function SupervisionNoticeDialog({ organizationNumber, themes, onClose, onCreated }: { organizationNumber: string; themes: SupervisionTheme[]; onClose: () => void; onCreated: (notice: SupervisionNotice) => void }) {
  const [title, setTitle] = useState('');
  const [agency, setAgency] = useState('');
  const [noticeType, setNoticeType] = useState<SupervisionNotice['noticeType']>('UNKNOWN');
  const [theme, setTheme] = useState('');
  const [date, setDate] = useState('');
  const [deadline, setDeadline] = useState('');
  const [description, setDescription] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    setSaving(true); setError('');
    try {
      const notice = await api.createSupervisionNotice(organizationNumber, { title, responsibleAgency: agency, noticeType, ...(theme ? { theme } : {}), ...(date ? { date } : {}), ...(deadline ? { deadline } : {}), description, sourceLinks: sourceUrl.trim() ? [sourceUrl.trim()] : [] });
      onCreated(notice);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Kunne ikke registrere varselet.');
    } finally {
      setSaving(false);
    }
  };
  return <div className="dialog-backdrop" role="presentation"><div className="dialog supervision-notice-dialog" role="dialog" aria-modal="true" aria-labelledby="supervision-notice-title"><div className="dialog-heading"><div><p className="eyebrow">Brukerregistrert dokumentasjon</p><Heading level={2} id="supervision-notice-title">Registrer mottatt tilsynsvarsel</Heading><Paragraph>Dette er et eget brukerinnspill. Det endrer ikke offisielle opplysninger og oppretter ikke en rapporteringsplikt.</Paragraph></div><button type="button" onClick={onClose} aria-label="Lukk"><X /></button></div><div className="form-grid"><Textfield label="Tittel" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="For eksempel varsel om dokumenttilsyn" /><Textfield label="Etat" value={agency} onChange={(event) => setAgency(event.target.value)} placeholder="For eksempel Arbeidstilsynet" /><label>Type<select value={noticeType} onChange={(event) => setNoticeType(event.target.value as SupervisionNotice['noticeType'])}>{Object.entries(supervisionNoticeTypeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Tilsynstema<select value={theme} onChange={(event) => setTheme(event.target.value)}><option value="">Ikke avklart</option>{themes.map((item) => <option value={item.title} key={item.id}>{item.title}</option>)}</select></label><DateField label="Mottatt dato (valgfritt)" value={date} onChange={setDate} /><DateField label="Svarfrist (valgfritt)" value={deadline} onChange={setDeadline} /><label className="wide-field">Hva gjelder varselet?<Textarea rows={5} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Beskriv kort hva etaten har varslet eller bedt om." /></label><Textfield className="wide-field" label="Lenke til varsel eller vedlegg (valgfritt)" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://…" /></div>{error && <Alert data-color="danger"><AlertCircle size={17} />{error}</Alert>}<div className="dialog-actions"><Button variant="secondary" onClick={onClose} disabled={saving}>Avbryt</Button><Button onClick={() => void submit()} disabled={saving || title.trim().length < 3 || agency.trim().length < 2 || description.trim().length < 3}>{saving ? 'Lagrer…' : 'Registrer varsel'}</Button></div></div></div>;
}

function ConceptWorkspace({ selectedObligation, onAskLos }: { selectedObligation: Obligation | null; onAskLos: (prompt: string, conceptId: string) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Concept[]>([]);
  const [selected, setSelected] = useState<Concept | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const search = async () => {
    const normalized = query.trim();
    if (!normalized) { setResults([]); setSelected(null); return; }
    setLoading(true);
    setError('');
    try {
      setResults(await api.concepts(normalized));
      setSelected(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Begrepskatalogen kunne ikke søkes akkurat nå.');
    } finally {
      setLoading(false);
    }
  };
  const openConcept = async (result: Concept) => {
    setSelected(result);
    try {
      setSelected(await api.concept(result.id));
    } catch {
      // Search results are still useful when a detail request is unavailable.
    }
  };
  const suggestedQuery = selectedObligation?.name ?? 'rapporteringsplikt';
  return <div className="concept-workspace">
    <Card className="surface-card concept-intro"><div className="workspace-landing-icon"><BookOpen size={20} /></div><div><p className="eyebrow">Begrepsassistent</p><Heading level={2}>Finn og forstå offentlige begreper</Heading><Paragraph>Søk i begreper fra Felles datakatalog. Definisjonen og utgiveren vises separat fra ORaKeLs egne forklaringer og KI-forslag.</Paragraph></div></Card>
    <Card className="surface-card concept-search-card"><div className="concept-search-heading"><div><Heading level={3}>Søk etter et begrep</Heading><span>{selectedObligation ? `Tips: begreper knyttet til «${selectedObligation.name}» kan avklare oppgaven.` : 'Prøv for eksempel «arbeidstaker», «internkontroll» eller «mva».'}</span></div><Search size={18} /></div><div className="concept-search-form"><Textfield aria-label="Søk etter begrep" placeholder={`Søk, for eksempel ${suggestedQuery}`} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void search(); }} /><Button onClick={() => void search()} disabled={loading || !query.trim()}>{loading ? 'Søker…' : 'Søk'}</Button></div>{error && <Alert data-color="danger"><AlertCircle size={16} />{error}</Alert>}{results.length > 0 && <div className="concept-results" aria-label="Begrepstreff">{results.map((concept) => <button key={concept.id} className={selected?.id === concept.id ? 'selected' : ''} onClick={() => void openConcept(concept)}><span><strong>{concept.term}</strong><small>{concept.publisher}{concept.definition ? ` · ${concept.definition}` : ''}</small></span><ChevronRight size={16} /></button>)}</div>}{!loading && query.trim() && results.length === 0 && !error && <p className="muted">Ingen begreper funnet i katalogen eller mockdata.</p>}</Card>
    {selected && <Card className="surface-card concept-detail"><div className="detail-topline"><span className="eyebrow">Begrepsdetaljer</span><TrustLabel level={selected.trustLevel} /></div><Heading level={2}>{selected.term}</Heading>{selected.alternativeTerms.length > 0 && <p className="concept-alternatives">Også kalt: {selected.alternativeTerms.join(', ')}</p>}<div className="concept-definition"><strong>Offisiell definisjon</strong><p>{selected.definition ?? 'Ingen definisjon ble publisert i treffet.'}</p></div><div className="concept-facts"><span><small>Utgiver</small><strong>{selected.publisher}</strong></span>{selected.status && <span><small>Status</small><strong>{selected.status}</strong></span>}{selected.subject && <span><small>Emne</small><strong>{selected.subject}</strong></span>}</div>{selected.relatedConcepts.length > 0 && <div className="detail-section"><strong>Relaterte begreper</strong><div className="tag-row">{selected.relatedConcepts.map((relation) => <Tag key={`${relation.relation}-${relation.uri}`}>{relation.relation}</Tag>)}</div></div>}<div className="concept-detail-actions"><a href={selected.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Åpne kilde</a><Button onClick={() => onAskLos(`Forklar begrepet «${selected.term}» for virksomheten vår. Vis hvordan det kan henge sammen med rapporteringsoppgaver, men skill tydelig mellom definisjon, veiledning og KI-forslag.`, selected.id)}><Sparkles size={15} /> Spør losen om begrepet</Button></div><p className="concept-trust"><ShieldCheck size={14} /> Definisjonen er hentet fra {selected.publisher}. ORaKeL gjør ingen juridisk konklusjon på grunnlag av begrepet alene.</p></Card>}
  </div>;
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [displayValue, setDisplayValue] = useState(() => formatDateInput(value));
  const nativeInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => setDisplayValue(formatDateInput(value)), [value]);
  const openPicker = () => {
    const input = nativeInputRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
    if (!input) return;
    if (input.showPicker) input.showPicker();
    else input.click();
  };
  return <div className="date-field"><Textfield label={label} type="text" inputMode="numeric" placeholder="dd/mm/åååå" value={displayValue} onChange={(event) => { const nextDisplayValue = event.target.value; setDisplayValue(nextDisplayValue); onChange(parseDateInput(nextDisplayValue)); }} /><button type="button" className="date-picker-trigger" onClick={openPicker} aria-label={`Velg dato for ${label}`}><CalendarDays size={16} /></button><input ref={nativeInputRef} className="native-date-picker" type="date" value={value} onChange={(event) => { setDisplayValue(formatDateInput(event.target.value)); onChange(event.target.value); }} tabIndex={-1} aria-hidden="true" /></div>;
}

function OrganizationMuteControl({ orgNumber, mutedBefore, onChanged }: { orgNumber: string; mutedBefore: string; onChanged: () => void }) {
  const [cutoff, setCutoff] = useState(mutedBefore);
  const [saving, setSaving] = useState(false);
  useEffect(() => setCutoff(mutedBefore), [mutedBefore]);
  const save = async (nextCutoff: string | undefined) => {
    setSaving(true);
    try {
      await api.saveOrganizationViewPreference(orgNumber, nextCutoff);
      onChanged();
    } finally {
      setSaving(false);
    }
  };
  return <Card className="surface-card mute-card organization-mute-card"><div><p className="eyebrow">Virksomhetsvisning</p><strong>Demp forekomster før valgt dato</strong><p>Forekomster før valgt dato vises grå i årshjulet og listen. Dette endrer ikke offisielle opplysninger, status eller skjuling.</p>{mutedBefore && <p>Aktiv grense: forekomster før {formatDate(mutedBefore, true)}</p>}</div><div className="mute-actions"><DateField label="Demp forekomster før" value={cutoff} onChange={setCutoff} /><Button variant="secondary" onClick={() => void save(cutoff || undefined)} disabled={saving || !cutoff}>{saving ? 'Lagrer…' : 'Demp forekomster før dato'}</Button>{mutedBefore && <Button variant="secondary" onClick={() => { setCutoff(''); void save(undefined); }} disabled={saving}>Vis dempede forekomster igjen</Button>}</div></Card>;
}

function MuteControl({ orgNumber, obligation, onTaskChanged }: { orgNumber: string; obligation: Obligation; onTaskChanged: (nextSelectedId?: string | null) => void }) {
  const [until, setUntil] = useState('');
  const [historicalBefore, setHistoricalBefore] = useState(obligation.mutedBefore ?? '');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setUntil('');
    setHistoricalBefore(obligation.mutedBefore ?? '');
  }, [obligation.id, obligation.mutedBefore]);
  const save = async (muted: boolean) => {
    setSaving(true);
    try {
      await api.saveTaskPreference(orgNumber, obligation.id, { activated: Boolean(obligation.isActivated), muted, mutedUntil: muted ? until || undefined : undefined });
      onTaskChanged();
    } finally {
      setSaving(false);
    }
  };
  const saveHistoricalMute = async () => {
    setSaving(true);
    try {
      await api.saveTaskPreference(orgNumber, obligation.id, { activated: Boolean(obligation.isActivated), mutedBefore: historicalBefore || '' });
      onTaskChanged();
    } finally {
      setSaving(false);
    }
  };
  return <Card className="surface-card mute-card"><div><p className="eyebrow">Oversiktsvisning</p><strong>{obligation.isMuted ? 'Oppgaven er dempet' : 'Demp valgt oppgave'}</strong><p>{obligation.isMuted ? 'Oppgaven kan aktiveres igjen når du vil.' : 'Demping er forskjellig fra skjuling og endrer ikke den offisielle oppgaven.'}</p>{obligation.mutedBefore && <p>Forekomster før {formatDate(obligation.mutedBefore, true)} vises som dempet.</p>}{isAutomated(obligation) && <p className="automation-note">Systeminnsending er hentet fra Oppgaveregisterets rapporteringsform. Dette er en offisiell opplysning og kan ikke endres som en lokal innstilling.</p>}</div><div className="mute-actions"><DateField label="Demp forekomster før" value={historicalBefore} onChange={setHistoricalBefore} /><Button variant="secondary" onClick={() => void saveHistoricalMute()} disabled={saving || !historicalBefore}>Demp historikk</Button>{obligation.mutedBefore && <Button variant="secondary" onClick={() => { setHistoricalBefore(''); void saveHistoricalMute(); }} disabled={saving}>Vis historikk igjen</Button>}{obligation.isMuted ? <Button variant="secondary" onClick={() => void save(false)} disabled={saving}>Aktiver oppgaven</Button> : <><DateField label="Demp oppgaven til (valgfritt)" value={until} onChange={setUntil} /><Button variant="secondary" onClick={() => void save(true)} disabled={saving}>Demp oppgaven</Button></>}</div></Card>;
}

function YearWheel({ obligations, start, includeHidden, selectedId, selectedOccurrenceDate, onSelect }: { obligations: Obligation[]; start: Date; includeHidden: boolean; selectedId?: string; selectedOccurrenceDate?: string; onSelect: (id: string, date?: string) => void }) {
  const grouped = useMemo(() => {
    const buckets = Array.from({ length: 12 }, (_, index) => ({ month: shiftMonth(start, index), items: [] as Array<{ item: Obligation; date?: string }> }));
    for (const item of obligations) {
      const dates = occurrenceDatesForWindow(item, start, 12);
      if (dates.length === 0) {
        continue;
      }
      for (const date of dates) {
        if (!includeHidden && occurrenceHidden(item, date)) continue;
        const candidate = new Date(`${occurrenceDeadline(item, date)}T12:00:00`);
        const monthIndex = (candidate.getFullYear() - start.getFullYear()) * 12 + candidate.getMonth() - start.getMonth();
        if (monthIndex >= 0 && monthIndex < buckets.length) buckets[monthIndex].items.push({ item, date });
      }
    }
    return buckets;
  }, [includeHidden, obligations, start]);
  return <div className="year-wheel">{grouped.map(({ month, items }) => <div className={`month-cell ${items.length ? 'has-items' : ''} ${isCurrentMonth(month) ? 'is-current-month' : ''}`} key={dateKey(month)}><span className="month-label">{monthName(month)} {month.getFullYear()}{isCurrentMonth(month) && <small className="current-month-label">Denne måneden</small>}</span>{items.map(({ item, date }) => { const itemStatus = itemStatusForDate(item, date); const displayDate = occurrenceDeadline(item, date); const state = deadlineState(itemStatus, displayDate, isAutomated(item)); const automated = automationLabel(item); const muted = isMutedForDate(item, displayDate); const supportLabel = item.kind === 'support_follow_up' ? ' · Støtteoppfølging' : ''; return <button key={`${item.id}-${date ?? 'no-date'}`} title={`${item.name} · ${formatDate(displayDate, true)}`} className={`calendar-item ${statusClass[itemStatus]} deadline-${state} ${isAutomated(item) ? 'is-automated' : ''} ${muted ? 'is-muted' : ''} ${item.kind === 'support_follow_up' ? 'is-support-follow-up' : ''} ${selectedId === item.id && selectedOccurrenceDate === date ? 'is-selected' : ''}`} onClick={() => onSelect(item.id, date)}><span className={`calendar-dot ${isAutomated(item) ? 'system-dot' : ''}`} />{item.name}<small>{formatDate(displayDate, true)} · {automated || statusLabels[itemStatus]}{automated && itemStatus === 'completed' ? ` · ${statusLabels[itemStatus]}` : ''}{supportLabel}{muted ? ' · Dempet' : ''}{deadlineStateLabel(state) ? ` · ${deadlineStateLabel(state)}` : ''}</small></button>; })}</div>)}</div>;
}

function NoDatePanel({ items, selectedId, onSelect }: { items: Array<{ item: Obligation; date?: string }>; selectedId?: string; onSelect: (id: string, date?: string) => void }) {
  const [query, setQuery] = useState('');
  const [eventFilter, setEventFilter] = useState('all');
  const eventOptions = useMemo(() => [...new Set(items.map(({ item }) => eventCategory(item)))].sort((left, right) => left.localeCompare(right, 'nb')), [items]);
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('nb-NO');
    return items.filter(({ item }) => {
      if (eventFilter !== 'all' && eventCategory(item) !== eventFilter) return false;
      if (!normalizedQuery) return true;
      return `${item.name} ${item.description} ${item.responsibleAgency} ${item.eventLabel ?? ''} ${item.legalBasis}`.toLocaleLowerCase('nb-NO').includes(normalizedQuery);
    });
  }, [eventFilter, items, query]);
  return <div className="month-cell no-date-panel has-items"><div className="no-date-heading"><div><span className="month-label">Uten fast frist</span><small>{filtered.length} av {items.length} oppgaver</small></div><span className="no-date-hint">Søk i katalogen og velg en oppgave for å legge den i arbeidslisten</span></div><div className="no-date-controls"><Textfield className="no-date-search" aria-label="Søk i oppgaver uten fast frist" placeholder="Søk etter hendelse eller oppgave" value={query} onChange={(event) => setQuery(event.target.value)} /><select value={eventFilter} onChange={(event) => setEventFilter(event.target.value)} aria-label="Filtrer oppgaver uten fast frist"><option value="all">Alle hendelser</option>{eventOptions.map((event) => <option value={event} key={event}>{event}</option>)}</select></div><div className="no-date-list">{filtered.length > 0 ? filtered.map(({ item }) => { const itemStatus = statusForDate(item.status, undefined, item.statusByDate); return <button key={item.id} className={`calendar-item ${statusClass[itemStatus]} ${item.isMuted ? 'is-muted' : ''} ${selectedId === item.id ? 'is-selected' : ''}`} onClick={() => onSelect(item.id)}><span className="calendar-dot" /><span>{item.name}</span><small>{eventCategory(item)} · {statusLabels[itemStatus]}{item.isMuted ? ' · Dempet' : ''}</small></button>; }) : <p className="no-date-empty">Ingen oppgaver matcher søket.</p>}</div></div>;
}

function ObligationList({ obligations, selectedId, onSelect }: { obligations: Obligation[]; selectedId?: string; onSelect: (id: string, date?: string) => void }) {
  return <div className="obligation-list">{obligations.map((item) => { const firstDate = item.deadlineDates?.[0]; const deadline = occurrenceDeadline(item, firstDate); const itemStatus = itemStatusForDate(item, firstDate); const state = deadlineState(itemStatus, deadline, isAutomated(item)); const muted = isMutedForDate(item, deadline); return <button className={`list-obligation deadline-${state} ${isAutomated(item) ? 'is-automated' : ''} ${muted ? 'is-muted' : ''} ${item.kind === 'support_follow_up' ? 'is-support-follow-up' : ''} ${selectedId === item.id ? 'is-selected' : ''}`} key={item.id} onClick={() => onSelect(item.id, firstDate)}><span className={`timeline-dot ${statusClass[itemStatus]} ${isAutomated(item) ? 'system-dot' : ''}`} /><span><strong>{item.name}</strong><small>{item.kind === 'support_follow_up' ? 'Støtteoppfølging' : item.frequency} · {deadline ? `frist ${formatDate(deadline, true)}` : 'hendelsesutløst'}{automationLabel(item) ? ` · ${automationLabel(item)}` : ''}{muted ? ' · Dempet' : ''}{deadlineStateLabel(state) ? ` · ${deadlineStateLabel(state)}` : ''}</small></span><ChevronRight size={17} /></button>; })}</div>;
}

function TaskRow({ obligation, selected, onClick }: { obligation: Obligation; selected: boolean; onClick: () => void }) {
  const firstDate = obligation.deadlineDates?.[0];
  const deadline = occurrenceDeadline(obligation, firstDate);
  const itemStatus = itemStatusForDate(obligation, firstDate);
  const state = deadlineState(itemStatus, deadline, isAutomated(obligation));
  const hasComment = Boolean(obligation.localComment || Object.values(obligation.localCommentByDate ?? {}).some(Boolean));
  const muted = isMutedForDate(obligation, deadline);
  return <button className={`task-row deadline-${state} ${isAutomated(obligation) ? 'is-automated' : ''} ${muted ? 'is-muted' : ''} ${obligation.kind === 'support_follow_up' ? 'is-support-follow-up' : ''} ${selected ? 'is-selected' : ''}`} onClick={onClick}><div className={`task-icon ${statusClass[itemStatus]} ${isAutomated(obligation) ? 'system-dot' : ''}`}>{isEventLike(obligation) ? <CircleHelp size={18} /> : <CalendarDays size={18} />}</div><div className="task-main"><div className="task-title-row"><strong>{obligation.name}</strong><TrustLabel level={obligation.officialStatus} />{obligation.kind === 'support_follow_up' && <span className="support-label">Støtteoppfølging</span>}{hasComment && <span className="local-note">Kommentar</span>}{automationLabel(obligation) && <span className="automation-label">{automationLabel(obligation)}</span>}{muted && <span className="muted-label">Dempet</span>}{obligation.isHidden && <span className="hidden-label"><EyeOff size={12} /> Skjult</span>}</div><span>{obligation.eventLabel || obligation.responsibleAgency} · {obligation.frequency}</span></div><div className="task-deadline"><small>{obligation.localDeadline || obligation.deadlineByDate?.[firstDate ?? ''] ? 'Lokal frist' : 'Frist'}</small><strong>{formatDate(deadline, true)}</strong>{deadlineStateLabel(state) && <span className={`deadline-label deadline-${state}`}>{deadlineStateLabel(state)}</span>}</div><div className="task-status"><span className={`status-pill ${statusClass[itemStatus]}`}>{automationLabel(obligation) && itemStatus !== 'completed' ? automationLabel(obligation) : statusLabels[itemStatus]}</span><ChevronRight size={18} /></div></button>;
}

function ObligationGuidance({ obligation }: { obligation: Obligation }) {
  const info = obligation.detailInfo;
  const [open, setOpen] = useState(false);
  if (!info || (!info.targetAudience && info.usageContexts.length === 0 && info.usageNotes.length === 0 && info.dataSources.length === 0)) return null;
  return <section className="detail-section obligation-guidance"><button type="button" className="detail-disclosure" aria-expanded={open} onClick={() => setOpen((current) => !current)}><span><strong>Mer om rapporteringen</strong><small>{open ? 'Skjul utdypende informasjon' : 'Vis målgruppe, bruk og registrerte datakilder'}</small></span><ChevronRight size={17} className={open ? 'rotated' : ''} /></button>{open && <div className="obligation-guidance-content">{info.targetAudience && <div><small>Hvem gjelder dette for?</small><p><InlineConceptText text={info.targetAudience} showSelectionTip={false} /></p></div>}{info.usageContexts.length > 0 && <div><small>Når brukes den?</small><p><InlineConceptText text={info.usageContexts.join(' · ')} showSelectionTip={false} /></p></div>}{info.usageNotes.length > 0 && <div><small>Hva beskriver registeret?</small><p><InlineConceptText text={info.usageNotes.join(' ')} showSelectionTip={false} /></p></div>}{info.dataSources.length > 0 && <div><small>Opplysninger som kan inngå</small><p className="data-concept-list">{info.dataSources.map((item) => <ConceptLookup key={item} label={item} query={conceptQueryForDataElement(item)} className="data-concept-link">{item}</ConceptLookup>)}</p></div>}<p className="guidance-disclaimer">Dette er utdypende registerinformasjon. Se kildene under for gjeldende veiledning og innsending.</p></div>}</section>;
}

function ObligationSources({ obligation, linkedSources }: { obligation: Obligation; linkedSources: Source[] }) {
  const links = [...(obligation.guidanceLinks ?? []).map((link) => ({ ...link, key: link.url })), ...linkedSources.map((source) => ({ title: source.title, url: source.url, sourceLabel: source.officiality === 'OFFICIAL' ? 'Oppgaveregisteret' as const : 'Offisiell etat' as const, key: source.id }))].filter((link, index, all) => all.findIndex((candidate) => candidate.url === link.url) === index);
  return <section className="detail-section obligation-sources"><strong>Veiledning og kilder</strong>{links.length > 0 ? <div className="obligation-source-links">{links.map((link) => <a href={safeExternalUrl(link.url) ?? undefined} target="_blank" rel="noreferrer" key={link.key}><span><strong>{link.title}</strong><small>{link.sourceLabel}</small></span><ExternalLink size={15} /></a>)}</div> : <p className="muted">Ingen veiledningslenke er registrert for denne oppgaven ennå.</p>}</section>;
}

function ObligationDetail({ orgNumber, obligation, occurrenceDate, sources, onTaskChanged }: { orgNumber: string; obligation: Obligation | null; occurrenceDate: string | null; sources: Source[]; onTaskChanged: (nextSelectedId?: string | null) => void }) {
  const [status, setStatus] = useState<TaskStatus>('not_started');
  const [showSchedule, setShowSchedule] = useState(false);
  const [frequency, setFrequency] = useState<'monthly' | 'quarterly' | 'yearly'>('monthly');
  const [interval, setInterval] = useState('1');
  const [dayOfMonth, setDayOfMonth] = useState('5');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState('');
  const [comment, setComment] = useState('');
  const [localDeadline, setLocalDeadline] = useState('');
  const [hiddenUntil, setHiddenUntil] = useState('');
  const [hiddenScope, setHiddenScope] = useState<'instance' | 'all'>('instance');
  const [showLegalBasis, setShowLegalBasis] = useState(false);
  const [saving, setSaving] = useState(false);
  const selectedDate = occurrenceDate ?? obligation?.deadlineDates?.[0];
  const instanceDate = occurrenceDate ?? obligation?.localDeadline ?? obligation?.deadline ?? obligation?.deadlineDates?.[0];
  useEffect(() => {
    setStatus(obligation ? itemStatusForDate(obligation, instanceDate) : 'not_started');
    setShowLegalBasis(false);
    setHiddenUntil('');
    setLocalDeadline(selectedDate ? obligation?.deadlineByDate?.[selectedDate] ?? obligation?.localDeadline ?? '' : obligation?.localDeadline ?? '');
    setComment(selectedDate ? obligation?.localCommentByDate?.[selectedDate] ?? obligation?.localComment ?? '' : obligation?.localComment ?? '');
  }, [obligation?.id, obligation?.status, obligation?.statusByDate, obligation?.deadlineByDate, obligation?.localCommentByDate, obligation?.localComment, instanceDate, selectedDate]);
  if (!obligation) return <Card className="surface-card detail-card"><Heading level={3}>Velg en oppgave</Heading><Paragraph>Klikk på en oppgave i årshjulet eller arbeidslisten for å se detaljer.</Paragraph></Card>;
  const isSupportFollowUp = obligation.kind === 'support_follow_up' && Boolean(obligation.supportFollowUpId);
  const linkedSources = sources.filter((source) => obligation.sourceLinks.includes(source.id));
  const hasOfficialDeadline = Boolean(obligation.deadline || obligation.deadlineDates?.length);
  const saveStatus = async (nextStatus: TaskStatus) => { setSaving(true); try { const selectedStatusDate = occurrenceDate ?? obligation.deadlineDates?.[0]; if (isSupportFollowUp && obligation.supportFollowUpId) await api.updateSupportFollowUp(orgNumber, obligation.supportFollowUpId, { status: nextStatus }); else { const statusByDate = selectedStatusDate ? { ...(obligation.statusByDate ?? {}), [selectedStatusDate]: nextStatus } : undefined; await api.saveTaskPreference(orgNumber, obligation.id, { ...(statusByDate ? { statusByDate } : { status: nextStatus }), activated: Boolean(obligation.isActivated) }); } setStatus(nextStatus); onTaskChanged(); } finally { setSaving(false); } };
  const saveLocalDetails = async () => { setSaving(true); try { if (isSupportFollowUp && obligation.supportFollowUpId) await api.updateSupportFollowUp(orgNumber, obligation.supportFollowUpId, { deadline: localDeadline || undefined, comment }); else await api.saveTaskPreference(orgNumber, obligation.id, { ...(selectedDate ? { occurrenceDate: selectedDate } : {}), activated: Boolean(obligation.isActivated || localDeadline), deadlineOverride: localDeadline || null, comment }); onTaskChanged(); } finally { setSaving(false); } };
  const setActivation = async (activated: boolean) => { if (isSupportFollowUp) return; setSaving(true); try { await api.saveTaskPreference(orgNumber, obligation.id, { activated }); onTaskChanged(); } finally { setSaving(false); } };
  const activateSchedule = async () => { setSaving(true); await api.saveTaskPreference(orgNumber, obligation.id, { activated: true, comment, recurrence: { frequency, interval: Math.max(1, Number(interval) || 1), dayOfMonth: Math.min(31, Math.max(1, Number(dayOfMonth) || 1)), startDate, endDate: endDate || undefined } }); setShowSchedule(false); setSaving(false); onTaskChanged(); };
  const selectedHidden = selectedDate ? obligation.isHidden === true || obligation.hiddenByDate?.[selectedDate] === true : obligation.isHidden === true;
  const setHidden = async (until?: string) => { setSaving(true); try { await api.saveTaskPreference(orgNumber, obligation.id, { activated: Boolean(obligation.isActivated), ...(hiddenScope === 'instance' && selectedDate ? { occurrenceDate: selectedDate } : {}), hiddenScope, hiddenUntil: until, hiddenForever: !until }); onTaskChanged(null); } finally { setSaving(false); } };
  const unhide = async () => { setSaving(true); try { const scope = obligation.isHidden ? 'all' : hiddenScope; await api.saveTaskPreference(orgNumber, obligation.id, { activated: Boolean(obligation.isActivated), ...(scope === 'instance' && selectedDate ? { occurrenceDate: selectedDate } : {}), hiddenScope: scope, hiddenUntil: undefined, hiddenForever: false }); onTaskChanged(); } finally { setSaving(false); } };
  return <Card className="surface-card detail-card"><div className="detail-topline"><span className="eyebrow">Oppgavedetaljer</span><span className={`status-pill ${statusClass[status]}`}>{statusLabels[status]}</span></div><Heading level={3}>{obligation.name}</Heading><Paragraph><InlineConceptText text={obligation.description} links={obligation.conceptLinks} /></Paragraph><ObligationGuidance obligation={obligation} /><div className="detail-meta"><div><Clock3 size={16} /><span><small>Tidsbruk</small><strong>{obligation.estimatedMinutes} minutter</strong></span></div><div><Landmark size={16} /><span><small>Ansvarlig etat</small><strong>{obligation.responsibleAgency}</strong></span></div><div><FileCheck2 size={16} /><button type="button" className="detail-meta-link" onClick={() => setShowLegalBasis((current) => !current)} aria-expanded={showLegalBasis}><span><small>Lovhjemmel</small><strong>{obligation.legalBasis.length > 36 ? `${obligation.legalBasis.slice(0, 36)}…` : obligation.legalBasis}</strong></span><ChevronRight size={15} className={showLegalBasis ? "rotated" : ""} /></button></div></div>{showLegalBasis && <section className="detail-section legal-basis-detail"><strong>Lovhjemmel</strong><p><InlineConceptText text={obligation.legalBasis} showSelectionTip={false} /></p><small>Lovhenvisningen kommer fra Oppgaveregisteret eller den registrerte oppgavekilden.</small></section>}<div className="detail-section"><strong>Nødvendige data</strong><div className="tag-row">{obligation.requiredData.map((item) => <ConceptLookup key={item} label={item} query={conceptQueryForDataElement(item)} className="data-concept-link">{item}</ConceptLookup>)}</div></div>{obligation.attachments.length > 0 && <div className="detail-section"><strong>Vedlegg</strong><p>{obligation.attachments.join(' · ')}</p></div>}<div className="detail-section"><strong>Status</strong><select value={status} onChange={(event) => void saveStatus(event.target.value as TaskStatus)} disabled={saving}>{Object.entries(statusLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></div><div className="detail-section worklist-section"><strong>Arbeidsliste</strong>{isSupportFollowUp ? <><p>Dette er en lokal støtteoppfølging og ligger i arbeidslisten så lenge den har frist.</p></> : obligation.isActivated ? <><p>Oppgaven er aktiv i arbeidslisten.</p><Button variant="secondary" onClick={() => void setActivation(false)} disabled={saving}>Fjern fra arbeidslisten</Button></> : hasOfficialDeadline ? <><p>Oppgaven ligger i katalogen, men er ikke valgt for din arbeidsliste.</p><Button variant="secondary" onClick={() => void setActivation(true)} disabled={saving}>Legg til i arbeidslisten</Button></> : <p>Velg lokal frist eller gjentakelse nedenfor for å legge den i arbeidslisten.</p>}</div><div className="detail-section local-details"><strong>Lokale opplysninger</strong><p>Endringene gjelder bare din arbeidsflate og endrer ikke den offisielle oppgaven.</p>{selectedDate && <p><span className="muted">Valgt forekomst:</span> {formatDate(selectedDate, true)}</p>}{!isSupportFollowUp && obligation.deadline && <p><span className="muted">Offisiell frist:</span> {formatDate(obligation.deadline)}</p>}{isSupportFollowUp && <p><span className="muted">Kilde:</span> Tidligere offentlig støttetildeling. Dette er et brukerregistrert oppfølgingspunkt.</p>}<DateField label={isSupportFollowUp ? 'Lokal frist (valgfritt)' : 'Lokal frist for valgt forekomst (valgfritt)'} value={localDeadline} onChange={setLocalDeadline} /><label className="local-comment">Kommentar for valgt forekomst<Textarea rows={3} value={comment} onChange={(event) => setComment(event.target.value)} /></label><Button variant="secondary" onClick={() => void saveLocalDetails()} disabled={saving}>Lagre lokale opplysninger</Button></div>{!isSupportFollowUp && <><div className="detail-section visibility-section"><strong>Synlighet</strong><label className="visibility-scope">Gjelder<select value={hiddenScope} onChange={(event) => setHiddenScope(event.target.value as typeof hiddenScope)}><option value="instance">Valgt forekomst</option><option value="all">Alle forekomster</option></select></label>{selectedHidden ? <><p className="hidden-note"><EyeOff size={14} /> Denne oppgaven/forekomsten er skjult.</p><Button variant="secondary" onClick={() => void unhide()} disabled={saving}><EyeOff size={15} /> Vis igjen</Button></> : <div className="visibility-actions"><DateField label="Skjul til (valgfritt)" value={hiddenUntil} onChange={setHiddenUntil} /><Button variant="secondary" onClick={() => void setHidden(hiddenUntil)} disabled={saving || (hiddenScope === 'instance' && !selectedDate)}>Skjul {hiddenUntil ? 'til dato' : 'permanent'}</Button></div>}</div>{!obligation.deadline && <div className="schedule-box"><strong>Aktiver i arbeidslisten</strong><p>Denne oppgaven har ingen fast frist. Legg inn en lokal, gjentakende arbeidsfrist før den blir synlig i arbeidslisten.</p>{showSchedule ? <div className="schedule-form"><label>Gjentakelse<select value={frequency} onChange={(event) => setFrequency(event.target.value as typeof frequency)}><option value="monthly">Månedlig</option><option value="quarterly">Hvert kvartal</option><option value="yearly">Årlig</option></select></label><Textfield label="Intervall" type="number" value={interval} onChange={(event) => setInterval(event.target.value)} /><Textfield label="Dag i måneden" type="number" value={dayOfMonth} onChange={(event) => setDayOfMonth(event.target.value)} /><DateField label="Startdato" value={startDate} onChange={setStartDate} /><DateField label="Sluttdato (valgfritt)" value={endDate} onChange={setEndDate} /><div className="dialog-actions"><Button variant="secondary" onClick={() => setShowSchedule(false)}>Avbryt</Button><Button onClick={() => void activateSchedule()} disabled={saving}>Aktiver frister</Button></div></div> : <Button variant="secondary" onClick={() => setShowSchedule(true)}>Velg gjentakende frist</Button>}</div>}</>}<ObligationSources obligation={obligation} linkedSources={linkedSources} /></Card>;
}

function SourcePanel({ sources }: { sources: Source[] }) {
  const [query, setQuery] = useState('');
  const filtered = query ? sources.filter((source) => `${source.title} ${source.relevantExcerpt}`.toLowerCase().includes(query.toLowerCase())) : sources.slice(0, 3);
  return <Card className="surface-card source-card"><div className="section-title"><div><p className="eyebrow">Kunnskapsgrunnlag</p><Heading level={3}>Kilder</Heading></div><Search size={18} /></div><Textfield aria-label="Søk i kilder" placeholder="Søk i godkjente kilder" value={query} onChange={(event) => setQuery(event.target.value)} />{filtered.map((source) => <div className="source-preview" key={source.id}><div className="source-label-row"><TrustLabel level={source.officiality} /><span className={`source-authority authority-${source.authority?.toLowerCase() ?? 'unverified'}`}>{sourceAuthorityLabel(source.authority)}</span></div><strong>{source.title}</strong><p>{source.relevantExcerpt}</p></div>)}</Card>;
}

function ChatPanel({ orgNumber, sources, prefillQuestion, prefillConceptId, openRequest, onContributionChanged }: { orgNumber: string; sources: Source[]; prefillQuestion?: string; prefillConceptId?: string; openRequest: number; onContributionChanged: () => Promise<void> }) {
  const [question, setQuestion] = useState('Hvilke oppgaver gjelder for oss nå?');
  const [submittedQuestion, setSubmittedQuestion] = useState('');
  const [answer, setAnswer] = useState<ChatAnswer | null>(null);
  const [history, setHistory] = useState<ChatExchange[]>([]);
  const [historyQuery, setHistoryQuery] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [feedback, setFeedback] = useState<ChatFeedback | undefined>();
  const [shareStatus, setShareStatus] = useState<ChatShareStatus | undefined>();
  const [shareLoading, setShareLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [hasUnreadAnswer, setHasUnreadAnswer] = useState(false);
  const [chatError, setChatError] = useState('');
  const [isSlow, setIsSlow] = useState(false);
  const [contributionNotice, setContributionNotice] = useState<{ summary: ContributionSummary; points: number; action: string } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestSequenceRef = useRef(0);
  useEffect(() => {
    if (!isLoading) { setIsSlow(false); return undefined; }
    const timer = window.setTimeout(() => setIsSlow(true), 8000);
    return () => window.clearTimeout(timer);
  }, [isLoading]);
  useEffect(() => {
    setAnswer(null);
    setSubmittedQuestion('');
    setFeedback(undefined);
    setShareStatus(undefined);
    void api.chatHistory(orgNumber).then(setHistory).catch(() => setHistory([]));
  }, [orgNumber]);
  useEffect(() => {
    if (prefillQuestion) {
      setQuestion(prefillQuestion);
      setIsCollapsed(false);
      setHasUnreadAnswer(false);
    }
  }, [openRequest, prefillQuestion]);
  useEffect(() => () => abortControllerRef.current?.abort(), []);
  const ask = async () => {
    const nextQuestion = question.trim();
    if (!nextQuestion || isLoading) return;
    const requestId = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestId;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setSubmittedQuestion(nextQuestion);
    setChatError('');
    setFeedback(undefined);
    setIsLoading(true);
    try {
      const nextAnswer = await api.chat(nextQuestion, orgNumber, controller.signal, prefillConceptId);
      if (requestSequenceRef.current === requestId) {
        setAnswer(nextAnswer);
        setShareStatus(nextAnswer.shareStatus);
        if (isCollapsed) setHasUnreadAnswer(true);
        if (nextAnswer.exchangeId) void api.chatHistory(orgNumber).then(setHistory).catch(() => undefined);
      }
    } catch (error) {
      if (requestSequenceRef.current !== requestId || (error instanceof DOMException && error.name === 'AbortError')) return;
      setChatError(error instanceof Error ? error.message : 'Losen kunne ikke svare akkurat nå.');
    } finally {
      if (requestSequenceRef.current === requestId) {
        abortControllerRef.current = null;
        setIsLoading(false);
      }
    }
  };
  const cancel = () => {
    requestSequenceRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsLoading(false);
    setIsSlow(false);
  };
  const handleQuestionKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      void ask();
    }
  };
  const toggleCollapsed = () => {
    setIsCollapsed((current) => {
      const next = !current;
      if (!next) setHasUnreadAnswer(false);
      return next;
    });
  };
  const historicalExchange = answer?.exchangeId ? history.find((item) => item.id === answer.exchangeId) : undefined;
  const answerSources = historicalExchange?.sources.length ? historicalExchange.sources : sources.filter((source) => answer?.sourceIds.includes(source.id));
  const visibleHistory = history.filter((item) => `${item.question} ${item.answer}`.toLocaleLowerCase('nb-NO').includes(historyQuery.trim().toLocaleLowerCase('nb-NO')));
  const openExchange = (exchange: ChatExchange) => {
    setQuestion(exchange.question);
    setSubmittedQuestion(exchange.question);
    setAnswer({ answer: exchange.answer, uncertainty: exchange.uncertainty, sourceIds: exchange.sourceIds, followUpQuestions: exchange.followUpQuestions, exchangeId: exchange.id });
    setFeedback(exchange.feedback);
    setShareStatus(exchange.share?.status);
    setChatError('');
  };
  const setExchangeFeedback = async (nextFeedback: ChatFeedback) => {
    if (!answer?.exchangeId) return;
    const earnedPoints = feedback !== 'useful' && nextFeedback === 'useful';
    const updated = await api.updateChatFeedback(answer.exchangeId, feedback === nextFeedback ? undefined : nextFeedback);
    setFeedback(updated.feedback);
    setShareStatus(updated.share?.status);
    setHistory((items) => items.map((item) => item.id === updated.id ? updated : item));
    await onContributionChanged();
    if (earnedPoints) {
      const summary = await api.contributionSummary();
      setContributionNotice({ summary, points: 1, action: 'nyttig tilbakemelding på et los-svar' });
    }
  };
  const setExchangeShare = async (status: ChatShareStatus) => {
    if (!answer?.exchangeId) return;
    setShareLoading(true);
    try {
      const earnedPoints = status === 'consented' && shareStatus !== 'consented';
      const updated = await api.updateChatShare(answer.exchangeId, { status });
      setShareStatus(updated.share?.status);
      setHistory((items) => items.map((item) => item.id === updated.id ? updated : item));
      await onContributionChanged();
      if (earnedPoints) {
        const summary = await api.contributionSummary();
        setContributionNotice({ summary, points: 5, action: 'samtykke til anonymisert FAQ-forslag' });
      }
    } finally {
      setShareLoading(false);
    }
  };
  const deleteExchange = async (exchange: ChatExchange) => {
    await api.deleteChatExchange(exchange.id);
    setHistory((items) => items.filter((item) => item.id !== exchange.id));
    if (answer?.exchangeId === exchange.id) {
      setAnswer(null);
      setSubmittedQuestion('');
      setFeedback(undefined);
      setShareStatus(undefined);
    }
  };
  return <Card className={`surface-card chat-card ${isCollapsed ? 'chat-card-collapsed' : ''}`}>
    <div className="chat-heading"><div className="ai-orb"><Sparkles size={19} /></div><div><Heading level={3}>Spør losen</Heading><span>Tilgjengelig på tvers av arbeidsflater</span></div>{isLoading && <span className="los-status-indicator"><Sparkles size={13} className="spin" /> Arbeider</span>}{hasUnreadAnswer && !isLoading && <span className="los-status-indicator is-ready"><Check size={13} /> Svar klart</span>}<button type="button" className="chat-collapse-toggle" onClick={toggleCollapsed} aria-expanded={!isCollapsed}>{isCollapsed ? 'Åpne' : 'Minimer'}<ChevronRight size={15} className={!isCollapsed ? 'rotated' : ''} /></button></div>
    {isCollapsed ? <div className="chat-collapsed-state"><span>{isLoading ? 'Losen arbeider i bakgrunnen…' : hasUnreadAnswer ? 'Et nytt los-svar er klart.' : answer ? 'Sist brukte svar ligger klart.' : 'Still spørsmål om virksomheten, oppgaver eller frister.'}</span><Button variant="secondary" onClick={toggleCollapsed}>{hasUnreadAnswer ? 'Les svar' : 'Åpne losen'}</Button></div> : <>
    {contributionNotice && <ContributionNotice notice={contributionNotice} onClose={() => setContributionNotice(null)} />}
    <div className="chat-answer">
      {chatError ? <Alert data-color="danger"><AlertCircle size={16} />{chatError}</Alert> : answer ? <>
        <FormattedAnswer text={answer.answer} />
        <div className="uncertainty"><AlertCircle size={16} /><span>{answer.uncertainty}</span></div>
        {answerSources.map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={source.id} className="chat-source"><FileCheck2 size={14} />{source.title}</a>)}
        <div className="followups">{answer.followUpQuestions.map((item) => <button key={item} onClick={() => setQuestion(item)}>{item}</button>)}</div>
        <div className="chat-feedback"><span>Var dette nyttig?</span><button className={feedback === 'useful' ? 'selected' : ''} onClick={() => void setExchangeFeedback('useful')} disabled={!answer.exchangeId}><ThumbsUp size={14} /> Ja</button><button className={feedback === 'not_useful' ? 'selected' : ''} onClick={() => void setExchangeFeedback('not_useful')} disabled={!answer.exchangeId}><ThumbsDown size={14} /> Nei</button></div>
        {feedback === 'useful' && answer.exchangeId && <ChatSharePrompt status={shareStatus} loading={shareLoading} onShare={(status) => void setExchangeShare(status)} />}
      </> : <p className="muted">Still spørsmål om oppgaver, frister eller hva som må avklares.</p>}
      {isLoading && <div className="chat-loading"><Sparkles size={15} /> Losen arbeider i bakgrunnen…{isSlow && <span>Dette kan ta opptil et halvt minutt når mange oppgaver skal vurderes.</span>}</div>}
      {submittedQuestion && <p className="submitted-question"><span>Sist sendt:</span> {submittedQuestion}</p>}
    </div>
    <div className="chat-input"><Textarea aria-label="Spørsmål til KI-losen" rows={2} value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={handleQuestionKeyDown} /><Button aria-label={isLoading ? 'Avbryt spørsmål' : 'Send spørsmål'} onClick={() => void (isLoading ? cancel() : ask())}>{isLoading ? 'Avbryt' : <Send size={16} />}</Button></div>
    <div className="chat-history"><button className="chat-history-toggle" onClick={() => setShowHistory((visible) => !visible)}><History size={15} /> Tidligere spørsmål ({history.length})<ChevronRight size={15} className={showHistory ? 'rotated' : ''} /></button>{showHistory && <div className="chat-history-content"><Textfield aria-label="Søk i tidligere spørsmål" placeholder="Søk i historikken" value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} />{visibleHistory.length > 0 ? <div className="chat-history-list">{visibleHistory.map((exchange) => <div className={`chat-history-item ${answer?.exchangeId === exchange.id ? 'selected' : ''}`} key={exchange.id}><button onClick={() => openExchange(exchange)}><strong>{exchange.question}</strong><small>{formatDateTime(exchange.createdAt)}{exchange.feedback === 'useful' ? ' · Nyttig' : exchange.feedback === 'not_useful' ? ' · Ikke nyttig' : ''}</small></button><button className="chat-history-delete" onClick={() => void deleteExchange(exchange)} aria-label="Slett tidligere svar"><Trash2 size={14} /></button></div>)}</div> : <p className="muted">Ingen tidligere spørsmål matcher søket.</p>}</div>}</div>
    <div className="chat-trust"><ShieldCheck size={15} /> Svarene er veiledende og kan ikke erstatte juridisk vurdering.</div>
    </>}
  </Card>;
}

function ChatSharePrompt({ status, loading, onShare }: { status?: ChatShareStatus; loading: boolean; onShare: (status: ChatShareStatus) => void }) {
  if (status === 'consented') return <div className="chat-sharing chat-sharing-confirmed"><strong>Samtykke gitt: anonymisert forslag sendt til FAQ-vurdering</strong><span>Organisasjonsnavn, organisasjonsnummer og kontaktopplysninger er fjernet. En saksbehandler må godkjenne innholdet før eventuell publisering.</span><Button variant="secondary" onClick={() => onShare('withdrawn')} disabled={loading}>Trekk samtykke</Button></div>;
  if (status === 'withdrawn') return <div className="chat-sharing"><span>Du har valgt å ikke dele dette svaret. Det forblir privat i loshistorikken.</span></div>;
  return <div className="chat-sharing"><strong>Kan svaret hjelpe andre?</strong><span>Velg aktivt om dette anonymiserte spørsmålet og svaret kan foreslås til fellesskapets FAQ. Det blir ikke publisert automatisk.</span><div className="chat-sharing-actions"><Button onClick={() => onShare('consented')} disabled={loading}>{loading ? 'Lagrer…' : 'Ja, jeg samtykker til deling'}</Button><Button variant="secondary" onClick={() => onShare('withdrawn')} disabled={loading}>Nei, behold privat</Button></div></div>;
}

function ContributionNotice({ notice, onClose }: { notice: { summary: ContributionSummary; points: number; action: string }; onClose: () => void }) {
  const { summary } = notice;
  return <div className="contribution-notice" role="status"><div className="contribution-notice-icon"><Sparkles size={17} /></div><div><strong>Takk for at du bidrar!</strong><span>+{notice.points} poeng for {notice.action}.</span><span>Du har nå <b>{summary.points} poeng</b> og er <b>{summary.level}</b>{summary.nextLevel ? ` · ${summary.pointsToNextLevel} poeng til ${summary.nextLevel}` : ' · høyeste demo-nivå nådd'}.</span><small>Bidra mer ved å gi nyttig los-tilbakemelding, dele anonymiserte FAQ-forslag, foreslå manglende plikter eller sende inn forbedringsforslag.</small></div><button type="button" onClick={onClose} aria-label="Lukk poengmelding"><X size={15} /></button></div>;
}

function FeedbackDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    try {
      await api.createFeedback(message);
      onCreated();
    } finally {
      setSaving(false);
    }
  };
  return <div className="dialog-backdrop" role="presentation"><div className="dialog" role="dialog" aria-modal="true" aria-labelledby="feedback-title"><div className="dialog-heading"><div><p className="eyebrow">Brukerbidrag</p><Heading level={2} id="feedback-title">Gi tilbakemelding</Heading><Paragraph>Fortell hva som kan gjøre ORaKeL mer nyttig. Forslaget lagres som brukerinput og kan ikke endre offisielle opplysninger.</Paragraph></div><button onClick={onClose} aria-label="Lukk"><X /></button></div><label className="feedback-field">Hva bør vi forbedre?<Textarea rows={5} value={message} onChange={(event) => setMessage(event.target.value)} /></label><div className="dialog-actions"><Button variant="secondary" onClick={onClose}>Avbryt</Button><Button onClick={() => void submit()} disabled={saving || message.trim().length < 3}>{saving ? 'Sender…' : 'Send tilbakemelding'}</Button></div></div></div>;
}

function ReportDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState(''); const [description, setDescription] = useState(''); const [agency, setAgency] = useState(''); const [isSaving, setIsSaving] = useState(false);
  const submit = async () => { setIsSaving(true); await api.createReport({ title, description, suspectedAgency: agency, evidenceLinks: [], aiSuggestions: ['Kontroller om kravet finnes i Oppgaveregisteret.', 'Avklar hjemmel og målgruppe med foreslått etat.'] }); setIsSaving(false); onCreated(); };
  return <div className="dialog-backdrop" role="presentation"><div className="dialog" role="dialog" aria-modal="true" aria-labelledby="report-title"><div className="dialog-heading"><div><p className="eyebrow">Uoffisielt innspill</p><Heading level={2} id="report-title">Meld inn mulig manglende plikt</Heading></div><button onClick={onClose} aria-label="Lukk"><X /></button></div><Alert data-color="warning"><AlertCircle size={18} /> Innspillet blir ikke en offisiell oppgave. Det sendes til menneskelig gjennomgang.</Alert><div className="form-grid"><Textfield label="Hva gjelder innspillet?" value={title} onChange={(event) => setTitle(event.target.value)} /><Textfield label="Foreslått etat (valgfritt)" value={agency} onChange={(event) => setAgency(event.target.value)} /><Textfield multiline className="wide-field" label="Beskriv hva dere må rapportere og hvorfor" rows={5} value={description} onChange={(event) => setDescription(event.target.value)} /></div><div className="dialog-actions"><Button variant="secondary" onClick={onClose}>Avbryt</Button><Button onClick={() => void submit()} disabled={!title || !description || isSaving}>{isSaving ? 'Sender…' : 'Send til gjennomgang'}</Button></div></div></div>;
}

const reviewStatusLabels: Record<UserReportedRequirement['reviewStatus'], string> = {
  new: 'Nytt',
  needs_more_info: 'Trenger mer info',
  forwarded: 'Sendt videre',
  confirmed: 'Bekreftet',
  rejected: 'Avvist',
  duplicate: 'Duplikat',
};

const dispatchTargets = ['Brønnøysundregistrene', 'Skatteetaten', 'Mattilsynet', 'Arbeidstilsynet', 'DSB', 'Annen etat'];

function AdminView({ reports, onStatusChange, onReportChanged }: { reports: UserReportedRequirement[]; onStatusChange: (id: string, status: UserReportedRequirement['reviewStatus'], note: string) => Promise<void>; onReportChanged: (report: UserReportedRequirement) => void }) {
  const [filter, setFilter] = useState<'all' | UserReportedRequirement['reviewStatus']>('all');
  const [query, setQuery] = useState('');
  const [selectedReport, setSelectedReport] = useState<UserReportedRequirement | null>(null);
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('nb-NO');
    return reports
      .filter((report) => filter === 'all' || report.reviewStatus === filter)
      .filter((report) => !normalizedQuery || `${report.title} ${report.description} ${report.reportedBy} ${report.suspectedAgency ?? ''}`.toLocaleLowerCase('nb-NO').includes(normalizedQuery))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }, [filter, query, reports]);
  const openCount = reports.filter((item) => item.reviewStatus === 'new' || item.reviewStatus === 'needs_more_info').length;
  const decidedCount = reports.length - openCount;
  return <section className="admin-page">
    <div className="admin-heading"><div><p className="eyebrow">Intern arbeidsflate</p><Heading level={1}>Saksbehandlerkø</Heading><Paragraph>Vurder innspill før de eventuelt sendes til Brønnøysundregistrene eller foreslått etat. Et innspill blir aldri en offisiell oppgave automatisk.</Paragraph></div><div className="admin-summary"><div><strong>{openCount}</strong><span>åpne saker</span></div><div><strong>{reports.filter((item) => item.reviewStatus === 'needs_more_info').length}</strong><span>trenger mer info</span></div><div><strong>{decidedCount}</strong><span>avgjort</span></div></div></div>
    <div className="admin-toolbar"><div className="filter-row"><Filter size={16} /><select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} aria-label="Filtrer innspill"><option value="all">Alle statuser</option>{Object.entries(reviewStatusLabels).map(([status, label]) => <option value={status} key={status}>{label}</option>)}</select><Textfield className="report-search" aria-label="Søk i innspill" placeholder="Søk i tittel, innmelder eller etat" value={query} onChange={(event) => setQuery(event.target.value)} /></div><span className="audit-note"><ShieldCheck size={16} /> Alle vurderinger logges</span></div>
    {filtered.length > 0 ? <div className="reports-grid">{filtered.map((report) => <Card className="surface-card report-card" key={report.id}><div className="report-card-top"><TrustLabel level="USER_REPORTED" /><span className={`review-status review-status-${report.reviewStatus}`}>{reviewStatusLabels[report.reviewStatus]}</span></div><div className="report-card-heading"><div><Heading level={3}>{report.title}</Heading><span className="report-id">{report.id} · mottatt {formatDateTime(report.createdAt)}</span></div></div><Paragraph>{report.description}</Paragraph><div className="report-facts"><span><UserRound size={15} />{report.reportedBy}</span><span><Landmark size={15} />{report.suspectedAgency || 'Etat ikke foreslått'}</span><span><Sparkles size={15} />KI-treff {Math.round(report.confidence * 100)} %</span></div><div className="ai-suggestion-box"><strong>KI-forslag, ikke konklusjon</strong>{report.aiSuggestions.map((suggestion) => <span key={suggestion}>· {suggestion}</span>)}</div><div className="report-actions"><span className="review-updated">Sist endret {formatDateTime(report.updatedAt)}</span><Button variant="secondary" onClick={() => setSelectedReport(report)}>Åpne sak <ChevronRight size={15} /></Button></div></Card>)}</div> : <Card className="surface-card admin-empty"><Heading level={2}>Ingen innspill i dette utvalget</Heading><Paragraph>Prøv et annet filter eller søk etter en annen sak.</Paragraph></Card>}
    {selectedReport && <ReviewDialog report={selectedReport} onClose={() => setSelectedReport(null)} onSave={async (status, note) => { await onStatusChange(selectedReport.id, status, note); setSelectedReport(null); }} onDispatch={async (targetAgency, targetCaseworker, message) => { const updated = await api.dispatchReport(selectedReport.id, targetAgency, targetCaseworker, message); onReportChanged(updated); setSelectedReport(updated); return updated; }} />}
  </section>;
}

function ReviewDialog({ report, onClose, onSave, onDispatch }: { report: UserReportedRequirement; onClose: () => void; onSave: (status: UserReportedRequirement['reviewStatus'], note: string) => Promise<void>; onDispatch: (targetAgency: string, targetCaseworker: string, message: string) => Promise<UserReportedRequirement> }) {
  const [status, setStatus] = useState(report.reviewStatus);
  const [note, setNote] = useState(report.reviewNote ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [targetAgency, setTargetAgency] = useState(dispatchTargets[0]);
  const [targetCaseworker, setTargetCaseworker] = useState('');
  const [dispatchMessage, setDispatchMessage] = useState('');
  const [dispatching, setDispatching] = useState(false);
  const [dispatchError, setDispatchError] = useState('');
  const [dispatchSuccess, setDispatchSuccess] = useState('');
  const submit = async () => {
    if (note.trim().length < 3) {
      setError('Skriv en kort begrunnelse før saken lagres.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave(status, note.trim());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Kunne ikke lagre vurderingen.');
    } finally {
      setSaving(false);
    }
  };
  const dispatch = async () => {
    if (dispatchMessage.trim().length < 3) {
      setDispatchError('Skriv hva mottakeren skal ta hensyn til.');
      return;
    }
    setDispatching(true);
    setDispatchError('');
    setDispatchSuccess('');
    try {
      const updated = await onDispatch(targetAgency, targetCaseworker.trim(), dispatchMessage.trim());
      setStatus(updated.reviewStatus);
      setNote(updated.reviewNote ?? dispatchMessage.trim());
      setDispatchMessage('');
      setDispatchSuccess(`Innspillet er registrert i ${targetAgency} sin mottakskø (demo).`);
    } catch (cause) {
      setDispatchError(cause instanceof Error ? cause.message : 'Kunne ikke sende innspillet videre.');
    } finally {
      setDispatching(false);
    }
  };
  return <div className="dialog-backdrop" role="presentation"><div className="dialog review-dialog" role="dialog" aria-modal="true" aria-labelledby="review-dialog-title"><div className="dialog-heading"><div><p className="eyebrow">Saksdetalj · {report.id}</p><Heading level={2} id="review-dialog-title">{report.title}</Heading><Paragraph>Vurderingen gjelder bare dette brukerinnspillet. Den endrer ikke Oppgaveregisteret.</Paragraph></div><button type="button" onClick={onClose} aria-label="Lukk"><X /></button></div><div className="review-detail-grid"><section className="review-panel"><div className="review-panel-heading"><strong>Innspillet</strong><TrustLabel level="USER_REPORTED" /></div><p>{report.description}</p><dl className="review-facts"><div><dt>Innmeldt av</dt><dd>{report.reportedBy}</dd></div><div><dt>Foreslått etat</dt><dd>{report.suspectedAgency || 'Ikke oppgitt'}</dd></div><div><dt>Målgruppe</dt><dd>{report.targetGroup || 'Ikke oppgitt'}</dd></div><div><dt>Frekvens/fristsignal</dt><dd>{[report.frequency, report.deadline].filter(Boolean).join(' · ') || 'Ikke oppgitt'}</dd></div><div><dt>Mulig hjemmel</dt><dd>{report.suspectedLegalBasis || 'Ikke oppgitt'}</dd></div></dl></section><section className="review-panel"><div className="review-panel-heading"><strong>KI-forslag</strong><span className="ai-review-label"><Sparkles size={14} /> Ikke konklusjon</span></div>{report.aiSuggestions.length > 0 ? <ul>{report.aiSuggestions.map((suggestion) => <li key={suggestion}>{suggestion}</li>)}</ul> : <p className="muted">Ingen KI-forslag registrert.</p>}<div className="review-separation-note"><ShieldCheck size={15} />Bruk offisielle kilder og saksbehandlers vurdering som beslutningsgrunnlag.</div></section></div><section className="review-section"><div className="review-section-heading"><div><strong>Kilder og vedlegg</strong><span>Alle lenker er brukerinnsendt inntil de er kontrollert.</span></div><TrustLabel level="USER_REPORTED" /></div>{report.evidenceLinks.length > 0 ? <div className="review-links">{report.evidenceLinks.map((link) => { const safeUrl = safeExternalUrl(link); return safeUrl ? <a href={safeUrl} target="_blank" rel="noreferrer" key={link}>{link}<ChevronRight size={14} /></a> : <span className="review-link-invalid" key={link}>{link}<small>Lenken må være HTTP eller HTTPS før den kan åpnes.</small></span>; })}</div> : <p className="muted">Ingen kilder eller vedlegg er sendt inn.</p>}</section><section className="review-section dispatch-section"><div className="review-section-heading"><div><strong>Send til annen etat</strong><span>Registrerer innspillet i mottakskøen for videre behandling.</span></div><Send size={17} /></div><div className="dispatch-form"><label>Etat<select value={targetAgency} onChange={(event) => setTargetAgency(event.target.value)}>{dispatchTargets.map((target) => <option value={target} key={target}>{target}</option>)}</select></label><Textfield label="Mottakende saksbehandler (valgfritt)" placeholder="Navn eller intern kø" value={targetCaseworker} onChange={(event) => setTargetCaseworker(event.target.value)} /><label>Hva skal mottakeren ta hensyn til?<Textarea rows={3} value={dispatchMessage} onChange={(event) => setDispatchMessage(event.target.value)} placeholder="Oppsummer hva som bør vurderes og hvilke kilder som er relevante." /></label><Button variant="secondary" onClick={() => void dispatch()} disabled={dispatching}>{dispatching ? 'Sender…' : 'Registrer videresending'}</Button></div>{dispatchSuccess && <div className="dispatch-success" role="status"><Check size={15} />{dispatchSuccess}</div>}{dispatchError && <Alert data-color="danger"><AlertCircle size={17} />{dispatchError}</Alert>}{report.dispatches && report.dispatches.length > 0 && <div className="dispatch-history"><strong>Tidligere videresendinger</strong>{[...report.dispatches].reverse().map((item) => <div className="dispatch-history-item" key={item.id}><span>{item.targetAgency}{item.targetCaseworker ? ` · ${item.targetCaseworker}` : ''}</span><small>{item.status === 'queued' ? 'Registrert i mottakskø (demo)' : item.status} · {item.dispatchedByName} · {formatDateTime(item.createdAt)}</small><p>{item.message}</p></div>)}</div>}</section>{report.reviewHistory && report.reviewHistory.length > 0 && <section className="review-section"><div className="review-section-heading"><div><strong>Vurderingshistorikk</strong><span>Nyeste vurdering vises først.</span></div><History size={17} /></div><div className="review-history">{[...report.reviewHistory].reverse().map((event) => <div className="review-history-item" key={event.id}><div><strong>{reviewStatusLabels[event.status]}</strong><span>{event.reviewedByName} · {formatDateTime(event.createdAt)}</span></div><p>{event.note}</p></div>)}</div></section>}<section className="review-form"><label>Status<select value={status} onChange={(event) => setStatus(event.target.value as UserReportedRequirement['reviewStatus'])}>{Object.entries(reviewStatusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Begrunnelse for vurderingen<Textarea rows={4} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Hva er kontrollert, og hva bør skje videre?" /></label>{error && <Alert data-color="danger"><AlertCircle size={17} />{error}</Alert>}</section><div className="dialog-actions"><Button variant="secondary" onClick={onClose} disabled={saving || dispatching}>Avbryt</Button><Button onClick={() => void submit()} disabled={saving || dispatching}>{saving ? 'Lagrer…' : 'Lagre vurdering'}</Button></div></div></div>;
}

export default App;
