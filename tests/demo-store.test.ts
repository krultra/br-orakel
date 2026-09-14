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
    });
    assert.equal(store.preferences(user.id, '999999999')[0]?.obligationId, 'obl-ny-ansatt');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
