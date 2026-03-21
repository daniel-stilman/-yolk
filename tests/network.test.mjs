import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createBootstrapNode, P2PRuntime } from '../runtime/p2p-runtime.mjs'
import { AppService } from '../runtime/app-service.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.join(__dirname, '..')

async function createRuntimePair(namePrefix) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `${namePrefix}-`))
  const bootstrap = await createBootstrapNode()
  const bootstrapRef = [`127.0.0.1:${bootstrap.address.port}`]
  const a = await P2PRuntime.create({ name: `${namePrefix}-a`, baseDir: path.join(root, 'a'), bootstrap: bootstrapRef })
  const b = await P2PRuntime.create({ name: `${namePrefix}-b`, baseDir: path.join(root, 'b'), bootstrap: bootstrapRef })
  return {
    root,
    a,
    b,
    bootstrap,
    destroy: async () => {
      await Promise.allSettled([a.destroy(), b.destroy(), bootstrap.destroy()])
      await fs.rm(root, { recursive: true, force: true })
    }
  }
}

test('mutable DHT heads resolve the latest signed profile', async () => {
  const pair = await createRuntimePair('yolk-profile')
  try {
    const account = await pair.a.createAccount({
      username: 'sol',
      displayName: 'Sol Mercer',
      bio: 'First profile'
    })
    let resolved = await pair.b.resolveProfile(account.accountId)
    assert.equal(resolved.verified, true)
    assert.equal(resolved.profile.username, 'sol')
    assert.equal(resolved.head.seq, 0)

    await pair.a.publishProfile(account.accountId, {
      username: 'sol',
      displayName: 'Sol Mercer',
      bio: 'Updated profile'
    })
    resolved = await pair.b.resolveProfile(account.accountId)
    assert.equal(resolved.head.seq, 1)
    assert.equal(resolved.profile.bio, 'Updated profile')
  } finally {
    await pair.destroy()
  }
})

test('keep downloads the torrent payload and continues seeding locally', async () => {
  const pair = await createRuntimePair('yolk-keep')
  try {
    const creator = await pair.a.createAccount({
      username: 'noor',
      displayName: 'Noor Vale',
      bio: 'Seeder'
    })
    const collector = await pair.b.createAccount({
      username: 'alice',
      displayName: 'Alice Atlas',
      bio: 'Collector'
    })
    const published = await pair.a.publishMedia(creator.accountId, {
      title: 'Dock Memo',
      description: 'Network-backed test payload',
      mediaType: 'text',
      fileName: 'dock-memo.txt',
      data: Buffer.from('dock memo over torrent', 'utf8')
    })

    const resolved = await pair.b.resolveMedia(published.mediaRef)
    assert.equal(resolved.verified, true)
    assert.equal(resolved.media.title, 'Dock Memo')

    const kept = await pair.b.keepMedia(collector.accountId, published.mediaRef)
    assert.equal(kept.seeded, true)
    const payload = await fs.readFile(kept.downloadedPath, 'utf8')
    assert.equal(payload, 'dock memo over torrent')
  } finally {
    await pair.destroy()
  }
})

test('app service discovery snapshot exposes truthful network, trust, search, and post-only discover media', async () => {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yolk-discovery-'))
  const clientId = 'discovery-client'
  const sampleMediaDir = path.join(repoRoot, 'sample media')
  const service = await AppService.create({ baseDir, sampleMediaDir })

  try {
    await service.createAccount(clientId, {
      username: 'alice',
      displayName: 'Alice Atlas',
      bio: 'Collector'
    })

    let snapshot = await service.buildSnapshot(clientId)
    assert.equal(snapshot.network.accounts, 3)
    assert.equal(snapshot.network.media, 4)
    assert.equal(snapshot.network.collections, 3)
    assert.equal(snapshot.network.keeps, 0)
    assert.equal(snapshot.network.follows, 2)
    assert.equal(snapshot.trust.verifiedProfile, true)
    assert.equal(snapshot.trust.resolvedViaDhtHead, false)
    assert.ok(typeof snapshot.trust.selectedHeadSeq === 'number')
    assert.match(snapshot.trust.selectedProfileRef || '', /^magnet:\?xt=urn:btih:/)
    assert.ok(snapshot.suggestions.some(item => item.username === 'sol'))
    assert.ok(snapshot.feed.every(item => item.kind === 'post'))
    assert.ok(snapshot.feed.some(item => item.kind === 'post' && item.subjectTitle === 'Night Transit'))
    assert.ok(snapshot.feed.some(item => item.kind === 'post' && item.subjectTitle === 'Harbor Studies'))

    await service.searchProfiles(clientId, 'noor')
    snapshot = await service.buildSnapshot(clientId)
    assert.equal(snapshot.discoverQuery, 'noor')
    assert.deepEqual(snapshot.searchResults.map(item => item.username), ['noor'])
  } finally {
    await service.destroy()
    await fs.rm(baseDir, { recursive: true, force: true })
  }
})

test('structured upload publishes a canonical package and followers see the package post instead of child upload noise', async () => {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yolk-structured-upload-'))
  const sampleMediaDir = path.join(repoRoot, 'sample media')
  const aliceClient = 'structured-alice'
  const bobClient = 'structured-bob'
  const service = await AppService.create({ baseDir, sampleMediaDir })

  try {
    const alice = await service.createAccount(aliceClient, {
      username: 'alice',
      displayName: 'Alice Atlas',
      bio: 'Structured uploader'
    })
    await service.publishStructuredUpload(aliceClient, {
      packageKind: 'show',
      description: 'Season package for regression coverage.',
      seriesTitle: 'Signal Bureau',
      seasonLabel: 'Season 1',
      rows: [
        {
          title: 'Episode 1',
          fileName: 'episode-1.txt',
          mediaType: 'text',
          dataBase64: Buffer.from('Episode one payload', 'utf8').toString('base64')
        },
        {
          title: 'Episode 2',
          fileName: 'episode-2.txt',
          mediaType: 'text',
          dataBase64: Buffer.from('Episode two payload', 'utf8').toString('base64')
        }
      ]
    })

    const aliceSnapshot = await service.buildSnapshot(aliceClient)
    const season = aliceSnapshot.library.collections.find(item => item.title === 'Season 1')
    assert.ok(season, 'expected structured package in library')
    assert.equal(season.packageKind, 'show')
    assert.deepEqual(season.libraryPath, ['Shows', 'Signal Bureau'])
    assert.deepEqual(season.children.map(child => child.title), ['Episode 1', 'Episode 2'])

    await service.createAccount(bobClient, {
      username: 'bob',
      displayName: 'Bob Vale',
      bio: 'Follower'
    })
    await service.followAccount(bobClient, alice.accountId)
    const bobSnapshot = await service.buildSnapshot(bobClient)
    assert.ok(bobSnapshot.feed.some(item => item.kind === 'post' && item.subjectTitle === 'Season 1'))
    assert.ok(!bobSnapshot.feed.some(item => item.kind === 'upload' && ['Episode 1', 'Episode 2'].includes(item.subjectTitle)))
  } finally {
    await service.destroy()
    await fs.rm(baseDir, { recursive: true, force: true })
  }
})

test('keeping a collection saves nested collection packages and media recursively', async () => {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yolk-collection-keep-'))
  const clientId = 'collection-keeper'
  const sampleMediaDir = path.join(repoRoot, 'sample media')
  const service = await AppService.create({ baseDir, sampleMediaDir })

  try {
    const noorId = service.demoAccounts.noor
    const noorProfile = await service.demoRuntime.resolveProfile(noorId)
    const [nightRef, bloomRef] = noorProfile.state.mediaRefs
    const nested = await service.demoRuntime.publishCollection(noorId, {
      title: 'Nested Night Set',
      type: 'series',
      description: 'Nested collection for recursive keep coverage.',
      isCurated: false,
      children: [{ kind: 'media', ref: nightRef }]
    })
    const parent = await service.demoRuntime.publishCollection(noorId, {
      title: 'Nested Package',
      type: 'curated',
      description: 'Parent collection with a nested child collection.',
      isCurated: true,
      children: [
        { kind: 'collection', ref: nested.collectionRef },
        { kind: 'media', ref: bloomRef }
      ]
    })

    await service.createAccount(clientId, {
      username: 'alice',
      displayName: 'Alice Atlas',
      bio: 'Collector'
    })
    const kept = await service.keepCollection(clientId, parent.collectionRef)
    assert.ok(kept.keptCollectionRefs.includes(parent.collectionRef))
    assert.ok(kept.keptCollectionRefs.includes(nested.collectionRef))
    assert.equal(kept.keptRefs.length, 2)

    const snapshot = await service.buildSnapshot(clientId)
    const saved = snapshot.library.collections.find(item => item.title === 'Nested Package')
    assert.ok(saved, 'expected parent package in library')
    assert.ok(saved.children.some(child => child.kind === 'collection' && child.title === 'Nested Night Set'))
    assert.ok(snapshot.library.keptTitles.includes('Night Transit'))
    assert.ok(snapshot.library.keptTitles.includes('Signal Bloom'))
  } finally {
    await service.destroy()
    await fs.rm(baseDir, { recursive: true, force: true })
  }
})

test('unkeeping a saved collection removes its package from the library', async () => {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yolk-collection-unkeep-'))
  const clientId = 'collection-unkeeper'
  const sampleMediaDir = path.join(repoRoot, 'sample media')
  const service = await AppService.create({ baseDir, sampleMediaDir })

  try {
    await service.createAccount(clientId, {
      username: 'alice',
      displayName: 'Alice Atlas',
      bio: 'Collector'
    })

    const initial = await service.buildSnapshot(clientId)
    const relay = initial.feed.find(item => item.subjectTitle === 'Night Transit')
    assert.ok(relay?.collectionRef, 'expected seeded collection in feed')

    await service.keepCollection(clientId, relay.collectionRef)
    let snapshot = await service.buildSnapshot(clientId)
    assert.ok(snapshot.library.collections.some(item => item.title === 'Night Transit'))
    assert.deepEqual(snapshot.library.keptTitles.slice().sort(), ['Night Transit', 'Signal Bloom'].sort())

    await service.unkeepCollection(clientId, relay.collectionRef)
    snapshot = await service.buildSnapshot(clientId)
    assert.ok(!snapshot.library.collections.some(item => item.title === 'Night Transit'))
    assert.deepEqual(snapshot.library.keptTitles, [])
  } finally {
    await service.destroy()
    await fs.rm(baseDir, { recursive: true, force: true })
  }
})

test('runtime restart republishes account heads and restores torrent availability', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'yolk-restart-'))
  let bootstrap = await createBootstrapNode()
  let creator = await P2PRuntime.create({
    name: 'restart-creator',
    baseDir: path.join(root, 'creator'),
    bootstrap: [`127.0.0.1:${bootstrap.address.port}`]
  })

  try {
    const account = await creator.createAccount({
      username: 'sol',
      displayName: 'Sol Mercer',
      bio: 'Restarts should keep this intact.'
    })
    const published = await creator.publishMedia(account.accountId, {
      title: 'Persistent Memo',
      description: 'Should still resolve after restart.',
      mediaType: 'text',
      fileName: 'persistent-memo.txt',
      data: Buffer.from('persistent runtime payload', 'utf8')
    })

    await creator.destroy()
    await bootstrap.destroy()

    bootstrap = await createBootstrapNode()
    creator = await P2PRuntime.create({
      name: 'restart-creator',
      baseDir: path.join(root, 'creator'),
      bootstrap: [`127.0.0.1:${bootstrap.address.port}`]
    })
    const collector = await P2PRuntime.create({
      name: 'restart-collector',
      baseDir: path.join(root, 'collector'),
      bootstrap: [`127.0.0.1:${bootstrap.address.port}`]
    })

    try {
      const resolvedProfile = await collector.resolveProfile(account.accountId)
      assert.equal(resolvedProfile.profile.username, 'sol')
      const kept = await collector.keepMedia((await collector.createAccount({
        username: 'alice',
        displayName: 'Alice Atlas',
        bio: 'Collector'
      })).accountId, published.mediaRef)
      const payload = await fs.readFile(kept.downloadedPath, 'utf8')
      assert.equal(payload, 'persistent runtime payload')
      assert.equal(kept.seeded, true)
    } finally {
      await collector.destroy()
    }
  } finally {
    await Promise.allSettled([creator?.destroy(), bootstrap?.destroy()])
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('app service persists session state and saved library collections across restart', async () => {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yolk-app-persist-'))
  const clientId = 'persisted-client'
  const sampleMediaDir = path.join(repoRoot, 'sample media')
  let service = await AppService.create({ baseDir, sampleMediaDir })

  try {
    await service.createAccount(clientId, {
      username: 'alice',
      displayName: 'Alice Atlas',
      bio: 'Collector'
    })
    const initial = await service.buildSnapshot(clientId)
    const relay = initial.feed.find(item => item.subjectTitle === 'Night Transit')
    assert.ok(relay?.collectionRef, 'expected seeded collection in feed')
    await service.keepCollection(clientId, relay.collectionRef)
    await service.setSection(clientId, 'library')

    const beforeRestart = await service.buildSnapshot(clientId)
    assert.equal(beforeRestart.currentAccount?.username, 'alice')
    assert.ok(beforeRestart.library.collections.some(item => item.title === 'Night Transit'))

    await service.destroy()
    service = await AppService.create({ baseDir, sampleMediaDir })

    const afterRestart = await service.buildSnapshot(clientId)
    assert.equal(afterRestart.currentAccount?.username, 'alice')
    assert.equal(afterRestart.activeSection, 'library')
    assert.ok(afterRestart.library.collections.some(item => item.title === 'Night Transit'))
  } finally {
    await service.destroy()
    await fs.rm(baseDir, { recursive: true, force: true })
  }
})
