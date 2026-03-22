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
    sampleMediaDir: path.join(repoRoot, 'sample media'),
    seedDemo: true
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
  return page.locator(`.overlay-panel .post-child-card[data-media-title="${title}"]`).first();
}

function feedPostCard(page, title) {
  return page.locator(`.activity-card.feed-post-card[data-feed-title="${title}"]`).first();
}

function libraryFolderTile(page, title) {
  return page.locator('.section-block--library .library-folder-tile').filter({ hasText: title }).first();
}

function libraryMediaTile(page, title) {
  return page.locator(`.section-block--library .library-media-tile[data-library-media-title="${title}"]`).first();
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
  if (action.type === 'searchDiscover') {
    await page.locator('button[data-toggle-search="true"]').click();
    await page.locator('#header-search-form').waitFor();
    await page.locator('#header-search-query').fill(action.query);
    await page.locator('#header-search-form button[type="submit"]').click();
    await page.locator('[data-search-results="true"]').waitFor();
    return;
  }
  if (action.type === 'openCompose' || action.type === 'openUploadComposer') {
    await page.locator('button[data-open-media-modal]').click();
    await page.locator('#upload-form').waitFor();
    return;
  }
  if (action.type === 'openFolderComposer') {
    await page.locator('button[data-open-folder-modal]').click();
    await page.locator('#collection-form').waitFor();
    return;
  }
  if (action.type === 'openLibraryFolder') {
    await libraryFolderTile(page, action.title).click();
    await page.waitForFunction(title => {
      const current = document.querySelector('.section-block--library .library-path-current');
      return (current?.textContent?.trim() || '') === title;
    }, action.title, { timeout: 10000 });
    return;
  }
  if (action.type === 'openSuggested') {
    const searchScope = page.locator('[data-search-results="true"]');
    const card = await searchScope.count()
      ? searchScope.locator('.simple-item').filter({ hasText: `@${action.username}` }).first()
      : simpleCard(page, action.username);
    await card.locator('button.button-secondary[data-open-profile]').click();
    await expectActiveSection(page, 'profile');
    await page.waitForTimeout(500);
    return;
  }
  if (action.type === 'followSuggested') {
    const searchScope = page.locator('[data-search-results="true"]');
    const card = await searchScope.count()
      ? searchScope.locator('.simple-item').filter({ hasText: `@${action.username}` }).first()
      : simpleCard(page, action.username);
    await card.locator('button[data-follow-account]').click();
    await page.waitForTimeout(1000);
    return;
  }
  if (action.type === 'keepProfileMedia') {
    const card = profileMediaCard(page, action.title);
    const button = card.locator('button[data-keep-media]');
    await button.scrollIntoViewIfNeeded();
    await button.evaluate(node => node.click());
    await page.waitForFunction(title => {
      const cardNode = document.querySelector(`.overlay-panel .post-child-card[data-media-title="${title}"]`);
      const pressed = cardNode?.querySelector('button[data-keep-media]')?.getAttribute('aria-pressed') === 'true';
      const flash = document.querySelector('.flash')?.textContent?.includes('Downloaded and seeding.');
      return Boolean(pressed || flash);
    }, action.title, { timeout: 15000 });
    const close = page.locator('button[data-close-collection]');
    if (await close.count()) {
      await close.click();
      await page.waitForTimeout(300);
    }
    return;
  }
  if (action.type === 'likeFeedPost' || action.type === 'downloadFeedPost') {
    const card = feedPostCard(page, action.title);
    await card.locator('button[data-keep-collection]').click();
    await card.locator('button[data-unkeep-collection]').waitFor();
    return;
  }
  if (action.type === 'unlikeLibraryPost' || action.type === 'removeDownloadedLibraryPost') {
    page.once('dialog', dialog => dialog.accept());
    await page.locator('.section-block--library .library-browser-head button[data-unkeep-collection]').click();
    await page.waitForFunction(title => {
      return !Array.from(document.querySelectorAll('.section-block--library .library-folder-tile h4'))
        .concat(Array.from(document.querySelectorAll('.section-block--library .library-media-tile h4')))
        .some(node => node.textContent?.trim() === title);
    }, action.title, { timeout: 10000 });
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
  if (action.type === 'publishStructuredUpload') {
    if (action.packageKind) {
      await page.locator('#upload-kind').selectOption(action.packageKind);
      if (action.packageKind === 'show') {
        await page.locator('#upload-series-title').waitFor();
        await page.locator('#upload-season-label').waitFor();
      } else if (action.packageKind === 'graphic_novel') {
        await page.locator('#upload-series-title').waitFor();
        await page.locator('#upload-title').waitFor();
      }
    }
    if (typeof action.description === 'string') {
      await page.locator('#upload-description').fill(action.description);
    }
    const maybeFill = async (selector, value) => {
      if (typeof value !== 'string') return;
      const field = page.locator(selector);
      if (await field.count()) await field.fill(value);
    };
    await maybeFill('#upload-title', action.title);
    await maybeFill('#upload-series-title', action.seriesTitle);
    await maybeFill('#upload-season-label', action.seasonLabel);
    await page.locator('#upload-files').setInputFiles(action.rows.map(row => ({
      name: row.fileName,
      mimeType: row.mimeType || 'text/plain',
      buffer: Buffer.from(row.content, 'utf8')
    })));
    await page.locator('.upload-draft-row').nth(action.rows.length - 1).waitFor();
    for (let index = 0; index < action.rows.length; index += 1) {
      if (!action.rows[index]?.title) continue;
      await page.locator('[data-upload-row-title]').nth(index).fill(action.rows[index].title);
    }
    if (action.reorder?.sourceTitle && action.reorder?.targetTitle) {
      const rowCount = await page.locator('.upload-draft-row').count();
      let sourceIndex = -1;
      let targetIndex = -1;
      for (let index = 0; index < rowCount; index += 1) {
        const value = await page.locator('[data-upload-row-title]').nth(index).inputValue();
        if (value === action.reorder.sourceTitle) sourceIndex = index;
        if (value === action.reorder.targetTitle) targetIndex = index;
      }
      if (sourceIndex < 0 || targetIndex < 0) throw new Error(`Unable to resolve upload reorder rows for ${action.reorder.sourceTitle} -> ${action.reorder.targetTitle}`);
      const source = page.locator('.upload-draft-row').nth(sourceIndex).locator('[data-upload-drag-row]').first();
      const target = page.locator('.upload-draft-row').nth(targetIndex);
      await source.dragTo(target);
      await page.waitForTimeout(400);
    }
    const expectedTitle = action.packageKind === 'show'
      ? (action.seasonLabel || 'Season 1')
      : action.packageKind === 'graphic_novel'
        ? (action.title || 'Volume 1')
        : (action.title || 'Untitled package');
    const rootFolderLabel = action.packageKind === 'album'
      ? 'Music'
      : action.packageKind === 'audiobook'
        ? 'Audiobooks'
        : action.packageKind === 'movie'
          ? 'Movies'
          : action.packageKind === 'show'
            ? 'Shows'
            : action.packageKind === 'art'
              ? 'Art'
              : action.packageKind === 'graphic_novel'
                ? 'Graphic Novels'
                : 'Art';
    await page.locator('#upload-form button[type="submit"]').click();
    await page.locator('#upload-form').waitFor({ state: 'detached', timeout: 15000 });
    await libraryFolderTile(page, rootFolderLabel).waitFor({ timeout: 15000 });
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
      libraryFolders: Array.from(document.querySelectorAll('.section-block--library .library-folder-tile h4')).map(node => textFrom(node)),
      libraryTitles: Array.from(document.querySelectorAll('.section-block--library .library-media-tile h4')).map(node => textFrom(node)),
      libraryDownloadedTitles: Array.from(document.querySelectorAll('.section-block--library .library-browser-head button[data-unkeep-collection]')).flatMap(() => {
        const current = document.querySelector('.section-block--library .library-path-current');
        const title = textFrom(current);
        return title ? [title] : [];
      }),
      libraryPosts: [],
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
  if (Array.isArray(expected.libraryTitlesExact)) {
    assert.deepEqual(actual.libraryTitles, expected.libraryTitlesExact, `${scenarioId}: libraryTitles`);
  }
  if (Array.isArray(expected.libraryFolders)) {
    assert.deepEqual(actual.libraryFolders, expected.libraryFolders, `${scenarioId}: libraryFolders`);
  }
  if (Array.isArray(expected.libraryDownloadedTitles)) {
    assert.deepEqual(actual.libraryDownloadedTitles, expected.libraryDownloadedTitles, `${scenarioId}: libraryDownloadedTitles`);
  }
  if (Array.isArray(expected.libraryPosts)) {
    expected.libraryPosts.forEach(expectedPost => {
      const actualPost = actual.libraryPosts.find(item => item.title === expectedPost.title);
      assert.ok(actualPost, `${scenarioId}: missing library post ${expectedPost.title}`);
      if (Array.isArray(expectedPost.childTitles)) {
        assert.deepEqual(actualPost.childTitles, expectedPost.childTitles, `${scenarioId}: library childTitles for ${expectedPost.title} were ${JSON.stringify(actualPost.childTitles)}`);
      }
      if (typeof expectedPost.childCreators === 'string') {
        assert.equal(actualPost.childCreators, expectedPost.childCreators, `${scenarioId}: library childCreators for ${expectedPost.title} were ${JSON.stringify(actualPost.childCreators)}`);
      }
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
