import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createYolkServer } from '../server.mjs';

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
    if (Array.isArray(value)) {
      assert.deepEqual(actual[key], value);
    } else
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      assertObjectSubset(actual[key], value);
    } else {
      assert.equal(actual[key], value);
    }
  }
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
  const instance = await createYolkServer({
    port: 0,
    baseDir: path.join(repoRoot, '.tmp-e2e-runtime'),
    sampleMediaDir: path.join(repoRoot, 'sample media')
  });
  const baseUrl = instance.url;
  try {
    await waitForServer(baseUrl);
  } catch (error) {
    await instance.close();
    throw error;
  }
  return {
    baseUrl,
    stop: async () => instance.close()
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
    identityDisplayName: document.querySelector('.identity-chip h3')?.textContent?.trim() || '',
    identityUsername: document.querySelector('.identity-chip p')?.textContent?.trim() || '',
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
      const username = document.querySelector('.identity-chip p')?.textContent?.trim() || '';
      return username.startsWith('@') && !document.querySelector('#onboarding-form');
    }, null, { timeout: 10000 });
  } catch (error) {
    const debug = await readDebugState(page);
    throw new Error(`Account creation did not complete.\n${JSON.stringify(debug, null, 2)}`, { cause: error });
  }
}

function simpleCard(page, username) {
  return page.locator('.simple-item').filter({ hasText: `@${username}` }).first();
}

function shelfCard(page, title) {
  return page.locator('[data-media-strip="true"] .collection-item-card').filter({ hasText: title }).first();
}

function profileMediaCard(page, title) {
  return page.locator(`.post-child-card[data-media-title="${title}"]`).first();
}

function feedPostCard(page, title) {
  return page.locator(`.activity-card.feed-post-card[data-feed-title="${title}"]`).first();
}

async function runAction(page, action, memory) {
  if (action.type === 'createAccount') {
    await fillAccountForm(page, action);
    return;
  }
  if (action.type === 'gotoSection') {
    await page.locator(`[data-nav="${action.section}"]`).click();
    await expectActiveSection(page, action.section);
    await page.waitForTimeout(500);
    return;
  }
  if (action.type === 'openCompose') {
    await page.locator('button[data-open-media-modal]').click();
    await page.locator('#upload-form').waitFor();
    return;
  }
  if (action.type === 'openFolderComposer') {
    await page.locator('button[data-open-folder-modal]').click();
    await page.locator('#collection-form').waitFor();
    return;
  }
  if (action.type === 'openSuggested') {
    const card = simpleCard(page, action.username);
    await card.locator('button[data-open-profile]').click();
    await expectActiveSection(page, 'profile');
    await page.waitForTimeout(500);
    return;
  }
  if (action.type === 'followSuggested') {
    const card = simpleCard(page, action.username);
    await card.locator('button[data-follow-account]').click();
    await page.waitForTimeout(1000);
    return;
  }
  if (action.type === 'keepProfileMedia') {
    const card = profileMediaCard(page, action.title);
    await card.locator('button[data-keep-media]').click();
    await page.waitForTimeout(1000);
    const close = page.locator('button[data-close-collection]');
    if (await close.count()) {
      await close.click();
      await page.waitForTimeout(300);
    }
    return;
  }
  if (action.type === 'likeFeedPost') {
    const card = feedPostCard(page, action.title);
    await card.locator('button[data-keep-collection]').click();
    await page.waitForTimeout(1200);
    return;
  }
  if (action.type === 'openFeedPost') {
    const card = feedPostCard(page, action.title);
    await card.click();
    await page.locator('.overlay-panel').waitFor();
    await page.waitForTimeout(500);
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
    await page.locator('#upload-form button[type="submit"]').click();
    await page.waitForTimeout(1200);
    return;
  }
  if (action.type === 'addShelfMedia') {
    const card = shelfCard(page, action.title);
    await card.locator('button[data-add-draft-child]').click();
    await page.locator('[data-selected-strip="true"]').filter({ hasText: action.title }).waitFor();
    return;
  }
  if (action.type === 'publishCollection') {
    await page.locator('#collection-title').fill(action.title);
    await page.locator('#collection-type').selectOption(action.collectionType);
    await page.locator('#collection-description').fill(action.description);
    await page.locator('#collection-form button[type="submit"]').click();
    await page.waitForTimeout(1200);
    await page.waitForTimeout(1000);
    return;
  }
  throw new Error(`Unknown action type: ${action.type}`);
}

async function expectActiveSection(page, section) {
  const labelMap = {
    discover: 'Discover',
    library: 'Library',
    profile: 'Profile'
  };
  await page.locator('.nav-button.is-active strong').filter({ hasText: labelMap[section] }).waitFor();
}

async function collectSnapshot(page) {
  return page.evaluate(() => {
    const text = selector => document.querySelector(selector)?.textContent?.trim() || '';
    const textFrom = node => node?.textContent?.trim() || '';
    const profileHero = document.querySelector('.profile-hero');
    const profile = profileHero
      ? {
          username: textFrom(profileHero.querySelector('.profile-handle')).replace(/^@/, ''),
          displayName: textFrom(profileHero.querySelector('h3')),
          posts: Array.from(document.querySelectorAll('.post-card')).map(node => ({
            title: textFrom(node.querySelector('h4')),
            mode: Array.from(node.querySelectorAll('.post-card-head .pill-ghost')).map(textFrom)[0] || '',
            childTitles: Array.from(node.querySelectorAll('.post-child-card h5')).map(textFrom),
            childCreators: Array.from(node.querySelectorAll('.post-child-card .profile-link')).map(textFrom).map(value => value.replace(/^@/, '')).join(', ')
          }))
        }
      : null;
    return {
      activeSection: text('.nav-button.is-active strong'),
      currentIdentity: {
        displayName: text('.identity-chip h3'),
        username: text('.identity-chip p').replace(/^@/, '')
      },
      flashText: text('.flash'),
      libraryTitles: Array.from(document.querySelectorAll('.library-collection-card h4, .library-tile h4, .saved-grid .media-card h4')).map(node => textFrom(node)),
      feed: Array.from(document.querySelectorAll('.activity-card')).map(card => {
        return {
          actorUsername: textFrom(card.querySelector('.feed-post-head .profile-link, .profile-link')).replace(/^@/, ''),
          subjectTitle: card.getAttribute('data-feed-title') || textFrom(card.querySelector('.post-card h4, h4')),
          summary: textFrom(card.querySelector('.post-card p, p'))
        };
      }),
      profile
      ,
      overlayTitle: text('.overlay-panel .subsection-title')
    };
  });
}

function verifyScenarioSnapshot(actual, expected, scenarioId) {
  if (expected.activeSection) assert.equal(actual.activeSection, expected.activeSection, `${scenarioId}: activeSection`);
  if (expected.currentIdentity) assertObjectSubset(actual.currentIdentity, expected.currentIdentity);
  if (expected.overlayTitle) assert.equal(actual.overlayTitle, expected.overlayTitle, `${scenarioId}: overlayTitle`);
  if (expected.profile) {
    assert.ok(actual.profile, `${scenarioId}: expected profile snapshot`);
    const { posts, ...profileRest } = expected.profile;
    assertObjectSubset(actual.profile, profileRest);
    if (Array.isArray(posts)) {
      posts.forEach(expectedPost => {
        const actualPost = actual.profile.posts.find(item => item.title === expectedPost.title);
        assert.ok(actualPost, `${scenarioId}: missing post ${expectedPost.title}`);
        if (Array.isArray(expectedPost.childTitles)) {
          assert.deepEqual(actualPost.childTitles, expectedPost.childTitles, `${scenarioId}: childTitles for ${expectedPost.title} were ${JSON.stringify(actualPost.childTitles)}`);
        }
        if (typeof expectedPost.childCreators === 'string') {
          assert.equal(actualPost.childCreators, expectedPost.childCreators, `${scenarioId}: childCreators for ${expectedPost.title} were ${JSON.stringify(actualPost.childCreators)}`);
        }
        const { childTitles, childCreators, ...postRest } = expectedPost;
        assertObjectSubset(actualPost, postRest);
      });
    }
  }
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
