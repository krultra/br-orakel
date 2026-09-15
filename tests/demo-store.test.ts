import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DemoStore } from '../server/demo-store.js';

test('DemoStore oppretter bruker, virksomhetsfavoritt og personlig oppgavepreferanse', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'br-orakel-store-'));
  try {
    const store = new DemoStore(path.join(directory, 'demo-store.json'));
    await store.init();
    const user = await store.createUser({ username: 'kari', displayName: 'Kari', password: 'hemmelig' });

    assert.equal(store.authenticate('kari', 'hemmelig')?.id, user.id);
    assert.equal(store.authenticate('kari', 'feil'), null);
    const updatedUser = await store.addOrganization(user.id, '999999999');
    assert.deepEqual(updatedUser?.organizationNumbers, ['999999999']);

    await store.savePreference(user.id, {
      userId: user.id,
      orgNumber: '999999999',
      obligationId: 'obl-ny-ansatt',
      activated: true,
      recurrence: { frequency: 'monthly', interval: 1, dayOfMonth: 5, startDate: '2026-09-01' },
      deadlineOverride: '2026-09-12',
      comment: 'Følg opp med regnskapsfører.',
    });
    assert.equal(store.preferences(user.id, '999999999')[0]?.obligationId, 'obl-ny-ansatt');
    assert.equal(store.preferences(user.id, '999999999')[0]?.deadlineOverride, '2026-09-12');
    assert.equal(store.preferences(user.id, '999999999')[0]?.comment, 'Følg opp med regnskapsfører.');

    const profile = await store.saveOrganizationProfile(user.id, '999999999', [{ id: 'input-1', label: 'Regnskapssystem', value: 'Tripletex', status: 'USER_INPUT', updatedAt: '2026-09-15T10:00:00.000Z' }]);
    assert.equal(profile.inputs[0]?.value, 'Tripletex');
    assert.equal(store.organizationProfile(user.id, '999999999').inputs[0]?.status, 'USER_INPUT');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('DemoStore seed-er to saksbehandlerbrukere', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'br-orakel-caseworkers-'));
  try {
    const storePath = path.join(directory, 'demo-store.json');
    const store = new DemoStore(storePath);
    await store.init();

    assert.equal(store.authenticate('br-saksbehandler', 'demo')?.role, 'caseworker');
    assert.equal(store.authenticate('br-kvalitet', 'demo')?.role, 'caseworker');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('DemoStore kan aktivere alle dempede oppgaver for én virksomhet', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'br-orakel-bulk-'));
  try {
    const store = new DemoStore(path.join(directory, 'demo-store.json'));
    await store.init();
    const user = await store.createUser({ username: `bulk-${Date.now()}`, displayName: 'Bulkbruker', password: 'demo' });
    await store.savePreference(user.id, { userId: user.id, orgNumber: '999999999', obligationId: 'muted-1', activated: true, muted: true, mutedBefore: '2026-07-01' });
    await store.savePreference(user.id, { userId: user.id, orgNumber: '888888888', obligationId: 'other-org', activated: true, muted: true });
    await store.saveOrganizationViewPreference(user.id, { userId: user.id, orgNumber: '999999999', mutedBefore: '2026-07-01' });

    assert.equal(await store.activateAllMuted(user.id, '999999999'), 2);
    assert.equal(store.preferences(user.id, '999999999')[0]?.muted, false);
    assert.equal(store.preferences(user.id, '999999999')[0]?.mutedBefore, undefined);
    assert.equal(store.preferences(user.id, '888888888')[0]?.muted, true);
    assert.equal(store.organizationViewPreference(user.id, '999999999')?.mutedBefore, undefined);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('DemoStore isolerer loshistorikk per bruker og virksomhet', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'br-orakel-chat-history-'));
  try {
    const store = new DemoStore(path.join(directory, 'demo-store.json'));
    await store.init();
    const user = await store.createUser({ username: `history-${Date.now()}`, displayName: 'Historikkbruker', password: 'demo' });
    const exchange = await store.saveChatExchange({
      userId: user.id,
      orgNumber: '999999999',
      question: 'Hva gjelder for oss?',
      answer: 'Dette er et veiledende svar.',
      uncertainty: 'Kontroller gjeldende kilde.',
      sourceIds: ['source-1'],
      sources: [{ id: 'source-1', title: 'Kilde', url: 'https://example.com', officiality: 'OFFICIAL_GUIDANCE', retrievedAt: '2026-09-15T10:00:00.000Z', relevantExcerpt: 'Utdrag' }],
      followUpQuestions: ['Har dere ansatte?'],
      createdAt: '2026-09-15T10:00:00.000Z',
    });
    assert.equal(store.chatExchanges(user.id, '999999999', 'gjeld').length, 1);
    assert.equal(store.chatExchanges(user.id, '888888888').length, 0);
    assert.equal((await store.updateChatFeedback(user.id, exchange.id, 'useful'))?.feedback, 'useful');
    assert.equal(await store.deleteChatExchange(user.id, exchange.id), true);
    assert.equal(store.chatExchanges(user.id, '999999999').length, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('DemoStore foreslår anonymisert FAQ-bidrag og gir hendelsesbaserte poeng', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'br-orakel-contributions-'));
  try {
    const store = new DemoStore(path.join(directory, 'demo-store.json'));
    await store.init();
    const user = await store.createUser({ username: `points-${Date.now()}`, displayName: 'Poengbruker', password: 'demo' });
    const exchange = await store.saveChatExchange({
      userId: user.id,
      orgNumber: '999999999',
      question: 'Hva gjelder?',
      answer: 'Et veiledende svar.',
      uncertainty: 'Kontroller kilden.',
      sourceIds: [],
      sources: [],
      followUpQuestions: [],
      createdAt: new Date().toISOString(),
    });
    const useful = await store.updateChatFeedback(user.id, exchange.id, 'useful');
    assert.equal(useful?.share?.status, 'proposed');
    assert.equal(store.contributionSummary(user.id).points, 1);
    const shared = await store.updateChatShare(user.id, exchange.id, { status: 'consented', redactedQuestion: 'Hva gjelder?', redactedAnswer: 'Et veiledende svar.' });
    assert.equal(shared?.share?.status, 'consented');
    assert.equal(store.contributionSummary(user.id).points, 6);
    await store.updateChatShare(user.id, exchange.id, { status: 'consented', redactedQuestion: 'Hva gjelder?', redactedAnswer: 'Et veiledende svar.' });
    assert.equal(store.contributionSummary(user.id).points, 6);
    const feedback = await store.saveProductFeedback(user.id, 'Gjør oppgavefiltreringen enda enklere.');
    assert.equal(feedback.message, 'Gjør oppgavefiltreringen enda enklere.');
    assert.equal(store.contributionSummary(user.id).points, 8);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
