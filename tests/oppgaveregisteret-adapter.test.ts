import assert from 'node:assert/strict';
import test from 'node:test';
import { OppgaveregisteretAdapter, OppgaveregisteretError } from '../src/data/oppgaveregisteret-adapter.js';
import type { Organization } from '../src/domain/types.js';

const organization: Organization = {
  orgNumber: '999999999',
  name: 'Fjordgløtt Mat og Handel AS',
  organizationForm: 'AS',
  industryCodes: ['47.110', '56.101'],
  hasEmployees: true,
  municipality: 'Trondheim',
  sources: [],
};

const rawForm = (overrides: Record<string, unknown> = {}) => ({
  navn: 'Eksempeloppgave',
  nummer: 'BR-TEST-01',
  guid: 'TEST01',
  statustype: 'PUBLISERT',
  eier: { etatsnavn: 'TESTETATEN' },
  formaal: { fritekst: 'Rapporter opplysninger til testformålet.' },
  vedleggskrav: { fritekst: 'Legg ved dokumentasjon.', kategorier: [{ kode: 'ANNET', verdi: 'Annet' }] },
  lovhjemler: [{ tittel: 'Testloven', henvisning: '§ 1' }],
  maalgruppe: { naeringsgrupper: [{ organisasjonsformer: [{ kode: 'AS' }], naeringskoder: [{ kode: '47.110' }] }], gjelderKunVedAnsatte: true },
  skjemainnhold: [{ kode: 'REGNSKAP', verdi: 'Regnskapsopplysninger' }],
  skjemainnholdAndreOpplysninger: 'Supplerende opplysninger',
  bruksomraader: [{ navn: 'Hendelsesrapportering', kommentar: 'Ved en relevant hendelse.', hendelseskategori: { navn: 'Organisatorisk endring' } }],
  rapporteringsformer: [{ kode: 'ELEKTRONISK', verdi: 'Elektronisk' }],
  tidsbruk: { elektronisk: 15, papir: 20 },
  nettadresser: ['https://www.testetat.no/veiledning/eksempel'],
  datakilder: [{ navn: 'Testregisteret' }],
  ...overrides,
});

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

test('Oppgaveregisteret-adapteren sender virksomhetsfiltre og mapper offisiell oppgave', async () => {
  const urls: string[] = [];
  const adapter = new OppgaveregisteretAdapter({
    pageSize: 10,
    fetcher: async (input) => {
      urls.push(input);
      return jsonResponse({ start: 0, antall: 1, maxAntall: 160, skjema: [rawForm()] });
    },
  });

  const obligations = await adapter.listForOrganization(organization);
  const [obligation] = obligations;
  const requestUrl = new URL(urls[0]);

  assert.equal(obligations.length, 1);
  assert.equal(obligation.name, 'Eksempeloppgave');
  assert.equal(obligation.officialStatus, 'OFFICIAL');
  assert.equal(obligation.responsibleAgency, 'TESTETATEN');
  assert.equal(obligation.trigger, 'event');
  assert.equal(obligation.frequency, 'Ved hendelse');
  assert.ok(obligation.reportingForms?.includes('Elektronisk'));
  assert.equal(obligation.submissionMode, 'unknown');
  assert.equal(obligation.automaticCompletionPolicy, 'none');
  assert.equal(obligation.estimatedMinutes, 15);
  assert.deepEqual(obligation.sourceLinks, ['source-oppgaveregisteret']);
  assert.equal(obligation.guidanceLinks?.[0]?.url, 'https://www.testetat.no/veiledning/eksempel');
  assert.equal(obligation.guidanceLinks?.[0]?.sourceLabel, 'Oppgaveregisteret');
  assert.equal(obligation.detailInfo?.targetAudience, undefined);
  assert.deepEqual(obligation.detailInfo?.dataSources, ['Testregisteret']);
  assert.ok(obligation.targetCriteria.includes('AS'));
  assert.ok(obligation.targetCriteria.includes('47.110'));
  assert.ok(obligation.targetCriteria.includes('arbeidsgiveransvar'));
  assert.equal(requestUrl.searchParams.get('organisasjonsformer'), 'AS');
  assert.equal(requestUrl.searchParams.get('naeringskoder'), '47.110');
  assert.equal(requestUrl.searchParams.get('ekskluderArbeidsgiver'), 'false');
});

test('adapteren merker eksplisitt systeminnsending for automatisk statusregel', async () => {
  const adapter = new OppgaveregisteretAdapter({
    fetcher: async () => jsonResponse({ start: 0, antall: 1, maxAntall: 160, skjema: [rawForm({
      navn: 'A-Melding innsendelse fra system',
      rapporteringsformer: [{ kode: 'NAERING_STAT', verdi: 'næring' }],
    })] }),
  });

  const [obligation] = await adapter.listForOrganization(organization);

  assert.equal(obligation.submissionMode, 'system');
  assert.equal(obligation.completionSource, 'rule');
  assert.equal(obligation.automaticCompletionPolicy, 'after_deadline');
});

test('adapteren skjuler Oppgaveregisterets placeholder for ukjent hendelseskategori', async () => {
  const adapter = new OppgaveregisteretAdapter({
    fetcher: async () => jsonResponse({ start: 0, antall: 1, maxAntall: 160, skjema: [rawForm({ bruksomraader: [{ navn: 'Hendelsesrapportering', hendelseskategori: { navn: '(beskrives)' } }] })] }),
  });

  const [obligation] = await adapter.listForOrganization(organization);

  assert.equal(obligation.trigger, 'event');
  assert.equal(obligation.eventLabel, undefined);
});

test('Oppgaveregisteret-adapteren paginerer over flere sider', async () => {
  const urls: string[] = [];
  const forms = [rawForm(), rawForm({ nummer: 'BR-TEST-02', guid: 'TEST02', navn: 'Andreoppgave' }), rawForm({ nummer: 'BR-TEST-03', guid: 'TEST03', navn: 'Tredjeoppgave' })];
  const singleIndustryOrganization = { ...organization, industryCodes: ['47.110'] };
  const adapter = new OppgaveregisteretAdapter({
    pageSize: 2,
    fetcher: async (input) => {
      const url = new URL(input);
      urls.push(input);
      const start = Number(url.searchParams.get('start'));
      const page = forms.slice(start, start + 2);
      return jsonResponse({ start, antall: page.length, maxAntall: 160, skjema: page });
    },
  });

  const obligations = await adapter.listForOrganization(singleIndustryOrganization);

  assert.equal(obligations.length, 3);
  assert.equal(new URL(urls[1]).searchParams.get('start'), '2');
});

test('Oppgaveregisteret-adapteren eksponerer HTTP-feil med URL og status', async () => {
  const adapter = new OppgaveregisteretAdapter({
    fetcher: async () => jsonResponse({ message: 'temporary failure' }, 503),
  });

  await assert.rejects(
    () => adapter.listForOrganization(organization),
    (error: unknown) => error instanceof OppgaveregisteretError && error.status === 503 && error.url.includes('/skjema'),
  );
});

test('adapteren beholder treff når én av flere næringskoder avvises av pilot-API-et', async () => {
  const requestedCodes: string[] = [];
  const adapter = new OppgaveregisteretAdapter({
    pageSize: 10,
    fetcher: async (input) => {
      const url = new URL(input);
      const code = url.searchParams.get('naeringskoder') ?? '';
      requestedCodes.push(code);
      if (code === '56.101') return jsonResponse({ message: 'Ukjent næringskode' }, 400);
      return jsonResponse({ start: 0, antall: 1, maxAntall: 160, skjema: [rawForm()] });
    },
  });

  const obligations = await adapter.listForOrganization(organization);

  assert.deepEqual(requestedCodes, ['47.110', '56.101']);
  assert.equal(obligations.length, 1);
});

test('adapteren faller tilbake til organisasjonsform når BRREG har placeholder-koden 00.000', async () => {
  const requestedUrls: string[] = [];
  const adapter = new OppgaveregisteretAdapter({
    fetcher: async (input) => {
      requestedUrls.push(input);
      return jsonResponse({ start: 0, antall: 1, maxAntall: 160, skjema: [rawForm()] });
    },
  });

  const obligations = await adapter.listForOrganization({ ...organization, industryCodes: ['00.000'] });

  assert.equal(obligations.length, 1);
  assert.equal(new URL(requestedUrls[0]).searchParams.has('naeringskoder'), false);
});

test('adapteren lar arbeidsgiverfilteret stå åpent når datakilden mangler ansattinformasjon', async () => {
  let requestedUrl = '';
  const adapter = new OppgaveregisteretAdapter({
    fetcher: async (input) => {
      requestedUrl = input;
      return jsonResponse({ start: 0, antall: 1, maxAntall: 160, skjema: [rawForm()] });
    },
  });

  await adapter.listForOrganization({ ...organization, hasEmployees: undefined });

  assert.equal(new URL(requestedUrl).searchParams.has('ekskluderArbeidsgiver'), false);
});

test('adapteren mapper Oppgaveregisterets tidsfrister til årshjulet', async () => {
  const adapter = new OppgaveregisteretAdapter({
    fetcher: async () => jsonResponse({
      start: 0,
      antall: 1,
      maxAntall: 160,
      skjema: [rawForm({
        bruksomraader: [{ navn: 'Periodisk rapportering', tidsfrister: [{ date: '05', month: '09' }, { date: '05', month: '10' }] }],
      })],
    }),
  });

  const [obligation] = await adapter.listForOrganization(organization);
  const year = new Date().getFullYear();
  assert.deepEqual(obligation.deadlineDates, [`${year}-09-05`, `${year}-10-05`]);
  assert.equal(obligation.deadline, `${year}-09-05`);
});
