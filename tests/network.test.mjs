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
    const relay = initial.feed.find(item => item.subjectTitle === 'Crossfade Relay')
    assert.ok(relay?.collectionRef, 'expected seeded collection in feed')
    await service.keepCollection(clientId, relay.collectionRef)
    await service.setSection(clientId, 'library')

    const beforeRestart = await service.buildSnapshot(clientId)
    assert.equal(beforeRestart.currentAccount?.username, 'alice')
    assert.ok(beforeRestart.library.collections.some(item => item.title === 'Crossfade Relay'))

    await service.destroy()
    service = await AppService.create({ baseDir, sampleMediaDir })

    const afterRestart = await service.buildSnapshot(clientId)
    assert.equal(afterRestart.currentAccount?.username, 'alice')
    assert.equal(afterRestart.activeSection, 'library')
    assert.ok(afterRestart.library.collections.some(item => item.title === 'Crossfade Relay'))
  } finally {
    await service.destroy()
    await fs.rm(baseDir, { recursive: true, force: true })
  }
})
