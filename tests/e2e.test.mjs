import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, '..');
const sanityInputPath = path.join(__dirname, 'sanity', 'yolk_sanity_input.json');
const sanityExpectedPath = path.join(__dirname, 'sanity', 'yolk_sanity_expected.json');
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function assertObjectSubset(actual, expected) {
  assert.ok(actual && typeof actual === 'object', 'expected object');
  for (const [key, value] of Object.entries(expected)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      assertObjectSubset(actual[key], value);
    } else {
      assert.equal(actual[key], value);
    }
  }
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(error => {
        if (error) reject(error);
        else resolve(port);
      });
    });
  });
}

async function waitForServer(url, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await delay(150);
  }
  throw new Error(`Server did not respond at ${url} within ${timeoutMs}ms`);
}

async function startServer() {
  const port = await getFreePort();
  const proc = spawn('node', ['server.mjs'], {
    cwd: repoRoot,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let logs = '';
  proc.stdout.on('data', chunk => {
    logs += chunk.toString();
  });
  proc.stderr.on('data', chunk => {
    logs += chunk.toString();
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await waitForServer(baseUrl);
  } catch (error) {
    proc.kill();
    throw new Error(`${error.message}\n${logs}`);
  }
  return {
    baseUrl,
    stop: async () => {
      if (proc.killed) return;
      proc.kill();
      await delay(150);
    }
  };
}

async function createBrowser() {
  if (!fs.existsSync(edgePath)) {
    throw new Error(`Expected Edge at ${edgePath}`);
  }
  return chromium.launch({
    executablePath: edgePath,
    headless: true
  });
}

async function readDebugState(page) {
  return page.evaluate(() => ({
    bodyText: document.body.textContent?.replace(/\s+/g, ' ').trim().slice(0, 2000) || '',
    flashText: document.querySelector('.flash')?.textContent?.trim() || '',
    activeSection: document.querySelector('.nav-button.is-active strong')?.textContent?.trim() || '',
    identityAccountId: document.querySelector('.identity-chip .account-id')?.textContent?.trim() || '',
    onboardingVisible: Boolean(document.querySelector('#onboarding-form')),
    onboardingValidity: (() => {
      const form = document.querySelector('#onboarding-form');
      return form instanceof HTMLFormElement ? form.checkValidity() : null;
    })(),
    onboardingValues: (() => {
      const username = document.querySelector('#onboarding-username');
      const displayName = document.querySelector('#onboarding-display-name');
      const bio = document.querySelector('#onboarding-bio');
      return {
        username: username instanceof HTMLInputElement ? username.value : null,
        displayName: displayName instanceof HTMLInputElement ? displayName.value : null,
        bio: bio instanceof HTMLTextAreaElement ? bio.value : null
      };
    })(),
    observedEvents: Array.isArray(window.__yolkObservedEvents) ? window.__yolkObservedEvents : [],
    storageCheck: (() => {
      try {
        window.localStorage.setItem('__yolk_debug__', 'ok');
        const value = window.localStorage.getItem('__yolk_debug__');
        window.localStorage.removeItem('__yolk_debug__');
        return value;
      } catch (error) {
        return `storage-error:${String(error)}`;
      }
    })()
  }));
}

async function fillAccountForm(page, action) {
  await page.locator('#onboarding-username').fill(action.username);
  await page.locator('#onboarding-display-name').fill(action.displayName);
  await page.locator('#onboarding-bio').fill(action.bio);
  await page.locator('#onboarding-form').getByRole('button', { name: 'Create account' }).click();
  try {
    await page.waitForFunction(() => {
      const accountId = document.querySelector('.identity-chip .account-id')?.textContent?.trim() || '';
      return accountId.startsWith('acct_') && !document.querySelector('#onboarding-form');
    }, null, { timeout: 10000 });
  } catch (error) {
    const debug = await readDebugState(page);
    throw new Error(`Account creation did not complete.\n${JSON.stringify(debug, null, 2)}`, { cause: error });
  }
}

function searchCard(page, username) {
  return page.locator('.search-card').filter({ hasText: `@${username}` }).first();
}

function simpleCard(page, username) {
  return page.locator('.simple-item').filter({ hasText: `@${username}` }).first();
}

function mediaCard(page, title) {
  return page.locator('.media-card').filter({ hasText: title }).first();
}

function shelfCard(page, title) {
  return page.locator('.collection-shelf .collection-item-card').filter({ hasText: title }).first();
}

async function runAction(page, action, memory) {
  if (action.type === 'createAccount') {
    await fillAccountForm(page, action);
    return;
  }
  if (action.type === 'gotoSection') {
    await page.locator(`[data-nav="${action.section}"]`).click();
    await expectActiveSection(page, action.section);
    return;
  }
  if (action.type === 'search') {
    await page.locator('#search-query').fill(action.query);
    await page.locator('#lookup-account-id').fill('');
    await page.locator('#search-form').getByRole('button', { name: 'Resolve discovery' }).click();
    await delay(150);
    return;
  }
  if (action.type === 'saveSearchResultAccountId') {
    const card = searchCard(page, action.username);
    await card.waitFor();
    memory[action.as] = (await card.locator('p').textContent())?.trim() || '';
    return;
  }
  if (action.type === 'openLookupAccountId') {
    await page.locator('#lookup-account-id').fill(memory[action.from] || '');
    await page.locator('#search-query').fill('');
    await page.locator('#search-form').getByRole('button', { name: 'Resolve discovery' }).click();
    await expectActiveSection(page, 'profile');
    return;
  }
  if (action.type === 'openSearchResult') {
    const card = searchCard(page, action.username);
    await card.locator('button[data-open-profile]').click();
    await expectActiveSection(page, 'profile');
    return;
  }
  if (action.type === 'followSearchResult') {
    const card = searchCard(page, action.username);
    await card.locator('button[data-follow-account]').click();
    await delay(150);
    return;
  }
  if (action.type === 'openSuggested') {
    const card = simpleCard(page, action.username);
    await card.locator('button[data-open-profile]').click();
    await expectActiveSection(page, 'profile');
    return;
  }
  if (action.type === 'followSuggested') {
    const card = simpleCard(page, action.username);
    await card.locator('button[data-follow-account]').click();
    await delay(150);
    return;
  }
  if (action.type === 'keepProfileMedia') {
    const card = mediaCard(page, action.title);
    await card.locator('button[data-keep-media]').click();
    await expectActiveSection(page, 'library');
    return;
  }
  if (action.type === 'uploadTextMedia') {
    await page.locator('#upload-title').fill(action.title);
    await page.locator('#upload-description').fill(action.description);
    await page.locator('#upload-type').selectOption('text');
    await page.locator('#upload-file').setInputFiles({
      name: action.fileName,
      mimeType: 'text/plain',
      buffer: Buffer.from(action.content, 'utf8')
    });
    await page.locator('#upload-form').getByRole('button', { name: 'Publish media object' }).click();
    await expectActiveSection(page, 'profile');
    return;
  }
  if (action.type === 'addShelfMedia') {
    const card = shelfCard(page, action.title);
    await card.locator('button[data-add-draft-child]').click();
    await delay(120);
    return;
  }
  if (action.type === 'publishCollection') {
    await page.locator('#collection-title').fill(action.title);
    await page.locator('#collection-type').selectOption(action.collectionType);
    await page.locator('#collection-curated').selectOption(action.isCurated ? 'true' : 'false');
    await page.locator('#collection-description').fill(action.description);
    await page.locator('#collection-form').getByRole('button', { name: 'Publish collection' }).click();
    await expectActiveSection(page, 'profile');
    return;
  }
  throw new Error(`Unknown action type: ${action.type}`);
}

async function expectActiveSection(page, section) {
  const labelMap = {
    home: 'Home / Feed',
    discover: 'Discover',
    library: 'Library',
    profile: 'Profile',
    upload: 'Upload / Create',
    collections: 'Collection Editor'
  };
  await page.locator('.nav-button.is-active strong').filter({ hasText: labelMap[section] }).waitFor();
}

async function collectSnapshot(page) {
  return page.evaluate(() => {
    const text = selector => document.querySelector(selector)?.textContent?.trim() || '';
    const textFrom = node => node?.textContent?.trim() || '';
    const stats = {};
    document.querySelectorAll('.stat-card').forEach(card => {
      const key = card.querySelector('strong')?.textContent?.trim().toLowerCase() || '';
      const value = card.querySelector('span')?.textContent?.trim() || '';
      if (key.includes('accounts')) stats.accounts = value;
      if (key.includes('media')) stats.media = value;
      if (key.includes('collections')) stats.collections = value;
      if (key.includes('keeps')) stats.keeps = value;
      if (key.includes('follows')) stats.follows = value;
    });
    const profileHero = document.querySelector('.profile-hero');
    const profile = profileHero
      ? {
          username: textFrom(profileHero.querySelector('.pill-ghost')).replace(/^@/, ''),
          displayName: textFrom(profileHero.querySelector('h3')),
          verifiedStatus: textFrom(profileHero.querySelector('.pill')),
          accountId: textFrom(profileHero.querySelector('.account-id')),
          uploadTitles: Array.from(document.querySelectorAll('.panel-grid .sheet:first-child .media-card h4')).map(node => textFrom(node)),
          collections: Array.from(document.querySelectorAll('.panel-grid .sheet:last-child .simple-item')).map(node => ({
            title: textFrom(node.querySelector('h4')),
            mode: textFrom(node.querySelectorAll('.pill-ghost')[0]),
            childCreators: textFrom(Array.from(node.querySelectorAll('.mini-caption')).find(el => el.textContent?.includes('Child creators'))).replace(/^Child creators:\s*/, ''),
            creator: textFrom(Array.from(node.querySelectorAll('.mini-caption')).find(el => el.textContent?.includes('Collection creator'))).replace(/^Collection creator:\s*@/, '')
          }))
        }
      : null;
    return {
      activeSection: text('.nav-button.is-active strong'),
      currentIdentity: {
        displayName: text('.identity-chip h3'),
        username: text('.identity-chip p').replace(/^@/, ''),
        accountId: text('.identity-chip .account-id')
      },
      flashText: text('.flash'),
      trust: {
        selectedAccount: text('.trust-item:nth-of-type(1) p'),
        dhtHead: text('.trust-item:nth-of-type(2) p'),
        headSeq: text('.trust-item:nth-of-type(3) p'),
        verificationStatus: text('.trust-item:nth-of-type(4) p')
      },
      stats,
      searchResults: Array.from(document.querySelectorAll('.search-card')).map(card => ({
        username: textFrom(card.querySelector('.pill-ghost')).replace(/^@/, ''),
        displayName: textFrom(card.querySelector('h4')),
        accountId: textFrom(card.querySelector('p'))
      })),
      libraryTitles: Array.from(document.querySelectorAll('.media-grid .media-card h4')).map(node => textFrom(node)),
      feed: Array.from(document.querySelectorAll('.activity-card')).map(card => {
        const badges = Array.from(card.querySelectorAll('.pill-ghost')).map(textFrom);
        return {
          kind: textFrom(card.querySelector('.pill')),
          actorUsername: badges[0] || '',
          actorAccountId: badges[1] || '',
          subjectTitle: textFrom(card.querySelector('h4')),
          summary: textFrom(card.querySelector('p'))
        };
      }),
      profile
    };
  });
}

function verifyScenarioSnapshot(actual, expected, scenarioId) {
  if (expected.activeSection) assert.equal(actual.activeSection, expected.activeSection, `${scenarioId}: activeSection`);
  if (expected.currentIdentity) assertObjectSubset(actual.currentIdentity, expected.currentIdentity);
  if (expected.profile) {
    assert.ok(actual.profile, `${scenarioId}: expected profile snapshot`);
    const { uploadTitles, collections, ...profileRest } = expected.profile;
    assertObjectSubset(actual.profile, profileRest);
    if (Array.isArray(uploadTitles)) {
      uploadTitles.forEach(title => {
        assert.ok(actual.profile.uploadTitles.includes(title), `${scenarioId}: missing upload title ${title}`);
      });
    }
    if (Array.isArray(collections)) {
      collections.forEach(expectedCollection => {
        const actualCollection = actual.profile.collections.find(item => item.title === expectedCollection.title);
        assert.ok(actualCollection, `${scenarioId}: missing collection ${expectedCollection.title}`);
        assertObjectSubset(actualCollection, expectedCollection);
      });
    }
  }
  if (expected.trust) assertObjectSubset(actual.trust, expected.trust);
  if (expected.stats) assertObjectSubset(actual.stats, expected.stats);
  if (Array.isArray(expected.libraryTitles)) {
    expected.libraryTitles.forEach(title => {
      assert.ok(actual.libraryTitles.includes(title), `${scenarioId}: missing library title ${title}`);
    });
  }
  if (Array.isArray(expected.feedIncludes)) {
    expected.feedIncludes.forEach(expectedFeed => {
      assert.ok(
        actual.feed.some(feedItem => {
          try {
            assertObjectSubset(feedItem, expectedFeed);
            return true;
          } catch {
            return false;
          }
        }),
        `${scenarioId}: missing feed entry ${JSON.stringify(expectedFeed)}`
      );
    });
  }
  if (Array.isArray(expected.flashTextIncludes)) {
    expected.flashTextIncludes.forEach(text => {
      assert.ok(actual.flashText.includes(text), `${scenarioId}: missing flash text ${text}`);
    });
  }
}

test('browser sanity fixtures drive the real DOM against the running backend', async () => {
  const input = JSON.parse(fs.readFileSync(sanityInputPath, 'utf8'));
  const expected = JSON.parse(fs.readFileSync(sanityExpectedPath, 'utf8'));
  const expectedMap = new Map(expected.cases.map(entry => [entry.id, entry]));
  const server = await startServer();
  const browser = await createBrowser();
  try {
    for (const scenario of input.cases) {
      const context = await browser.newContext({
        viewport: { width: 1600, height: 1200 }
      });
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', error => {
        pageErrors.push(error.stack || error.message);
      });
      page.on('console', message => {
        if (message.type() === 'error') pageErrors.push(`console:${message.text()}`);
      });
      const memory = {};
      await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
      await page.locator('#app').waitFor();
      await page.evaluate(() => {
        window.__yolkObservedEvents = [];
        document.addEventListener('click', event => {
          const target = event.target;
          if (!(target instanceof Element)) return;
          const button = target.closest('button');
          if (!button) return;
          window.__yolkObservedEvents.push({
            type: 'click',
            buttonText: button.textContent?.trim() || '',
            formId: button.closest('form')?.id || null
          });
        }, true);
        document.addEventListener('submit', event => {
          const target = event.target;
          window.__yolkObservedEvents.push({
            type: 'submit',
            formId: target instanceof HTMLFormElement ? target.id : null
          });
        }, true);
      });
      let currentAction = null;
      try {
        for (const action of scenario.actions) {
          currentAction = action;
          await runAction(page, action, memory);
        }
      } catch (error) {
        const debug = await readDebugState(page);
        throw new Error(
          `${scenario.id}: action failure\n${JSON.stringify({ action: currentAction, error: error?.message || String(error), actionErrors: pageErrors, debug }, null, 2)}`,
          { cause: error }
        );
      }
      const snapshot = await collectSnapshot(page);
      const curated = expectedMap.get(scenario.id);
      assert.ok(curated, `missing expected snapshot for ${scenario.id}`);
      verifyScenarioSnapshot(snapshot, curated, scenario.id);
      await context.close();
    }
  } finally {
    await browser.close();
    await server.stop();
  }
});
