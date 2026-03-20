import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createAppController,
  createMemoryStorage,
  resolveVerifiedProfile,
  runScenarioFixture,
  stableStringify
} from '../dist/app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sanityInputPath = path.join(__dirname, 'sanity', 'yolk_sanity_input.json');
const sanityExpectedPath = path.join(__dirname, 'sanity', 'yolk_sanity_expected.json');

function createClock(startIso = '2026-01-01T00:00:00.000Z') {
  let current = new Date(startIso).getTime();
  return () => {
    const value = new Date(current).toISOString();
    current += 60_000;
    return value;
  };
}

function assertSubset(actual, expected) {
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), 'expected an array');
    expected.forEach((entry, index) => {
      assertSubset(actual[index], entry);
    });
    return;
  }
  if (expected && typeof expected === 'object') {
    assert.ok(actual && typeof actual === 'object', 'expected an object');
    for (const [key, value] of Object.entries(expected)) {
      assertSubset(actual[key], value);
    }
    return;
  }
  assert.equal(actual, expected);
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
  assert.equal(snapshot.feed[0].kind, 'keep');
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

test('sanity fixtures match curated expectations', async () => {
  const input = JSON.parse(fs.readFileSync(sanityInputPath, 'utf8'));
  const expected = JSON.parse(fs.readFileSync(sanityExpectedPath, 'utf8'));
  const expectedMap = new Map(expected.cases.map(entry => [entry.id, entry]));
  for (const scenario of input.cases) {
    const snapshot = await runScenarioFixture(scenario);
    const curated = expectedMap.get(scenario.id);
    assert.ok(curated, `missing expected snapshot for ${scenario.id}`);
    assert.equal(curated.id, scenario.id);
    const { id, feedIncludes, ...expectedSubset } = curated;
    assertSubset(snapshot, expectedSubset);
    if (Array.isArray(feedIncludes)) {
      feedIncludes.forEach(expectedEntry => {
        assert.ok(
          snapshot.feed.some(actualEntry => {
            try {
              assertSubset(actualEntry, expectedEntry);
              return true;
            } catch {
              return false;
            }
          }),
          `missing matching feed entry for ${scenario.id}: ${JSON.stringify(expectedEntry)}`
        );
      });
    }
  }
});
