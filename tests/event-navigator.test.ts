import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEventGuides, obligationsForEvent, organizationEventContext } from '../src/data/event-navigator.js';
import type { Obligation, Organization } from '../src/domain/types.js';

const organization: Organization = {
  orgNumber: '999999999', name: 'Fjordgløtt Mat og Handel AS', organizationForm: 'AS',
  organizationFormName: 'Aksjeselskap', industryCodes: ['47.110'], hasEmployees: true,
  employeeCount: 8, registeredInMvaRegister: true, registeredInForetaksregister: true,
  municipality: 'Trondheim', sources: [],
};

const obligations: Obligation[] = [
  {
    id: 'new', name: 'Melding ved ny arbeidstaker', description: 'Oppdater arbeidsforhold ved ansettelse.',
    officialStatus: 'OFFICIAL', responsibleAgency: 'Skatteetaten', legalBasis: 'A-opplysningsloven',
    targetCriteria: ['arbeidsgiveransvar'], frequency: 'Ved hendelse', estimatedMinutes: 10,
    requiredData: [], attachments: [], sourceLinks: [], status: 'not_started', trigger: 'event', eventLabel: 'Ny arbeidstaker',
  },
  {
    id: 'unknown', name: 'Melding om særskilt hendelse', description: 'Katalogoppgave.',
    officialStatus: 'OFFICIAL', responsibleAgency: 'Brønnøysundregistrene', legalBasis: 'Ikke angitt',
    targetCriteria: [], frequency: 'Ved hendelse', estimatedMinutes: 10,
    requiredData: [], attachments: [], sourceLinks: [], status: 'not_started', trigger: 'event', eventLabel: 'Flytting av produksjon',
  },
];

test('bygger forhåndsdefinerte og dynamiske hendelser fra katalogen', () => {
  const guides = buildEventGuides(obligations);
  assert.ok(guides.some((guide) => guide.id === 'new-employee' && guide.isPredefined));
  assert.ok(guides.some((guide) => guide.label === 'Flytting av produksjon' && !guide.isPredefined));
  assert.equal(buildEventGuides([...obligations, { ...obligations[0], id: 'placeholder', eventLabel: '(beskrives)' }]).some((guide) => guide.label === '(beskrives)'), false);
});

test('finner relevante oppgaver på hendelsesetikett og beskrivelsestekst', () => {
  const guide = buildEventGuides(obligations).find((item) => item.id === 'new-employee');
  assert.ok(guide);
  assert.deepEqual(obligationsForEvent(guide, obligations).map((item) => item.id), ['new']);
});

test('bygger en tydelig virksomhetskontekst for hendelsesveiledningen', () => {
  const context = organizationEventContext(organization);
  assert.match(context, /8 registrerte ansatte/);
  assert.match(context, /registrert i Merverdiavgiftsregisteret/);
  assert.match(context, /47\.110/);
});
