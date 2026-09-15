import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { AlertCircle, CalendarDays, Check, ChevronLeft, ChevronRight, CircleHelp, Clock3, EyeOff, FileCheck2, Filter, History, Landmark, Plus, Search, Send, ShieldCheck, Sparkles, ThumbsDown, ThumbsUp, Trash2, UserRound, X } from 'lucide-react';
import { Alert, Button, Card, Heading, Paragraph, Tag, Textarea, Textfield } from '@digdir/designsystemet-react';
import { api } from './api';
import type { ChatAnswer, ChatExchange, ChatFeedback, DemoUser, Obligation, Organization, OrganizationProfile, Source, TaskStatus, UserReportedRequirement } from './domain/types';
import { buildEventGuides, obligationsForEvent, organizationEventContext, type EventGuide } from './data/event-navigator';
import { isMutedForDate } from './domain/task-visibility';
import { statusForDate } from './domain/task-status';
import { parseFormattedAnswer } from './format-answer';
import { appEnvironment, appVersion } from './version';

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

  const loadOrganization = async (number = orgNumber, preserveSelection = false) => {
    setLoading(true);
    try {
      const [nextOrg, nextObligations, nextSources, nextReports, nextViewPreference, nextProfile] = await Promise.all([api.organization(number), api.obligations(number), api.sources('', number), api.reports(), api.organizationViewPreference(number), api.organizationProfile(number)]);
      setOrganization(nextOrg); setOrganizationProfile(nextProfile); setOrganizationMutedBefore(nextViewPreference.mutedBefore ?? ''); setObligations(nextObligations); setSources(nextSources); setReports(nextReports); setSelectedObligationId((current) => preserveSelection ? (current && nextObligations.some((item) => item.id === current) ? current : null) : null); if (!preserveSelection) setSelectedOccurrenceDate(null); setOrganizationSearchResults([]); setToast('Virksomhetsoversikten er oppdatert.');
    } catch (error) { setOrganization(null); setOrganizationProfile(null); setOrganizationMutedBefore(''); setToast(error instanceof Error ? error.message : 'Kunne ikke laste virksomheten.'); }
    finally { setLoading(false); }
  };

  const searchOrganizations = async () => {
    const query = orgNumber.trim();
    if (!query) return;
    if (/^\d[\d\s]{8,}$/.test(query)) {
      await loadOrganization(query);
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
      const organizationsForUser = await api.myOrganizations();
      setSavedOrganizations(organizationsForUser);
      if (nextUser.role === 'caseworker') setReports(await api.reports());
      if (organizationsForUser[0]) {
        setOrgNumber(organizationsForUser[0].orgNumber);
        await loadOrganization(organizationsForUser[0].orgNumber);
      }
    }).catch(() => undefined).finally(() => setAuthChecking(false));
  }, []);

  const addCurrentOrganization = async () => {
    if (!organization) return;
    try {
      const nextUser = await api.addMyOrganization(organization.orgNumber);
      setUser(nextUser);
      setSavedOrganizations(await api.myOrganizations());
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
      setOrganization(null);
      setOrganizationProfile(null);
      setOrganizationMutedBefore('');
      setObligations([]);
      setSources([]);
      setReports([]);
      setSelectedObligationId(null);
    }
  };

  const handleAuthenticated = async (nextUser: DemoUser) => {
    setUser(nextUser);
    const organizationsForUser = await api.myOrganizations();
    setSavedOrganizations(organizationsForUser);
    if (nextUser.role === 'caseworker') setReports(await api.reports());
    if (organizationsForUser[0]) {
      setOrgNumber(organizationsForUser[0].orgNumber);
      await loadOrganization(organizationsForUser[0].orgNumber);
    }
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
      {user.role === 'business' && organization && <button className="organization-topbar-trigger" onClick={() => setShowOrganizationProfile(true)}><Landmark size={16} /><span><strong>{organization.name}</strong><small>{organization.orgNumber}</small></span><ChevronRight size={16} /></button>}
      <div className="user-pill"><div className="avatar">{user.displayName.slice(0, 2).toUpperCase()}</div><span>{user.displayName}</span><small>{user.role === 'caseworker' ? 'Saksbehandler' : 'Virksomhet'}</small><button onClick={() => void signOut()}>Logg ut</button></div>
    </header>

    <main className="page-container">
      {user.role === 'business' && <section className="hero-row">
        <div><p className="eyebrow">MVP · BRREG-data + godkjente kilder</p><Heading level={1} data-size="2xl">Hold oversikten over rapporteringen</Heading><Paragraph>Én samlet arbeidsflate for plikter, frister, kilder og avklaringer.</Paragraph></div>
        <div className="org-picker"><label htmlFor="saved-organizations">Mine virksomheter</label><select id="saved-organizations" value="" onChange={(event) => { if (event.target.value) { setOrgNumber(event.target.value); void loadOrganization(event.target.value); } }}><option value="">Velg lagret virksomhet…</option>{savedOrganizations.map((item) => <option key={item.orgNumber} value={item.orgNumber}>{item.name} ({item.orgNumber})</option>)}</select><div className="org-input-row"><Textfield id="org-number" value={orgNumber} onChange={(event) => { setOrgNumber(event.target.value); setOrganizationSearchResults([]); }} placeholder="Søk på navn eller organisasjonsnummer" aria-label="Søk på navn eller organisasjonsnummer" /><Button onClick={() => void searchOrganizations()} disabled={loading || searchingOrganizations}>{loading ? 'Laster…' : searchingOrganizations ? 'Søker…' : 'Søk'}</Button></div><span className="field-hint">Søk på navn eller ni siffer. Velg deretter «Legg til» for å lagre virksomheten.</span>{organization && !savedOrganizations.some((item) => item.orgNumber === organization.orgNumber) && <Button variant="secondary" onClick={() => void addCurrentOrganization()}>Legg til i Mine virksomheter</Button>}{organizationSearchResults.length > 0 && <div className="org-search-results" aria-label="Søkeresultater">{organizationSearchResults.map((item) => <button key={item.orgNumber} className="org-search-result" onClick={() => { setOrgNumber(item.orgNumber); void loadOrganization(item.orgNumber); }}><strong>{item.name}</strong><span>{item.orgNumber} · {item.organizationForm} · {item.municipality || 'Kommune ikke oppgitt'}</span></button>)}</div>}</div>
      </section>}

      {toast && <div className="toast" role="status"><Check size={16} /> {toast}<button onClick={() => setToast('')} aria-label="Lukk melding"><X size={16} /></button></div>}

      {user.role === 'caseworker' && <AdminView reports={reports} onStatusChange={async (id, status) => { const updated = await api.updateReport(id, status); setReports((items) => items.map((item) => item.id === id ? updated : item)); setToast('Innspillet er oppdatert og endringen er logget i demoen.'); }} />}
      {user.role === 'business' && organization && <Overview organization={organization} organizationMutedBefore={organizationMutedBefore} obligations={activeObligations} catalogObligations={filteredObligations} allObligations={obligations} sources={sources} selectedObligation={selectedObligation} selectedOccurrenceDate={selectedOccurrenceDate} setSelectedObligationId={setSelectedObligationId} setSelectedOccurrenceDate={setSelectedOccurrenceDate} calendarStart={calendarStart} setCalendarStart={setCalendarStart} calendarMode={calendarMode} setCalendarMode={setCalendarMode} statusFilter={statusFilter} setStatusFilter={setStatusFilter} visibilityFilter={visibilityFilter} setVisibilityFilter={setVisibilityFilter} onTaskChanged={(nextSelectedId) => { if (nextSelectedId !== undefined) setSelectedObligationId(nextSelectedId); void loadOrganization(organization.orgNumber, true); }} onOrganizationViewChanged={() => { void loadOrganization(organization.orgNumber, true); }} />}
      {user.role === 'business' && !organization && <Card className="surface-card empty-state"><Heading level={2}>Velkommen til ORaKeL</Heading><Paragraph>Søk etter virksomheten din ovenfor, velg et treff og legg den til i Mine virksomheter.</Paragraph></Card>}
      {showOrganizationProfile && organization && organizationProfile && <OrganizationProfileDialog organization={organization} profile={organizationProfile} sources={sources} onClose={() => setShowOrganizationProfile(false)} onSaved={(nextProfile) => { setOrganizationProfile(nextProfile); setToast('Virksomhetsprofilen er lagret.'); }} />}
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

function OrganizationProfileDialog({ organization, profile, sources, onClose, onSaved }: { organization: Organization; profile: OrganizationProfile; sources: Source[]; onClose: () => void; onSaved: (profile: OrganizationProfile) => void }) {
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
  return <div className="dialog-backdrop" role="presentation"><div className="dialog organization-profile-dialog" role="dialog" aria-modal="true" aria-labelledby="organization-profile-title"><div className="dialog-heading"><div><p className="eyebrow">Virksomhetsprofil</p><Heading level={2} id="organization-profile-title">{organization.name}</Heading><Paragraph>Offisielle registeropplysninger og dine egne opplysninger holdes adskilt.</Paragraph></div><button onClick={onClose} aria-label="Lukk"><X /></button></div><section className="profile-section"><div className="profile-section-heading"><div><strong>Offisielle opplysninger</strong><span>Hentet fra virksomhetskilden</span></div><span className="trust trust-official"><ShieldCheck size={14} /> Offisiell</span></div><dl className="profile-fields">{officialFields.map(([field, fieldValue]) => <div key={field}><dt>{field}</dt><dd>{fieldValue}</dd></div>)}</dl></section><section className="profile-section"><div className="profile-section-heading"><div><strong>Egne opplysninger</strong><span>Dette er brukerinput og kan ikke endre registerdata eller juridiske konklusjoner.</span></div><span className="trust trust-user_input">Brukerinput</span></div>{inputs.length > 0 && <div className="user-input-list">{inputs.map((input) => <div className="user-input-row" key={input.id}><div><strong>{input.label}</strong><span>{input.value}</span><small>Brukerinput · oppdatert {formatDate(input.updatedAt.slice(0, 10), true)}</small></div><button type="button" onClick={() => setInputs((current) => current.filter((item) => item.id !== input.id))} aria-label={`Fjern ${input.label}`}><X size={15} /></button></div>)}</div>}<div className="profile-input-form"><Textfield label="Felt eller tema" placeholder="For eksempel regnskapssystem" value={label} onChange={(event) => setLabel(event.target.value)} /><Textfield label="Opplysning" placeholder="For eksempel Tripletex" value={value} onChange={(event) => setValue(event.target.value)} /><Button variant="secondary" onClick={addInput} disabled={!label.trim() || !value.trim()}>Legg til</Button></div></section><section className="profile-section"><div className="profile-section-heading"><div><strong>Kilder</strong><span>Opplysningene kan endres når kildene oppdateres.</span></div></div>{organization.sources.map((sourceId) => { const source = sources.find((item) => item.id === sourceId); return source ? <a className="profile-source" href={source.url} target="_blank" rel="noreferrer" key={source.id}><ShieldCheck size={15} /><span><strong>{source.title}</strong><small>Sist hentet {formatDate(source.retrievedAt.slice(0, 10), true)}</small></span><ChevronRight size={15} /></a> : null; })}</section><div className="dialog-actions"><Button variant="secondary" onClick={onClose}>Lukk</Button><Button onClick={() => void save()} disabled={saving}>{saving ? 'Lagrer…' : 'Lagre egne opplysninger'}</Button></div></div></div>;
}

function Overview({ organization, organizationMutedBefore, obligations, catalogObligations, allObligations, sources, selectedObligation, selectedOccurrenceDate, setSelectedObligationId, setSelectedOccurrenceDate, calendarStart, setCalendarStart, calendarMode, setCalendarMode, statusFilter, setStatusFilter, visibilityFilter, setVisibilityFilter, onTaskChanged, onOrganizationViewChanged }: { organization: Organization; organizationMutedBefore: string; obligations: Obligation[]; catalogObligations: Obligation[]; allObligations: Obligation[]; sources: Source[]; selectedObligation: Obligation | null; selectedOccurrenceDate: string | null; setSelectedObligationId: (id: string | null) => void; setSelectedOccurrenceDate: (date: string | null) => void; calendarStart: Date; setCalendarStart: (date: Date) => void; calendarMode: 'year' | 'list'; setCalendarMode: (mode: 'year' | 'list') => void; statusFilter: 'all' | TaskStatus; setStatusFilter: (value: 'all' | TaskStatus) => void; visibilityFilter: 'visible' | 'hidden' | 'muted' | 'all'; setVisibilityFilter: (value: 'visible' | 'hidden' | 'muted' | 'all') => void; onTaskChanged: (nextSelectedId?: string | null) => void; onOrganizationViewChanged: () => void }) {
  const [showReport, setShowReport] = useState(false);
  const [workspaceView, setWorkspaceView] = useState<'calendar' | 'events' | 'worklist' | 'report' | 'los'>('calendar');
  const [chatPrompt, setChatPrompt] = useState('');
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
    <section className="context-bar"><div className="context-company"><div className="company-icon"><Landmark size={20} /></div><div><strong>{organization.name}</strong><span>Org.nr. {organization.orgNumber} · {organization.organizationForm} · {organization.municipality}</span></div></div><div className="context-facts"><span><strong>{allObligations.length}</strong> i katalogen</span><span><strong>{obligations.length}</strong> i arbeidslisten</span><span><strong>{allObligations.reduce((sum, item) => sum + item.estimatedMinutes, 0)} min</strong> estimert</span></div></section>
    <nav className="workspace-switcher" aria-label="Velg arbeidsflate"><span>Arbeidsflate</span><button className={workspaceView === 'calendar' ? 'selected' : ''} onClick={() => setWorkspaceView('calendar')}>Årshjul</button><button className={workspaceView === 'events' ? 'selected' : ''} onClick={() => setWorkspaceView('events')}>Hendelser</button><button className={workspaceView === 'worklist' ? 'selected' : ''} onClick={() => setWorkspaceView('worklist')}>Arbeidsliste</button><button className={workspaceView === 'report' ? 'selected' : ''} onClick={() => setWorkspaceView('report')}>Meld inn</button><button className={workspaceView === 'los' ? 'selected' : ''} onClick={() => setWorkspaceView('los')}>Losen</button></nav>
    <section className="dashboard-grid">
      <div className="main-column" ref={mainColumnRef}>
        {workspaceView === 'events' ? <EventNavigator organization={organization} obligations={allObligations} guides={eventGuides} sources={sources} onSelectObligation={(id) => { setSelectedObligationId(id); setSelectedOccurrenceDate(null); }} onAskLos={(prompt) => { setChatPrompt(prompt); setWorkspaceView('los'); }} /> : workspaceView === 'los' ? <div className="los-workspace"><ChatPanel orgNumber={organization.orgNumber} sources={sources} prefillQuestion={chatPrompt} /><SourcePanel sources={sources} /></div> : workspaceView === 'report' ? <ReportWorkspace onOpen={() => setShowReport(true)} /> : <>
        {workspaceView !== 'worklist' && <><Card className="surface-card calendar-card"><div className="card-heading-row"><div><p className="eyebrow">Rullerende 12 måneder</p><Heading level={2}>Årshjul</Heading><span className="calendar-caption">Katalog over relevante oppgaver. Velg en oppgave for å legge den i arbeidslisten.</span></div><div className="calendar-controls"><button className="calendar-nav" onClick={() => setCalendarStart(shiftMonth(calendarStart, -1))} aria-label="Vis forrige måned"><ChevronLeft size={17} /></button><span>{formatDate(dateKey(calendarStart), true)} – {formatDate(dateKey(shiftMonth(calendarStart, 11)), true)}</span><button className="calendar-nav" onClick={() => setCalendarStart(shiftMonth(calendarStart, 1))} aria-label="Vis neste måned"><ChevronRight size={17} /></button><button className="calendar-today" onClick={() => setCalendarStart(shiftMonth(monthStart(new Date()), -3))}>I dag</button><div className="segmented"><button className={calendarMode === 'year' ? 'selected' : ''} onClick={() => setCalendarMode('year')}>Årshjul</button><button className={calendarMode === 'list' ? 'selected' : ''} onClick={() => setCalendarMode('list')}>Liste</button></div></div></div>{calendarMode === 'year' ? <YearWheel obligations={catalogObligations} start={calendarStart} includeHidden={visibilityFilter !== 'visible'} selectedId={selectedObligation?.id} selectedOccurrenceDate={selectedOccurrenceDate ?? undefined} onSelect={(id, date) => { setSelectedObligationId(id); setSelectedOccurrenceDate(date ?? null); }} /> : <ObligationList obligations={catalogObligations} selectedId={selectedObligation?.id} onSelect={(id, date) => { setSelectedObligationId(id); setSelectedOccurrenceDate(date ?? null); }} />}</Card><div className="workspace-mute-controls">{selectedObligation && <MuteControl orgNumber={organization.orgNumber} obligation={selectedObligation} onTaskChanged={onTaskChanged} />}<OrganizationMuteControl orgNumber={organization.orgNumber} mutedBefore={organizationMutedBefore} onChanged={onOrganizationViewChanged} /></div></>}
        {workspaceView === 'worklist' && <>
        <div className="workspace-heading"><div><p className="eyebrow">Arbeidsliste</p><Heading level={2}>{taskTypeFilter === 'event' ? 'Hendelser som krever oppfølging' : 'Det som må gjøres'}</Heading><span className="calendar-caption">Bare oppgaver du har aktivert med frist eller gjentakelse vises her.</span></div><div className="filter-row"><Filter size={16} /><select value={statusFilter} onChange={(event) => preserveMainScroll(() => setStatusFilter(event.target.value as typeof statusFilter))} aria-label="Filtrer oppgaver"><option value="all">Alle statuser</option>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><select value={visibilityFilter} onChange={(event) => preserveMainScroll(() => setVisibilityFilter(event.target.value as typeof visibilityFilter))} aria-label="Filtrer synlighet"><option value="visible">Synlige</option><option value="muted">Dempede</option><option value="hidden">Skjulte</option><option value="all">Alle oppgaver</option></select>{visibilityFilter === 'muted' && mutedCount > 0 && <Button variant="secondary" onClick={() => void activateAllMuted()} disabled={activatingAllMuted}>{activatingAllMuted ? 'Aktiverer…' : `Aktiver alle dempede (${mutedCount})`}</Button>}<select value={taskTypeFilter} onChange={(event) => { setTaskTypeFilter(event.target.value as typeof taskTypeFilter); setEventFilter('all'); }} aria-label="Filtrer oppgavetype"><option value="all">Alle oppgavetyper</option><option value="periodic">Med fast frist</option><option value="event">Ved hendelse</option></select>{taskTypeFilter === 'event' && <select value={eventFilter} onChange={(event) => setEventFilter(event.target.value)} aria-label="Filtrer hendelse"><option value="all">Alle hendelser</option>{eventOptions.map((event) => <option key={event} value={event}>{event}</option>)}</select>}<select value={taskSort} onChange={(event) => setTaskSort(event.target.value as typeof taskSort)} aria-label="Sorter arbeidsliste"><option value="deadline">Nærmeste frist først</option><option value="status">Sorter på status</option><option value="agency">Sorter på etat</option></select><Textfield className="task-search" aria-label="Søk i arbeidslisten" placeholder="Søk i aktive oppgaver" value={taskQuery} onChange={(event) => setTaskQuery(event.target.value)} /></div></div>
        {filteredTaskObligations.length > 0 ? <div className="task-list">{filteredTaskObligations.map((item) => <TaskRow key={item.id} obligation={item} selected={selectedObligation?.id === item.id} onClick={() => { setSelectedObligationId(item.id); setSelectedOccurrenceDate(item.deadlineDates?.[0] ?? null); }} />)}</div> : <div className="task-empty"><strong>Ingen aktive oppgaver matcher filteret</strong><span>Velg en oppgave i katalogen ovenfor og lagre en frist eller gjentakelse for å legge den til.</span></div>}
        <button className="report-cta" onClick={() => setShowReport(true)}><div className="report-cta-icon"><Plus size={20} /></div><div><strong>Finner du en plikt som mangler?</strong><span>Meld inn et mulig krav til menneskelig gjennomgang.</span></div><ChevronRight size={20} /></button>
        <div className="workspace-mute-controls">{selectedObligation && <MuteControl orgNumber={organization.orgNumber} obligation={selectedObligation} onTaskChanged={onTaskChanged} />}<OrganizationMuteControl orgNumber={organization.orgNumber} mutedBefore={organizationMutedBefore} onChanged={onOrganizationViewChanged} /></div>
        </>}
        </>}
      </div>
      <aside className="side-column"><ObligationDetail orgNumber={organization.orgNumber} obligation={selectedObligation} occurrenceDate={selectedOccurrenceDate} sources={sources} onTaskChanged={onTaskChanged} /></aside>
    </section>
    {showReport && <ReportDialog onClose={() => setShowReport(false)} onCreated={() => setShowReport(false)} />}
  </>;
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
  const relatedSources = selectedGuide ? sources.filter((source) => selectedGuide.sourceIds.includes(source.id)) : [];
  const losQuestion = selectedGuide ? `Det har skjedd «${selectedGuide.label}» i ${organization.name}. Hvilke rapporteringsplikter og neste steg bør vi undersøke, basert på virksomhetsinformasjonen du har?` : '';
  return <div className="event-navigator-view">
    <Card className="surface-card event-navigator-intro"><div><p className="eyebrow">Rapporteringsnavigator</p><Heading level={2}>Hva gjør vi når noe skjer?</Heading><Paragraph>Velg hendelsen som passer best. Veiledningen er et arbeidsutgangspunkt; kontroller alltid viktige forhold i kildene.</Paragraph></div><div className="event-org-context"><Landmark size={17} /><span>{organizationEventContext(organization)}</span></div></Card>
    <div className="event-navigator-toolbar"><Textfield aria-label="Søk i hendelser" placeholder="Søk etter hendelse" value={query} onChange={(event) => setQuery(event.target.value)} /><span>{visibleGuides.length} hendelser</span></div>
    <div className="event-navigator-layout">
      <div className="event-guide-list" aria-label="Hendelser">{visibleGuides.map((guide) => <button key={guide.id} className={selectedGuide?.id === guide.id ? 'selected' : ''} onClick={() => setSelectedEventId(guide.id)}><span className="event-guide-icon"><CircleHelp size={17} /></span><span><strong>{guide.label}</strong><small>{guide.isPredefined ? 'Forhåndsveiledning' : 'Fra Oppgaveregisteret'}</small></span><ChevronRight size={16} /></button>)}{visibleGuides.length === 0 && <p className="muted">Ingen hendelser matcher søket.</p>}</div>
      {selectedGuide && <Card className="surface-card event-guide-detail"><div className="event-detail-heading"><div><p className="eyebrow">{selectedGuide.isPredefined ? 'Forhåndsveiledning' : 'Kataloghendelse'}</p><Heading level={2}>{selectedGuide.title}</Heading></div><Tag>{selectedGuide.label}</Tag></div><Paragraph>{selectedGuide.summary}</Paragraph><div className="event-criteria"><strong>Relevant for denne virksomheten</strong><span>{selectedGuide.criteria.join(' · ')}</span></div><div className="event-step-section"><strong>Foreslått sjekkliste</strong><ol>{selectedGuide.steps.map((step) => <li key={step}>{step}</li>)}</ol></div><div className="event-task-section"><div className="section-title"><strong>Relevante rapporteringsoppgaver</strong><span>{relatedObligations.length}</span></div>{relatedObligations.length > 0 ? <div className="event-related-tasks">{relatedObligations.map((obligation) => <button key={obligation.id} onClick={() => onSelectObligation(obligation.id)}><span><strong>{obligation.name}</strong><small>{obligation.responsibleAgency} · {obligation.frequency}</small></span><ChevronRight size={16} /></button>)}</div> : <p className="muted">Ingen oppgave i katalogen er koblet direkte til denne hendelsen ennå.</p>}</div><div className="event-questions"><strong>Mulige spørsmål til losen</strong>{selectedGuide.questions.map((question) => <button key={question} onClick={() => onAskLos(`${question} Tilpass svaret til ${organization.name} og opplysningene som finnes om virksomheten.`)}>{question}</button>)}{losQuestion && <Button variant="secondary" onClick={() => onAskLos(losQuestion)}><Sparkles size={15} /> Forbered spørsmål om denne hendelsen</Button>}</div>{relatedSources.length > 0 && <div className="event-sources"><strong>Kilder i veiledningen</strong>{relatedSources.map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={source.id}><ShieldCheck size={14} />{source.title}</a>)}</div>}</Card>}
    </div>
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
  return <Card className="surface-card mute-card organization-mute-card"><div><p className="eyebrow">Virksomhetsvisning</p><strong>Demp historikk for alle oppgaver</strong><p>Forekomster før valgt dato vises grå i årshjulet og listen. Dette endrer ikke offisielle opplysninger, status eller skjuling.</p>{mutedBefore && <p>Aktiv grense: {formatDate(mutedBefore, true)}</p>}</div><div className="mute-actions"><DateField label="Demp forekomster før" value={cutoff} onChange={setCutoff} /><Button variant="secondary" onClick={() => void save(cutoff || undefined)} disabled={saving || !cutoff}>{saving ? 'Lagrer…' : 'Demp all historikk'}</Button>{mutedBefore && <Button variant="secondary" onClick={() => { setCutoff(''); void save(undefined); }} disabled={saving}>Vis all historikk</Button>}</div></Card>;
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
    const noDateItems: Array<{ item: Obligation; date?: string }> = [];
    for (const item of obligations) {
      const dates = occurrenceDatesForWindow(item, start, 12);
      if (dates.length === 0) {
        if (includeHidden || !occurrenceHidden(item)) noDateItems.push({ item });
        continue;
      }
      for (const date of dates) {
        if (!includeHidden && occurrenceHidden(item, date)) continue;
        const candidate = new Date(`${occurrenceDeadline(item, date)}T12:00:00`);
        const monthIndex = (candidate.getFullYear() - start.getFullYear()) * 12 + candidate.getMonth() - start.getMonth();
        if (monthIndex >= 0 && monthIndex < buckets.length) buckets[monthIndex].items.push({ item, date });
      }
    }
    return [...buckets, { month: 'Uten fast frist', items: noDateItems }];
  }, [includeHidden, obligations, start]);
  return <div className="year-wheel">{grouped.map(({ month, items }) => typeof month === 'string' ? <NoDatePanel key={month} items={items} selectedId={selectedId} onSelect={onSelect} /> : <div className={`month-cell ${items.length ? 'has-items' : ''} ${isCurrentMonth(month) ? 'is-current-month' : ''}`} key={dateKey(month)}><span className="month-label">{monthName(month)} {month.getFullYear()}{isCurrentMonth(month) && <small className="current-month-label">Denne måneden</small>}</span>{items.map(({ item, date }) => { const itemStatus = itemStatusForDate(item, date); const displayDate = occurrenceDeadline(item, date); const state = deadlineState(itemStatus, displayDate, isAutomated(item)); const automated = automationLabel(item); const muted = isMutedForDate(item, displayDate); return <button key={`${item.id}-${date ?? 'no-date'}`} title={`${item.name} · ${formatDate(displayDate, true)}`} className={`calendar-item ${statusClass[itemStatus]} deadline-${state} ${isAutomated(item) ? 'is-automated' : ''} ${muted ? 'is-muted' : ''} ${selectedId === item.id && selectedOccurrenceDate === date ? 'is-selected' : ''}`} onClick={() => onSelect(item.id, date)}><span className={`calendar-dot ${isAutomated(item) ? 'system-dot' : ''}`} />{item.name}<small>{formatDate(displayDate, true)} · {automated || statusLabels[itemStatus]}{automated && itemStatus === 'completed' ? ` · ${statusLabels[itemStatus]}` : ''}{muted ? ' · Dempet' : ''}{deadlineStateLabel(state) ? ` · ${deadlineStateLabel(state)}` : ''}</small></button>; })}</div>)}</div>;
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
  return <div className="obligation-list">{obligations.map((item) => { const firstDate = item.deadlineDates?.[0]; const deadline = occurrenceDeadline(item, firstDate); const itemStatus = itemStatusForDate(item, firstDate); const state = deadlineState(itemStatus, deadline, isAutomated(item)); const muted = isMutedForDate(item, deadline); return <button className={`list-obligation deadline-${state} ${isAutomated(item) ? 'is-automated' : ''} ${muted ? 'is-muted' : ''} ${selectedId === item.id ? 'is-selected' : ''}`} key={item.id} onClick={() => onSelect(item.id, firstDate)}><span className={`timeline-dot ${statusClass[itemStatus]} ${isAutomated(item) ? 'system-dot' : ''}`} /><span><strong>{item.name}</strong><small>{item.frequency} · {deadline ? `frist ${formatDate(deadline, true)}` : 'hendelsesutløst'}{automationLabel(item) ? ` · ${automationLabel(item)}` : ''}{muted ? ' · Dempet' : ''}{deadlineStateLabel(state) ? ` · ${deadlineStateLabel(state)}` : ''}</small></span><ChevronRight size={17} /></button>; })}</div>;
}

function TaskRow({ obligation, selected, onClick }: { obligation: Obligation; selected: boolean; onClick: () => void }) {
  const firstDate = obligation.deadlineDates?.[0];
  const deadline = occurrenceDeadline(obligation, firstDate);
  const itemStatus = itemStatusForDate(obligation, firstDate);
  const state = deadlineState(itemStatus, deadline, isAutomated(obligation));
  const hasComment = Boolean(obligation.localComment || Object.values(obligation.localCommentByDate ?? {}).some(Boolean));
  const muted = isMutedForDate(obligation, deadline);
  return <button className={`task-row deadline-${state} ${isAutomated(obligation) ? 'is-automated' : ''} ${muted ? 'is-muted' : ''} ${selected ? 'is-selected' : ''}`} onClick={onClick}><div className={`task-icon ${statusClass[itemStatus]} ${isAutomated(obligation) ? 'system-dot' : ''}`}>{isEventLike(obligation) ? <CircleHelp size={18} /> : <CalendarDays size={18} />}</div><div className="task-main"><div className="task-title-row"><strong>{obligation.name}</strong><TrustLabel level={obligation.officialStatus} />{hasComment && <span className="local-note">Kommentar</span>}{automationLabel(obligation) && <span className="automation-label">{automationLabel(obligation)}</span>}{muted && <span className="muted-label">Dempet</span>}{obligation.isHidden && <span className="hidden-label"><EyeOff size={12} /> Skjult</span>}</div><span>{obligation.eventLabel || obligation.responsibleAgency} · {obligation.frequency}</span></div><div className="task-deadline"><small>{obligation.localDeadline || obligation.deadlineByDate?.[firstDate ?? ''] ? 'Lokal frist' : 'Frist'}</small><strong>{formatDate(deadline, true)}</strong>{deadlineStateLabel(state) && <span className={`deadline-label deadline-${state}`}>{deadlineStateLabel(state)}</span>}</div><div className="task-status"><span className={`status-pill ${statusClass[itemStatus]}`}>{automationLabel(obligation) && itemStatus !== 'completed' ? automationLabel(obligation) : statusLabels[itemStatus]}</span><ChevronRight size={18} /></div></button>;
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
  const [saving, setSaving] = useState(false);
  const selectedDate = occurrenceDate ?? obligation?.deadlineDates?.[0];
  const instanceDate = occurrenceDate ?? obligation?.localDeadline ?? obligation?.deadline ?? obligation?.deadlineDates?.[0];
  useEffect(() => {
    setStatus(obligation ? itemStatusForDate(obligation, instanceDate) : 'not_started');
    setHiddenUntil('');
    setLocalDeadline(selectedDate ? obligation?.deadlineByDate?.[selectedDate] ?? obligation?.localDeadline ?? '' : obligation?.localDeadline ?? '');
    setComment(selectedDate ? obligation?.localCommentByDate?.[selectedDate] ?? obligation?.localComment ?? '' : obligation?.localComment ?? '');
  }, [obligation?.id, obligation?.status, obligation?.statusByDate, obligation?.deadlineByDate, obligation?.localCommentByDate, obligation?.localComment, instanceDate, selectedDate]);
  if (!obligation) return <Card className="surface-card detail-card"><Heading level={3}>Velg en oppgave</Heading><Paragraph>Klikk på en oppgave i årshjulet eller arbeidslisten for å se detaljer.</Paragraph></Card>;
  const linkedSources = sources.filter((source) => obligation.sourceLinks.includes(source.id));
  const hasOfficialDeadline = Boolean(obligation.deadline || obligation.deadlineDates?.length);
  const saveStatus = async (nextStatus: TaskStatus) => { setSaving(true); try { const selectedStatusDate = occurrenceDate ?? obligation.deadlineDates?.[0]; const statusByDate = selectedStatusDate ? { ...(obligation.statusByDate ?? {}), [selectedStatusDate]: nextStatus } : undefined; await api.saveTaskPreference(orgNumber, obligation.id, { ...(statusByDate ? { statusByDate } : { status: nextStatus }), activated: Boolean(obligation.isActivated) }); setStatus(nextStatus); onTaskChanged(); } finally { setSaving(false); } };
  const saveLocalDetails = async () => { setSaving(true); try { await api.saveTaskPreference(orgNumber, obligation.id, { ...(selectedDate ? { occurrenceDate: selectedDate } : {}), activated: Boolean(obligation.isActivated || localDeadline), deadlineOverride: localDeadline || null, comment }); onTaskChanged(); } finally { setSaving(false); } };
  const setActivation = async (activated: boolean) => { setSaving(true); try { await api.saveTaskPreference(orgNumber, obligation.id, { activated }); onTaskChanged(); } finally { setSaving(false); } };
  const activateSchedule = async () => { setSaving(true); await api.saveTaskPreference(orgNumber, obligation.id, { activated: true, comment, recurrence: { frequency, interval: Math.max(1, Number(interval) || 1), dayOfMonth: Math.min(31, Math.max(1, Number(dayOfMonth) || 1)), startDate, endDate: endDate || undefined } }); setShowSchedule(false); setSaving(false); onTaskChanged(); };
  const selectedHidden = selectedDate ? obligation.isHidden === true || obligation.hiddenByDate?.[selectedDate] === true : obligation.isHidden === true;
  const setHidden = async (until?: string) => { setSaving(true); try { await api.saveTaskPreference(orgNumber, obligation.id, { activated: Boolean(obligation.isActivated), ...(hiddenScope === 'instance' && selectedDate ? { occurrenceDate: selectedDate } : {}), hiddenScope, hiddenUntil: until, hiddenForever: !until }); onTaskChanged(null); } finally { setSaving(false); } };
  const unhide = async () => { setSaving(true); try { const scope = obligation.isHidden ? 'all' : hiddenScope; await api.saveTaskPreference(orgNumber, obligation.id, { activated: Boolean(obligation.isActivated), ...(scope === 'instance' && selectedDate ? { occurrenceDate: selectedDate } : {}), hiddenScope: scope, hiddenUntil: undefined, hiddenForever: false }); onTaskChanged(); } finally { setSaving(false); } };
  return <Card className="surface-card detail-card"><div className="detail-topline"><span className="eyebrow">Oppgavedetaljer</span><span className={`status-pill ${statusClass[status]}`}>{statusLabels[status]}</span></div><Heading level={3}>{obligation.name}</Heading><Paragraph>{obligation.description}</Paragraph><div className="detail-meta"><div><Clock3 size={16} /><span><small>Tidsbruk</small><strong>{obligation.estimatedMinutes} minutter</strong></span></div><div><Landmark size={16} /><span><small>Ansvarlig etat</small><strong>{obligation.responsibleAgency}</strong></span></div><div><FileCheck2 size={16} /><span><small>Lovhjemmel</small><strong>{obligation.legalBasis}</strong></span></div></div><div className="detail-section"><strong>Nødvendige data</strong><div className="tag-row">{obligation.requiredData.map((item) => <Tag key={item}>{item}</Tag>)}</div></div>{obligation.attachments.length > 0 && <div className="detail-section"><strong>Vedlegg</strong><p>{obligation.attachments.join(' · ')}</p></div>}<div className="detail-section"><strong>Status</strong><select value={status} onChange={(event) => void saveStatus(event.target.value as TaskStatus)} disabled={saving}>{Object.entries(statusLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></div><div className="detail-section worklist-section"><strong>Arbeidsliste</strong>{obligation.isActivated ? <><p>Oppgaven er aktiv i arbeidslisten.</p><Button variant="secondary" onClick={() => void setActivation(false)} disabled={saving}>Fjern fra arbeidslisten</Button></> : hasOfficialDeadline ? <><p>Oppgaven ligger i katalogen, men er ikke valgt for din arbeidsliste.</p><Button variant="secondary" onClick={() => void setActivation(true)} disabled={saving}>Legg til i arbeidslisten</Button></> : <p>Velg lokal frist eller gjentakelse nedenfor for å legge oppgaven i arbeidslisten.</p>}</div><div className="detail-section local-details"><strong>Lokale opplysninger</strong><p>Endringene gjelder bare din arbeidsflate og endrer ikke den offisielle oppgaven.</p>{selectedDate && <p><span className="muted">Valgt forekomst:</span> {formatDate(selectedDate, true)}</p>}{obligation.deadline && <p><span className="muted">Offisiell frist:</span> {formatDate(obligation.deadline)}</p>}<DateField label="Lokal frist for valgt forekomst (valgfritt)" value={localDeadline} onChange={setLocalDeadline} /><label className="local-comment">Kommentar for valgt forekomst<Textarea rows={3} value={comment} onChange={(event) => setComment(event.target.value)} /></label><Button variant="secondary" onClick={() => void saveLocalDetails()} disabled={saving}>Lagre lokale opplysninger</Button></div><div className="detail-section visibility-section"><strong>Synlighet</strong><label className="visibility-scope">Gjelder<select value={hiddenScope} onChange={(event) => setHiddenScope(event.target.value as typeof hiddenScope)}><option value="instance">Valgt forekomst</option><option value="all">Alle forekomster</option></select></label>{selectedHidden ? <><p className="hidden-note"><EyeOff size={14} /> Denne oppgaven/forekomsten er skjult.</p><Button variant="secondary" onClick={() => void unhide()} disabled={saving}><EyeOff size={15} /> Vis igjen</Button></> : <div className="visibility-actions"><DateField label="Skjul til (valgfritt)" value={hiddenUntil} onChange={setHiddenUntil} /><Button variant="secondary" onClick={() => void setHidden(hiddenUntil)} disabled={saving || (hiddenScope === 'instance' && !selectedDate)}>Skjul {hiddenUntil ? 'til dato' : 'permanent'}</Button></div>}</div>{!obligation.deadline && <div className="schedule-box"><strong>Aktiver i arbeidslisten</strong><p>Denne oppgaven har ingen fast frist. Legg inn en lokal, gjentakende arbeidsfrist før den blir synlig i arbeidslisten.</p>{showSchedule ? <div className="schedule-form"><label>Gjentakelse<select value={frequency} onChange={(event) => setFrequency(event.target.value as typeof frequency)}><option value="monthly">Månedlig</option><option value="quarterly">Hvert kvartal</option><option value="yearly">Årlig</option></select></label><Textfield label="Intervall" type="number" value={interval} onChange={(event) => setInterval(event.target.value)} /><Textfield label="Dag i måneden" type="number" value={dayOfMonth} onChange={(event) => setDayOfMonth(event.target.value)} /><DateField label="Startdato" value={startDate} onChange={setStartDate} /><DateField label="Sluttdato (valgfritt)" value={endDate} onChange={setEndDate} /><div className="dialog-actions"><Button variant="secondary" onClick={() => setShowSchedule(false)}>Avbryt</Button><Button onClick={() => void activateSchedule()} disabled={saving}>Aktiver frister</Button></div></div> : <Button variant="secondary" onClick={() => setShowSchedule(true)}>Velg gjentakende frist</Button>}</div>}<div className="detail-section"><strong>Kilder</strong>{linkedSources.length ? linkedSources.map((source) => <a href={source.url} target="_blank" rel="noreferrer" className="source-link" key={source.id}><ShieldCheck size={15} />{source.title}<ChevronRight size={15} /></a>) : <p className="muted">Ingen autoritativ kilde koblet ennå.</p>}</div></Card>;
}

function SourcePanel({ sources }: { sources: Source[] }) {
  const [query, setQuery] = useState('');
  const filtered = query ? sources.filter((source) => `${source.title} ${source.relevantExcerpt}`.toLowerCase().includes(query.toLowerCase())) : sources.slice(0, 3);
  return <Card className="surface-card source-card"><div className="section-title"><div><p className="eyebrow">Kunnskapsgrunnlag</p><Heading level={3}>Kilder</Heading></div><Search size={18} /></div><Textfield aria-label="Søk i kilder" placeholder="Søk i godkjente kilder" value={query} onChange={(event) => setQuery(event.target.value)} />{filtered.map((source) => <div className="source-preview" key={source.id}><div className="source-label-row"><TrustLabel level={source.officiality} /><span className={`source-authority authority-${source.authority?.toLowerCase() ?? 'unverified'}`}>{sourceAuthorityLabel(source.authority)}</span></div><strong>{source.title}</strong><p>{source.relevantExcerpt}</p></div>)}</Card>;
}

function ChatPanel({ orgNumber, sources, prefillQuestion }: { orgNumber: string; sources: Source[]; prefillQuestion?: string }) {
  const [question, setQuestion] = useState('Hvilke oppgaver gjelder for oss nå?');
  const [submittedQuestion, setSubmittedQuestion] = useState('');
  const [answer, setAnswer] = useState<ChatAnswer | null>(null);
  const [history, setHistory] = useState<ChatExchange[]>([]);
  const [historyQuery, setHistoryQuery] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [feedback, setFeedback] = useState<ChatFeedback | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [chatError, setChatError] = useState('');
  const [isSlow, setIsSlow] = useState(false);
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
    void api.chatHistory(orgNumber).then(setHistory).catch(() => setHistory([]));
  }, [orgNumber]);
  useEffect(() => {
    if (prefillQuestion) setQuestion(prefillQuestion);
  }, [prefillQuestion]);
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
      const nextAnswer = await api.chat(nextQuestion, orgNumber, controller.signal);
      if (requestSequenceRef.current === requestId) {
        setAnswer(nextAnswer);
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
  const historicalExchange = answer?.exchangeId ? history.find((item) => item.id === answer.exchangeId) : undefined;
  const answerSources = historicalExchange?.sources.length ? historicalExchange.sources : sources.filter((source) => answer?.sourceIds.includes(source.id));
  const visibleHistory = history.filter((item) => `${item.question} ${item.answer}`.toLocaleLowerCase('nb-NO').includes(historyQuery.trim().toLocaleLowerCase('nb-NO')));
  const openExchange = (exchange: ChatExchange) => {
    setQuestion(exchange.question);
    setSubmittedQuestion(exchange.question);
    setAnswer({ answer: exchange.answer, uncertainty: exchange.uncertainty, sourceIds: exchange.sourceIds, followUpQuestions: exchange.followUpQuestions, exchangeId: exchange.id });
    setFeedback(exchange.feedback);
    setChatError('');
  };
  const setExchangeFeedback = async (nextFeedback: ChatFeedback) => {
    if (!answer?.exchangeId) return;
    const updated = await api.updateChatFeedback(answer.exchangeId, feedback === nextFeedback ? undefined : nextFeedback);
    setFeedback(updated.feedback);
    setHistory((items) => items.map((item) => item.id === updated.id ? updated : item));
  };
  const deleteExchange = async (exchange: ChatExchange) => {
    await api.deleteChatExchange(exchange.id);
    setHistory((items) => items.filter((item) => item.id !== exchange.id));
    if (answer?.exchangeId === exchange.id) {
      setAnswer(null);
      setSubmittedQuestion('');
      setFeedback(undefined);
    }
  };
  return <Card className="surface-card chat-card"><div className="chat-heading"><div className="ai-orb"><Sparkles size={19} /></div><div><Heading level={3}>Spør losen</Heading><span>KI-forslag med kilder</span></div><span className="demo-badge">Demo</span></div><div className="chat-answer">{chatError ? <Alert data-color="danger"><AlertCircle size={16} />{chatError}</Alert> : answer ? <><FormattedAnswer text={answer.answer} /><div className="uncertainty"><AlertCircle size={16} /><span>{answer.uncertainty}</span></div>{answerSources.map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={source.id} className="chat-source"><FileCheck2 size={14} />{source.title}</a>)}<div className="followups">{answer.followUpQuestions.map((item) => <button key={item} onClick={() => setQuestion(item)}>{item}</button>)}</div><div className="chat-feedback"><span>Var dette nyttig?</span><button className={feedback === 'useful' ? 'selected' : ''} onClick={() => void setExchangeFeedback('useful')} disabled={!answer.exchangeId}><ThumbsUp size={14} /> Ja</button><button className={feedback === 'not_useful' ? 'selected' : ''} onClick={() => void setExchangeFeedback('not_useful')} disabled={!answer.exchangeId}><ThumbsDown size={14} /> Nei</button></div></> : <p className="muted">Still spørsmål om oppgaver, frister eller hva som må avklares.</p>}{isLoading && <div className="chat-loading"><Sparkles size={15} /> Losen arbeider i bakgrunnen…{isSlow && <span>Dette kan ta opptil et halvt minutt når mange oppgaver skal vurderes.</span>}</div>}{submittedQuestion && <p className="submitted-question"><span>Sist sendt:</span> {submittedQuestion}</p>}</div><div className="chat-input"><Textarea aria-label="Spørsmål til KI-losen" rows={2} value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={handleQuestionKeyDown} /><Button aria-label={isLoading ? 'Avbryt spørsmål' : 'Send spørsmål'} onClick={() => void (isLoading ? cancel() : ask())}>{isLoading ? 'Avbryt' : <Send size={16} />}</Button></div><div className="chat-history"><button className="chat-history-toggle" onClick={() => setShowHistory((visible) => !visible)}><History size={15} /> Tidligere spørsmål ({history.length})<ChevronRight size={15} className={showHistory ? 'rotated' : ''} /></button>{showHistory && <div className="chat-history-content"><Textfield aria-label="Søk i tidligere spørsmål" placeholder="Søk i historikken" value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} />{visibleHistory.length > 0 ? <div className="chat-history-list">{visibleHistory.map((exchange) => <div className={`chat-history-item ${answer?.exchangeId === exchange.id ? 'selected' : ''}`} key={exchange.id}><button onClick={() => openExchange(exchange)}><strong>{exchange.question}</strong><small>{formatDateTime(exchange.createdAt)}{exchange.feedback === 'useful' ? ' · Nyttig' : exchange.feedback === 'not_useful' ? ' · Ikke nyttig' : ''}</small></button><button className="chat-history-delete" onClick={() => void deleteExchange(exchange)} aria-label="Slett tidligere svar"><Trash2 size={14} /></button></div>)}</div> : <p className="muted">Ingen tidligere spørsmål matcher søket.</p>}</div>}</div><div className="chat-trust"><ShieldCheck size={15} /> Svarene er veiledende og kan ikke erstatte juridisk vurdering.</div></Card>;
}

function ReportDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState(''); const [description, setDescription] = useState(''); const [agency, setAgency] = useState(''); const [isSaving, setIsSaving] = useState(false);
  const submit = async () => { setIsSaving(true); await api.createReport({ title, description, suspectedAgency: agency, evidenceLinks: [], aiSuggestions: ['Kontroller om kravet finnes i Oppgaveregisteret.', 'Avklar hjemmel og målgruppe med foreslått etat.'] }); setIsSaving(false); onCreated(); };
  return <div className="dialog-backdrop" role="presentation"><div className="dialog" role="dialog" aria-modal="true" aria-labelledby="report-title"><div className="dialog-heading"><div><p className="eyebrow">Uoffisielt innspill</p><Heading level={2} id="report-title">Meld inn mulig manglende plikt</Heading></div><button onClick={onClose} aria-label="Lukk"><X /></button></div><Alert data-color="warning"><AlertCircle size={18} /> Innspillet blir ikke en offisiell oppgave. Det sendes til menneskelig gjennomgang.</Alert><div className="form-grid"><Textfield label="Hva gjelder innspillet?" value={title} onChange={(event) => setTitle(event.target.value)} /><Textfield label="Foreslått etat (valgfritt)" value={agency} onChange={(event) => setAgency(event.target.value)} /><Textfield multiline className="wide-field" label="Beskriv hva dere må rapportere og hvorfor" rows={5} value={description} onChange={(event) => setDescription(event.target.value)} /></div><div className="dialog-actions"><Button variant="secondary" onClick={onClose}>Avbryt</Button><Button onClick={() => void submit()} disabled={!title || !description || isSaving}>{isSaving ? 'Sender…' : 'Send til gjennomgang'}</Button></div></div></div>;
}

function AdminView({ reports, onStatusChange }: { reports: UserReportedRequirement[]; onStatusChange: (id: string, status: UserReportedRequirement['reviewStatus']) => Promise<void> }) {
  const [filter, setFilter] = useState('all');
  const filtered = filter === 'all' ? reports : reports.filter((report) => report.reviewStatus === filter);
  return <section className="admin-page"><div className="admin-heading"><div><p className="eyebrow">Intern arbeidsflate</p><Heading level={1}>Saksbehandler</Heading><Paragraph>Vurder innspill før de eventuelt sendes til Brønnøysundregistrene eller foreslått etat.</Paragraph></div><div className="admin-summary"><div><strong>{reports.length}</strong><span>nye innspill</span></div><div><strong>{reports.filter((item) => item.reviewStatus === 'needs_more_info').length}</strong><span>trenger mer info</span></div></div></div><div className="admin-toolbar"><div className="filter-row"><Filter size={16} /><select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filtrer innspill"><option value="all">Alle statuser</option><option value="new">Nye</option><option value="needs_more_info">Trenger mer info</option><option value="forwarded">Sendt videre</option><option value="confirmed">Bekreftet</option></select></div><span className="audit-note"><ShieldCheck size={16} /> Alle endringer logges</span></div><div className="reports-grid">{filtered.map((report) => <Card className="surface-card report-card" key={report.id}><div className="report-card-top"><TrustLabel level="USER_REPORTED" /><span className="report-id">{report.id}</span></div><Heading level={3}>{report.title}</Heading><Paragraph>{report.description}</Paragraph><div className="report-facts"><span><UserRound size={15} />{report.reportedBy}</span><span><Landmark size={15} />{report.suspectedAgency || 'Etat ikke foreslått'}</span><span><Sparkles size={15} />KI-treff {Math.round(report.confidence * 100)} %</span></div><div className="ai-suggestion-box"><strong>KI-forslag, ikke konklusjon</strong>{report.aiSuggestions.map((suggestion) => <span key={suggestion}>· {suggestion}</span>)}</div><div className="report-actions"><select value={report.reviewStatus} onChange={(event) => void onStatusChange(report.id, event.target.value as UserReportedRequirement['reviewStatus'])} aria-label={`Status for ${report.title}`}><option value="new">Nytt</option><option value="needs_more_info">Trenger mer info</option><option value="forwarded">Sendt videre</option><option value="confirmed">Bekreftet</option><option value="rejected">Avvist</option><option value="duplicate">Duplikat</option></select><Button variant="secondary">Åpne kilder</Button></div></Card>)}</div></section>;
}

export default App;
