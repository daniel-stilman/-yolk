import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createAppController,
  createMemoryStorage,
  resolveVerifiedProfile,
  stableStringify
} from '../dist/app.js';

function createClock(startIso = '2026-01-01T00:00:00.000Z') {
  let current = new Date(startIso).getTime();
  return () => {
    const value = new Date(current).toISOString();
    current += 60_000;
    return value;
  };
}

test('stableStringify sorts object keys deterministically', () => {
  const left = stableStringify({ z: 1, a: { y: 2, b: 3 } });
  const right = stableStringify({ a: { b: 3, y: 2 }, z: 1 });
  assert.equal(left, right);
});

test('profile resolution uses the account head and verifies the signed profile', async () => {
  const controller = createAppController(createMemoryStorage(), { now: createClock() });
  await controller.initialize();
  const demoAccountId = controller.findAccountIdByAlias('demo:sol');
  assert.ok(demoAccountId, 'expected seeded demo account');
  const state = controller.getState();
  const resolved = await resolveVerifiedProfile(state.network, demoAccountId);
  assert.ok(resolved, 'expected a resolved profile');
  assert.equal(resolved.profile.username, 'sol');
  assert.equal(resolved.verified, true);
});

test('keep action produces a kept library entry', async () => {
  const controller = createAppController(createMemoryStorage(), { now: createClock() });
  await controller.initialize();
  await controller.createAccount({
    username: 'alice',
    displayName: 'Alice Atlas',
    bio: 'Collector'
  });
  const mediaId = controller.resolveMediaRefToken('media:sol:1');
  assert.ok(mediaId, 'expected seeded demo media');
  await controller.keepMedia(mediaId);
  const snapshot = await controller.buildSnapshot();
  assert.equal(snapshot.library.keptCount, 1);
  assert.equal(snapshot.library.keptTitles[0], 'Amber Lines');
  assert.ok(snapshot.feed.every(item => item.kind === 'post'));
});

test('curated collections preserve original media authorship', async () => {
  const controller = createAppController(createMemoryStorage(), { now: createClock() });
  await controller.initialize();
  await controller.createAccount({
    username: 'alice',
    displayName: 'Alice Atlas',
    bio: 'Collector'
  });
  await controller.createCollection({
    title: 'Signal Stack',
    type: 'curated',
    description: 'Cross-account set',
    isCurated: true,
    childIds: [controller.resolveMediaRefToken('media:sol:1'), controller.resolveMediaRefToken('media:noor:0')].filter(Boolean)
  });
  const snapshot = await controller.buildSnapshot();
  assert.equal(snapshot.selectedProfile.collections[0].title, 'Signal Stack');
  assert.equal(snapshot.selectedProfile.collections[0].isCurated, true);
  assert.deepEqual(snapshot.selectedProfile.collections[0].childCreatorUsernames, ['sol', 'noor']);
});
