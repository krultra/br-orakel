import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CalendarDays, Check, ChevronRight, CircleHelp, Clock3, FileCheck2, Filter, Landmark, MessageCircle, Plus, Search, Send, ShieldCheck, Sparkles, UserRound, X } from 'lucide-react';
import { Alert, Button, Card, Heading, Paragraph, Tag, Textarea, Textfield } from '@digdir/designsystemet-react';
import { api } from './api';
import type { ChatAnswer, DemoUser, Obligation, Organization, Source, TaskStatus, UserReportedRequirement } from './domain/types';

const statusLabels: Record<TaskStatus, string> = {
  not_started: 'Ikke startet', in_progress: 'Pågår', ready: 'Klar til innsending', submitted: 'Sendt inn', completed: 'Fullført', not_applicable: 'Ikke relevant', needs_clarification: 'Avklar først',
};

const statusClass: Record<TaskStatus, string> = {
  not_started: 'status-neutral', in_progress: 'status-blue', ready: 'status-yellow', submitted: 'status-purple', completed: 'status-green', not_applicable: 'status-neutral', needs_clarification: 'status-orange',
};

function formatDate(value?: string) {
  if (!value) return 'Ved hendelse';
  return new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short' }).format(new Date(value));
}

function TrustLabel({ level }: { level: string }) {
  const labels: Record<string, string> = { OFFICIAL: 'Offisiell oppgave', OFFICIAL_GUIDANCE: 'Offisiell veiledning', USER_REPORTED: 'Brukerinnspill', AI_SUGGESTION: 'KI-forslag', UNDER_REVIEW: 'Under vurdering' };
  return <span className={`trust trust-${level.toLowerCase()}`}><ShieldCheck size={14} /> {labels[level] ?? level}</span>;
}

function App() {
  const [user, setUser] = useState<DemoUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [orgNumber, setOrgNumber] = useState('');
  const [savedOrganizations, setSavedOrganizations] = useState<Organization[]>([]);
  const [organizationSearchResults, setOrganizationSearchResults] = useState<Organization[]>([]);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [reports, setReports] = useState<UserReportedRequirement[]>([]);
  const [selectedObligationId, setSelectedObligationId] = useState<string | null>(null);
  const [view, setView] = useState<'overview' | 'admin'>('overview');
  const [calendarMode, setCalendarMode] = useState<'year' | 'list'>('year');
  const [statusFilter, setStatusFilter] = useState<'all' | TaskStatus>('all');
  const [loading, setLoading] = useState(false);
  const [searchingOrganizations, setSearchingOrganizations] = useState(false);
  const [toast, setToast] = useState('');

  const loadOrganization = async (number = orgNumber) => {
    setLoading(true);
    try {
      const [nextOrg, nextObligations, nextSources, nextReports] = await Promise.all([api.organization(number), api.obligations(number), api.sources('', number), api.reports()]);
      setOrganization(nextOrg); setObligations(nextObligations); setSources(nextSources); setReports(nextReports); setSelectedObligationId(nextObligations[0]?.id ?? null); setOrganizationSearchResults([]); setToast('Virksomhetsoversikten er oppdatert.');
    } catch (error) { setOrganization(null); setToast(error instanceof Error ? error.message : 'Kunne ikke laste virksomheten.'); }
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
    await api.logout();
    setUser(null);
    setOrganization(null);
    setObligations([]);
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
  const filteredObligations = statusFilter === 'all' ? obligations : obligations.filter((item) => item.status === statusFilter);

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand-lockup"><img src="/orakel-logo.svg" alt="ORaKeL" /><div><strong>ORaKeL</strong><span>KI-assistert rapporteringslos</span></div></div>
      <div className="user-pill"><div className="avatar">{user.displayName.slice(0, 2).toUpperCase()}</div><span>{user.displayName}</span><small>{user.role === 'caseworker' ? 'Saksbehandler' : 'Virksomhet'}</small><button onClick={() => void signOut()}>Logg ut</button></div>
    </header>

    <main className="page-container">
      {user.role === 'business' && <section className="hero-row">
        <div><p className="eyebrow">MVP · BRREG-data + godkjente kilder</p><Heading level={1} data-size="2xl">Hold oversikten over rapporteringen</Heading><Paragraph>Én samlet arbeidsflate for plikter, frister, kilder og avklaringer.</Paragraph></div>
        <div className="org-picker"><label htmlFor="saved-organizations">Mine virksomheter</label><select id="saved-organizations" value="" onChange={(event) => { if (event.target.value) { setOrgNumber(event.target.value); void loadOrganization(event.target.value); } }}><option value="">Velg lagret virksomhet…</option>{savedOrganizations.map((item) => <option key={item.orgNumber} value={item.orgNumber}>{item.name} ({item.orgNumber})</option>)}</select><div className="org-input-row"><Textfield id="org-number" value={orgNumber} onChange={(event) => { setOrgNumber(event.target.value); setOrganizationSearchResults([]); }} placeholder="Søk på navn eller organisasjonsnummer" aria-label="Søk på navn eller organisasjonsnummer" /><Button onClick={() => void searchOrganizations()} disabled={loading || searchingOrganizations}>{loading ? 'Laster…' : searchingOrganizations ? 'Søker…' : 'Søk'}</Button></div><span className="field-hint">Søk på navn eller ni siffer. Velg deretter «Legg til» for å lagre virksomheten.</span>{organization && !savedOrganizations.some((item) => item.orgNumber === organization.orgNumber) && <Button variant="secondary" onClick={() => void addCurrentOrganization()}>Legg til i Mine virksomheter</Button>}{organizationSearchResults.length > 0 && <div className="org-search-results" aria-label="Søkeresultater">{organizationSearchResults.map((item) => <button key={item.orgNumber} className="org-search-result" onClick={() => { setOrgNumber(item.orgNumber); void loadOrganization(item.orgNumber); }}><strong>{item.name}</strong><span>{item.orgNumber} · {item.organizationForm} · {item.municipality || 'Kommune ikke oppgitt'}</span></button>)}</div>}</div>
      </section>}

      {toast && <div className="toast" role="status"><Check size={16} /> {toast}<button onClick={() => setToast('')} aria-label="Lukk melding"><X size={16} /></button></div>}

      {user.role === 'caseworker' && <AdminView reports={reports} onStatusChange={async (id, status) => { const updated = await api.updateReport(id, status); setReports((items) => items.map((item) => item.id === id ? updated : item)); setToast('Innspillet er oppdatert og endringen er logget i demoen.'); }} />}
      {user.role === 'business' && organization && <Overview organization={organization} obligations={filteredObligations} allObligations={obligations} sources={sources} selectedObligation={selectedObligation} setSelectedObligationId={setSelectedObligationId} calendarMode={calendarMode} setCalendarMode={setCalendarMode} statusFilter={statusFilter} setStatusFilter={setStatusFilter} onTaskChanged={() => void loadOrganization(organization.orgNumber)} />}
      {user.role === 'business' && !organization && <Card className="surface-card empty-state"><Heading level={2}>Velkommen til ORaKeL</Heading><Paragraph>Søk etter virksomheten din ovenfor, velg et treff og legg den til i Mine virksomheter.</Paragraph></Card>}
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
  return <main className="auth-shell"><Card className="auth-card"><img src="/orakel-logo.svg" alt="ORaKeL" className="auth-logo" /><p className="eyebrow">Demo-tilgang</p><Heading level={1}>{mode === 'login' ? 'Logg inn i ORaKeL' : 'Opprett demo-bruker'}</Heading><Paragraph>{mode === 'login' ? 'Velg virksomhetsbruker eller saksbehandler for å starte.' : 'Brukeren lagres kun i denne hackathon-instansen.'}</Paragraph>{mode === 'register' && <Textfield label="Navn som vises" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />}{<Textfield label="Brukernavn" value={username} onChange={(event) => setUsername(event.target.value)} />}{<Textfield label="Passord" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />}{error && <Alert data-color="danger"><AlertCircle size={17} />{error}</Alert>}<Button onClick={() => void submit()} disabled={busy || !username || !password}>{busy ? 'Arbeider…' : mode === 'login' ? 'Logg inn' : 'Opprett bruker'}</Button><button className="auth-switch" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>{mode === 'login' ? 'Opprett ny virksomhetsbruker' : 'Jeg har allerede bruker'}</button>{mode === 'login' && <p className="demo-credentials">Demo-saksbehandler: <code>br-saksbehandler</code> / <code>demo</code></p>}</Card></main>;
}

function Overview({ organization, obligations, allObligations, sources, selectedObligation, setSelectedObligationId, calendarMode, setCalendarMode, statusFilter, setStatusFilter, onTaskChanged }: { organization: Organization; obligations: Obligation[]; allObligations: Obligation[]; sources: Source[]; selectedObligation: Obligation | null; setSelectedObligationId: (id: string) => void; calendarMode: 'year' | 'list'; setCalendarMode: (mode: 'year' | 'list') => void; statusFilter: 'all' | TaskStatus; setStatusFilter: (value: 'all' | TaskStatus) => void; onTaskChanged: () => void }) {
  const [showReport, setShowReport] = useState(false);
  return <>
    <section className="context-bar"><div className="context-company"><div className="company-icon"><Landmark size={20} /></div><div><strong>{organization.name}</strong><span>Org.nr. {organization.orgNumber} · {organization.organizationForm} · {organization.municipality}</span></div></div><div className="context-facts"><span><strong>{allObligations.length}</strong> oppgaver</span><span><strong>{allObligations.filter((item) => item.status === 'completed').length}</strong> fullført</span><span><strong>{allObligations.reduce((sum, item) => sum + item.estimatedMinutes, 0)} min</strong> estimert</span></div></section>
    <section className="dashboard-grid">
      <div className="main-column">
        <Card className="surface-card calendar-card"><div className="card-heading-row"><div><p className="eyebrow">Rapporteringsåret 2026</p><Heading level={2}>Årshjul</Heading></div><div className="segmented"><button className={calendarMode === 'year' ? 'selected' : ''} onClick={() => setCalendarMode('year')}>Årshjul</button><button className={calendarMode === 'list' ? 'selected' : ''} onClick={() => setCalendarMode('list')}>Liste</button></div></div>{calendarMode === 'year' ? <YearWheel obligations={obligations} selectedId={selectedObligation?.id} onSelect={setSelectedObligationId} /> : <ObligationList obligations={obligations} selectedId={selectedObligation?.id} onSelect={setSelectedObligationId} />}</Card>
        <div className="workspace-heading"><div><p className="eyebrow">Arbeidsliste</p><Heading level={2}>Det som må gjøres</Heading></div><div className="filter-row"><Filter size={16} /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} aria-label="Filtrer oppgaver"><option value="all">Alle statuser</option>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div></div>
        <div className="task-list">{obligations.map((item) => <TaskRow key={item.id} obligation={item} selected={selectedObligation?.id === item.id} onClick={() => setSelectedObligationId(item.id)} />)}</div>
        <button className="report-cta" onClick={() => setShowReport(true)}><div className="report-cta-icon"><Plus size={20} /></div><div><strong>Finner du en plikt som mangler?</strong><span>Meld inn et mulig krav til menneskelig gjennomgang.</span></div><ChevronRight size={20} /></button>
      </div>
      <aside className="side-column"><ChatPanel orgNumber={organization.orgNumber} sources={sources} /><SourcePanel sources={sources} /><ObligationDetail orgNumber={organization.orgNumber} obligation={selectedObligation} sources={sources} onTaskChanged={onTaskChanged} /></aside>
    </section>
    {showReport && <ReportDialog onClose={() => setShowReport(false)} onCreated={() => setShowReport(false)} />}
  </>;
}

function YearWheel({ obligations, selectedId, onSelect }: { obligations: Obligation[]; selectedId?: string; onSelect: (id: string) => void }) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Des'];
  const grouped = useMemo(() => {
    const buckets = months.map((month) => ({ month, items: [] as Array<{ item: Obligation; date?: string }> }));
    const noDateItems: Array<{ item: Obligation; date?: string }> = [];
    for (const item of obligations) {
      const dates = item.deadlineDates?.length ? item.deadlineDates : [item.reportingWindowStart ?? item.deadline].filter((date): date is string => Boolean(date));
      if (dates.length === 0) {
        noDateItems.push({ item });
        continue;
      }
      for (const date of dates) {
        const monthIndex = new Date(date).getMonth();
        if (monthIndex >= 0 && monthIndex < months.length) buckets[monthIndex].items.push({ item, date });
      }
    }
    return [...buckets, { month: 'Uten fast frist', items: noDateItems }];
  }, [obligations]);
  return <div className="year-wheel">{grouped.map(({ month, items }) => <div className={`month-cell ${items.length ? 'has-items' : ''}`} key={month}><span className="month-label">{month}</span>{items.map(({ item, date }) => <button key={`${item.id}-${date ?? 'no-date'}`} className={`calendar-item ${statusClass[item.status]} ${selectedId === item.id ? 'is-selected' : ''}`} onClick={() => onSelect(item.id)}><span className="calendar-dot" />{item.name}<small>{formatDate(date ?? item.deadline)}</small></button>)}</div>)}</div>;
}

function ObligationList({ obligations, selectedId, onSelect }: { obligations: Obligation[]; selectedId?: string; onSelect: (id: string) => void }) {
  return <div className="obligation-list">{obligations.map((item) => <button className={`list-obligation ${selectedId === item.id ? 'is-selected' : ''}`} key={item.id} onClick={() => onSelect(item.id)}><span className={`timeline-dot ${statusClass[item.status]}`} /><span><strong>{item.name}</strong><small>{item.frequency} · {item.deadline ? `frist ${formatDate(item.deadline)}` : 'hendelsesutløst'}</small></span><ChevronRight size={17} /></button>)}</div>;
}

function TaskRow({ obligation, selected, onClick }: { obligation: Obligation; selected: boolean; onClick: () => void }) {
  return <button className={`task-row ${selected ? 'is-selected' : ''}`} onClick={onClick}><div className={`task-icon ${statusClass[obligation.status]}`}>{obligation.trigger === 'event' ? <CircleHelp size={18} /> : <CalendarDays size={18} />}</div><div className="task-main"><div className="task-title-row"><strong>{obligation.name}</strong><TrustLabel level={obligation.officialStatus} /></div><span>{obligation.responsibleAgency} · {obligation.frequency}</span></div><div className="task-deadline"><small>Frist</small><strong>{formatDate(obligation.deadline)}</strong></div><div className="task-status"><span className={`status-pill ${statusClass[obligation.status]}`}>{statusLabels[obligation.status]}</span><ChevronRight size={18} /></div></button>;
}

function ObligationDetail({ orgNumber, obligation, sources, onTaskChanged }: { orgNumber: string; obligation: Obligation | null; sources: Source[]; onTaskChanged: () => void }) {
  const [status, setStatus] = useState<TaskStatus>('not_started');
  const [showSchedule, setShowSchedule] = useState(false);
  const [frequency, setFrequency] = useState<'monthly' | 'quarterly' | 'yearly'>('monthly');
  const [interval, setInterval] = useState('1');
  const [dayOfMonth, setDayOfMonth] = useState('5');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  if (!obligation) return <Card className="surface-card detail-card"><Heading level={3}>Velg en oppgave</Heading><Paragraph>Klikk på en oppgave i årshjulet eller arbeidslisten for å se detaljer.</Paragraph></Card>;
  const linkedSources = sources.filter((source) => obligation.sourceLinks.includes(source.id));
  const saveStatus = async (nextStatus: TaskStatus) => { setSaving(true); await api.saveTaskPreference(orgNumber, obligation.id, { status: nextStatus, activated: Boolean(obligation.deadline || obligation.deadlineDates?.length) }); setStatus(nextStatus); setSaving(false); onTaskChanged(); };
  const activateSchedule = async () => { setSaving(true); await api.saveTaskPreference(orgNumber, obligation.id, { activated: true, comment, recurrence: { frequency, interval: Math.max(1, Number(interval) || 1), dayOfMonth: Math.min(31, Math.max(1, Number(dayOfMonth) || 1)), startDate, endDate: endDate || undefined } }); setShowSchedule(false); setSaving(false); onTaskChanged(); };
  return <Card className="surface-card detail-card"><div className="detail-topline"><span className="eyebrow">Oppgavedetaljer</span><span className={`status-pill ${statusClass[obligation.status]}`}>{statusLabels[obligation.status]}</span></div><Heading level={3}>{obligation.name}</Heading><Paragraph>{obligation.description}</Paragraph><div className="detail-meta"><div><Clock3 size={16} /><span><small>Tidsbruk</small><strong>{obligation.estimatedMinutes} minutter</strong></span></div><div><Landmark size={16} /><span><small>Ansvarlig etat</small><strong>{obligation.responsibleAgency}</strong></span></div><div><FileCheck2 size={16} /><span><small>Lovhjemmel</small><strong>{obligation.legalBasis}</strong></span></div></div><div className="detail-section"><strong>Nødvendige data</strong><div className="tag-row">{obligation.requiredData.map((item) => <Tag key={item}>{item}</Tag>)}</div></div>{obligation.attachments.length > 0 && <div className="detail-section"><strong>Vedlegg</strong><p>{obligation.attachments.join(' · ')}</p></div>}<div className="detail-section"><strong>Status</strong><select value={status === 'not_started' ? obligation.status : status} onChange={(event) => void saveStatus(event.target.value as TaskStatus)} disabled={saving}>{Object.entries(statusLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></div>{!obligation.deadline && <div className="schedule-box"><strong>Aktiver i årshjulet</strong><p>Denne oppgaven har ingen fast frist. Legg inn en lokal, gjentakende arbeidsfrist.</p>{showSchedule ? <div className="schedule-form"><label>Gjentakelse<select value={frequency} onChange={(event) => setFrequency(event.target.value as typeof frequency)}><option value="monthly">Månedlig</option><option value="quarterly">Hvert kvartal</option><option value="yearly">Årlig</option></select></label><Textfield label="Intervall" type="number" value={interval} onChange={(event) => setInterval(event.target.value)} /><Textfield label="Dag i måneden" type="number" value={dayOfMonth} onChange={(event) => setDayOfMonth(event.target.value)} /><Textfield label="Startdato" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /><Textfield label="Sluttdato (valgfritt)" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /><Textfield label="Kommentar" value={comment} onChange={(event) => setComment(event.target.value)} /><div className="dialog-actions"><Button variant="secondary" onClick={() => setShowSchedule(false)}>Avbryt</Button><Button onClick={() => void activateSchedule()} disabled={saving}>Aktiver frister</Button></div></div> : <Button variant="secondary" onClick={() => setShowSchedule(true)}>Velg gjentakende frist</Button>}</div>}<div className="detail-section"><strong>Kilder</strong>{linkedSources.length ? linkedSources.map((source) => <a href={source.url} target="_blank" rel="noreferrer" className="source-link" key={source.id}><ShieldCheck size={15} />{source.title}<ChevronRight size={15} /></a>) : <p className="muted">Ingen autoritativ kilde koblet ennå.</p>}</div></Card>;
}

function SourcePanel({ sources }: { sources: Source[] }) {
  const [query, setQuery] = useState('');
  const filtered = query ? sources.filter((source) => `${source.title} ${source.relevantExcerpt}`.toLowerCase().includes(query.toLowerCase())) : sources.slice(0, 3);
  return <Card className="surface-card source-card"><div className="section-title"><div><p className="eyebrow">Kunnskapsgrunnlag</p><Heading level={3}>Kilder</Heading></div><Search size={18} /></div><Textfield aria-label="Søk i kilder" placeholder="Søk i godkjente kilder" value={query} onChange={(event) => setQuery(event.target.value)} />{filtered.map((source) => <div className="source-preview" key={source.id}><TrustLabel level={source.officiality} /><strong>{source.title}</strong><p>{source.relevantExcerpt}</p></div>)}</Card>;
}

function ChatPanel({ orgNumber, sources }: { orgNumber: string; sources: Source[] }) {
  const [question, setQuestion] = useState('Hvilke oppgaver gjelder for oss nå?');
  const [answer, setAnswer] = useState<ChatAnswer | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const ask = async () => { if (!question.trim()) return; setIsLoading(true); try { setAnswer(await api.chat(question, orgNumber)); } finally { setIsLoading(false); } };
  const answerSources = sources.filter((source) => answer?.sourceIds.includes(source.id));
  return <Card className="surface-card chat-card"><div className="chat-heading"><div className="ai-orb"><Sparkles size={19} /></div><div><Heading level={3}>Spør losen</Heading><span>KI-forslag med kilder</span></div><span className="demo-badge">Demo</span></div><div className="chat-answer">{answer ? <><p>{answer.answer}</p><div className="uncertainty"><AlertCircle size={16} /><span>{answer.uncertainty}</span></div>{answerSources.map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={source.id} className="chat-source"><FileCheck2 size={14} />{source.title}</a>)}<div className="followups">{answer.followUpQuestions.map((item) => <button key={item} onClick={() => setQuestion(item)}>{item}</button>)}</div></> : <p className="muted">Still spørsmål om oppgaver, frister eller hva som må avklares.</p>}</div><div className="chat-input"><Textarea aria-label="Spørsmål til KI-losen" rows={2} value={question} onChange={(event) => setQuestion(event.target.value)} /><Button aria-label="Send spørsmål" onClick={() => void ask()} disabled={isLoading}><Send size={16} /></Button></div><div className="chat-trust"><ShieldCheck size={15} /> Svarene er veiledende og kan ikke erstatte juridisk vurdering.</div></Card>;
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
