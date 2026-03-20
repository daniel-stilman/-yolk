import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { createBootstrapNode, P2PRuntime } from '../runtime/p2p-runtime.mjs'

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
