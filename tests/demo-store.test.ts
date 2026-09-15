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
