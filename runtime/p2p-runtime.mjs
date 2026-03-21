import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import DHT from 'bittorrent-dht'
import nacl from 'tweetnacl'
import WebTorrent from 'webtorrent'

const DEFAULT_DHT_VERIFY = (signature, value, publicKey) => nacl.sign.detached.verify(
  new Uint8Array(value),
  new Uint8Array(signature),
  new Uint8Array(publicKey)
)

const nowIso = () => new Date().toISOString()
const toHex = value => Buffer.from(value).toString('hex')
const fromHex = value => new Uint8Array(Buffer.from(value, 'hex'))
const sha1 = value => crypto.createHash('sha1').update(value).digest()
const sha256Hex = value => crypto.createHash('sha256').update(value).digest('hex')

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = stableValue(value[key])
      return acc
    }, {})
  }
  return value
}

export function stableStringify(value) {
  return JSON.stringify(stableValue(value))
}

function stripSignature(value) {
  const copy = JSON.parse(JSON.stringify(value))
  delete copy.signature
  return copy
}

function signRecord(secretKeyHex, record) {
  const payload = Buffer.from(stableStringify(stripSignature(record)))
  const signature = nacl.sign.detached(new Uint8Array(payload), fromHex(secretKeyHex))
  return Buffer.from(signature).toString('base64')
}

export function verifyRecord(publicKeyHex, record) {
  const payload = Buffer.from(stableStringify(stripSignature(record)))
  return nacl.sign.detached.verify(
    new Uint8Array(payload),
    new Uint8Array(Buffer.from(record.signature, 'base64')),
    fromHex(publicKeyHex)
  )
}

function createEmptyAccountState(accountId, publicKey, previous = null) {
  return {
    accountId,
    publicKey,
    profileRef: previous?.profileRef || null,
    mediaRefs: previous?.mediaRefs || [],
    collectionRefs: previous?.collectionRefs || [],
    keepRefs: previous?.keepRefs || [],
    followRefs: previous?.followRefs || [],
    activities: previous?.activities || [],
    seq: previous ? previous.seq + 1 : 0,
    updatedAt: nowIso(),
    signature: ''
  }
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true })
  return dir
}

async function writeJson(filePath, value) {
  await ensureDir(path.dirname(filePath))
  await fs.writeFile(filePath, `${stableStringify(value)}\n`, 'utf8')
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'))
  } catch {
    return fallback
  }
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function listFilesRecursive(rootDir) {
  if (!await pathExists(rootDir)) return []
  const entries = await fs.readdir(rootDir, { withFileTypes: true })
  const files = await Promise.all(entries.map(async entry => {
    const fullPath = path.join(rootDir, entry.name)
    if (entry.isDirectory()) return listFilesRecursive(fullPath)
    return [fullPath]
  }))
  return files.flat()
}

async function waitForTorrentDone(torrent) {
  if (torrent.done) return
  await new Promise((resolve, reject) => {
    const onDone = () => {
      cleanup()
      resolve()
    }
    const onError = error => {
      cleanup()
      reject(error)
    }
    const cleanup = () => {
      torrent.off('done', onDone)
      torrent.off('error', onError)
    }
    torrent.once('done', onDone)
    torrent.once('error', onError)
  })
}

async function waitForDhtGet(dht, key, options = {}, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out resolving DHT key ${Buffer.from(key).toString('hex')}`)), timeoutMs)
    dht.get(key, options, (error, result) => {
      clearTimeout(timer)
      if (error) reject(error)
      else resolve(result)
    })
  })
}

async function waitForDhtPut(dht, options, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out publishing mutable DHT item')), timeoutMs)
    dht.put(options, (error, hash) => {
      clearTimeout(timer)
      if (error) reject(error)
      else resolve(hash)
    })
  })
}

async function waitForListen(dht, port = 0) {
  await new Promise((resolve, reject) => {
    dht.once('error', reject)
    dht.listen(port, () => resolve())
  })
}

export async function createBootstrapNode({ port = 0 } = {}) {
  const dht = new DHT({ bootstrap: false, verify: DEFAULT_DHT_VERIFY })
  await waitForListen(dht, port)
  return {
    address: dht.address(),
    destroy: () => new Promise(resolve => dht.destroy(resolve))
  }
}

export class P2PRuntime {
  constructor(options = {}) {
    this.name = options.name || 'peer'
    this.baseDir = options.baseDir || path.join(os.tmpdir(), `yolk-runtime-${this.name}`)
    this.bootstrap = options.bootstrap || []
    this.dhtPort = options.dhtPort || 0
    this.torrentPort = options.torrentPort || 0
    this.accountsFile = path.join(this.baseDir, 'accounts.json')
    this.metaDir = path.join(this.baseDir, 'meta')
    this.contentDir = path.join(this.baseDir, 'content')
    this.downloadDir = path.join(this.baseDir, 'downloads')
    this.cacheDir = path.join(this.baseDir, 'cache')
    this.accounts = {}
    this.headsIndexFile = path.join(this.baseDir, 'heads.json')
    this.headsIndex = {}
    this.dht = null
    this.client = null
  }

  static async create(options = {}) {
    const runtime = new P2PRuntime(options)
    await runtime.start()
    return runtime
  }

  async start() {
    await Promise.all([
      ensureDir(this.baseDir),
      ensureDir(this.metaDir),
      ensureDir(this.contentDir),
      ensureDir(this.downloadDir),
      ensureDir(this.cacheDir)
    ])
    this.accounts = await readJson(this.accountsFile, {}) || {}
    this.headsIndex = await readJson(this.headsIndexFile, {}) || {}
    this.dht = new DHT({ bootstrap: this.bootstrap, verify: DEFAULT_DHT_VERIFY })
    await waitForListen(this.dht, this.dhtPort)
    this.client = new WebTorrent({
      tracker: false,
      lsd: false,
      natUpnp: false,
      natPmp: false,
      torrentPort: this.torrentPort,
      dht: { bootstrap: this.bootstrap }
    })
    await this.rebuildHeadsIndexFromLocalFiles()
    await this.restoreLocalSeeds()
    await this.republishMutableHeads()
  }

  async destroy() {
    if (this.client) await new Promise(resolve => this.client.destroy(resolve))
    if (this.dht) await new Promise(resolve => this.dht.destroy(resolve))
  }

  async saveAccounts() {
    await writeJson(this.accountsFile, this.accounts)
  }

  async saveHeadsIndex() {
    await writeJson(this.headsIndexFile, this.headsIndex)
  }

  async rebuildHeadsIndexFromLocalFiles() {
    const stateFiles = await listFilesRecursive(path.join(this.metaDir, 'states'))
    let changed = false
    for (const filePath of stateFiles) {
      const state = await readJson(filePath)
      if (!state?.accountId || typeof state.seq !== 'number' || !state.signature) continue
      const account = this.accounts[state.accountId]
      if (!account || !verifyRecord(state.accountId, state)) continue
      const current = this.headsIndex[state.accountId]
      if (current && current.seq >= state.seq) continue
      const torrent = await this.seedFile(filePath, { name: path.basename(filePath) })
      this.headsIndex[state.accountId] = {
        accountId: state.accountId,
        publicKey: account.publicKeyHex,
        latestStateRef: torrent.magnetURI,
        seq: state.seq,
        updatedAt: state.updatedAt
      }
      changed = true
    }
    if (changed) await this.saveHeadsIndex()
  }

  async restoreLocalSeeds() {
    const metaFiles = await listFilesRecursive(this.metaDir)
    const contentFiles = await listFilesRecursive(this.contentDir)
    for (const filePath of [...metaFiles, ...contentFiles]) {
      await this.seedFile(filePath, { name: path.basename(filePath) })
    }

    for (const accountId of Object.keys(this.accounts)) {
      const { head } = await this.resolveLocalState(accountId).catch(() => ({ head: null }))
      if (!head?.latestStateRef) continue
      const state = await this.downloadJsonRecord(head.latestStateRef, 'states').catch(() => null)
      if (!state?.keepRefs?.length) continue
      for (const keepRef of state.keepRefs) {
        const keep = await this.downloadJsonRecord(keepRef, 'keeps').catch(() => null)
        if (!keep?.mediaRef) continue
        const media = await this.downloadJsonRecord(keep.mediaRef, 'media').catch(() => null)
        if (!media?.contentRef || !media?.fileName) continue
        const targetPath = path.join(this.downloadDir, accountId, media.id)
        if (!await pathExists(path.join(targetPath, media.fileName))) continue
        await this.addTorrent(media.contentRef, targetPath)
      }
    }
  }

  async republishMutableHeads() {
    for (const [accountId, head] of Object.entries(this.headsIndex)) {
      const account = this.accounts[accountId]
      if (!account || !head?.latestStateRef) continue
      const value = Buffer.from(stableStringify(head))
      await waitForDhtPut(this.dht, {
        k: Buffer.from(account.publicKeyHex, 'hex'),
        seq: head.seq,
        v: value,
        sign: buffer => Buffer.from(nacl.sign.detached(new Uint8Array(buffer), fromHex(account.secretKeyHex)))
      })
    }
  }

  async resolveLocalState(accountId) {
    const head = this.headsIndex[accountId]
    if (!head?.latestStateRef) throw new Error(`Missing local head for ${accountId}`)
    const state = await this.downloadJsonRecord(head.latestStateRef, 'states')
    const verified = state.accountId === accountId && verifyRecord(accountId, state)
    if (!verified) throw new Error(`Local account state signature failed for ${accountId}`)
    return { head, state, verified }
  }

  async publishAccountState(accountId, state) {
    const account = this.requireAccount(accountId)
    state.signature = signRecord(account.secretKeyHex, state)
    const stateId = `state-${sha256Hex(stableStringify(stripSignature(state))).slice(0, 24)}`
    const stateRef = await this.seedJsonRecord('states', stateId, state)
    const head = {
      accountId,
      publicKey: account.publicKeyHex,
      latestStateRef: stateRef.magnetURI,
      seq: state.seq,
      updatedAt: state.updatedAt
    }
    this.headsIndex[accountId] = head
    await this.saveHeadsIndex()
    const value = Buffer.from(stableStringify(head))
    const mutableHash = await waitForDhtPut(this.dht, {
      k: Buffer.from(account.publicKeyHex, 'hex'),
      seq: state.seq,
      v: value,
      sign: buffer => Buffer.from(nacl.sign.detached(new Uint8Array(buffer), fromHex(account.secretKeyHex)))
    })
    return { head, state, stateRef: stateRef.magnetURI, mutableHash: toHex(mutableHash) }
  }

  async createAccount(input) {
    const keypair = nacl.sign.keyPair()
    const publicKeyHex = toHex(keypair.publicKey)
    const secretKeyHex = toHex(keypair.secretKey)
    const accountId = publicKeyHex
    this.accounts[accountId] = { accountId, publicKeyHex, secretKeyHex }
    await this.saveAccounts()
    await this.publishProfile(accountId, input)
    return { accountId, publicKeyHex }
  }

  requireAccount(accountId) {
    const account = this.accounts[accountId]
    if (!account) throw new Error(`Unknown local account ${accountId}`)
    return account
  }

  async seedFile(filePath, options = {}) {
    return new Promise((resolve, reject) => {
      const onError = error => {
        this.client.off('error', onError)
        reject(error)
      }
      this.client.on('error', onError)
      this.client.seed(filePath, { announce: [], ...options }, torrent => {
        this.client.off('error', onError)
        resolve(torrent)
      })
    })
  }

  async addTorrent(torrentId, targetPath) {
    const existing = await this.client.get(torrentId)
    if (existing) return existing
    return new Promise((resolve, reject) => {
      const onError = error => {
        this.client.off('error', onError)
        reject(error)
      }
      this.client.on('error', onError)
      this.client.add(torrentId, { path: targetPath }, torrent => {
        this.client.off('error', onError)
        resolve(torrent)
      })
    })
  }

  async removeTorrent(torrentId) {
    const existing = await this.client.get(torrentId)
    if (!existing) return false
    await new Promise((resolve, reject) => {
      this.client.remove(torrentId, { destroyStore: true }, error => {
        if (error) reject(error)
        else resolve(null)
      })
    })
    return true
  }

  async seedJsonRecord(prefix, recordId, value) {
    const filePath = path.join(this.metaDir, prefix, `${recordId}.json`)
    await writeJson(filePath, value)
    const torrent = await this.seedFile(filePath, { name: `${recordId}.json` })
    return {
      filePath,
      magnetURI: torrent.magnetURI,
      infoHash: torrent.infoHash,
      fileName: `${recordId}.json`
    }
  }

  async downloadJsonRecord(ref, bucket) {
    const existing = await this.client.get(ref)
    if (existing) {
      const existingFile = existing.files[0]
      const existingPath = path.join(existing.path, existingFile.path)
      return readJson(existingPath)
    }
    const targetPath = path.join(this.cacheDir, bucket)
    const torrent = await this.addTorrent(ref, targetPath)
    await waitForTorrentDone(torrent)
    const file = torrent.files[0]
    const filePath = path.join(targetPath, file.path)
    return readJson(filePath)
  }

  async publishProfile(accountId, input) {
    const account = this.requireAccount(accountId)
    const previousState = await this.resolveState(accountId).catch(() => null)
    const profile = {
      accountId,
      publicKey: account.publicKeyHex,
      username: String(input.username || '').trim().toLowerCase(),
      displayName: String(input.displayName || '').trim() || String(input.username || '').trim(),
      bio: String(input.bio || '').trim(),
      updatedAt: nowIso(),
      signature: ''
    }
    profile.signature = signRecord(account.secretKeyHex, profile)
    const profileId = `profile-${sha256Hex(stableStringify(stripSignature(profile))).slice(0, 24)}`
    const profileRef = await this.seedJsonRecord('profiles', profileId, profile)
    const state = createEmptyAccountState(accountId, account.publicKeyHex, previousState?.state || null)
    state.profileRef = profileRef.magnetURI
    state.activities = [
      ...state.activities,
      {
        kind: 'profile',
        subjectRef: profileRef.magnetURI,
        subjectTitle: profile.displayName,
        summary: previousState ? 'Updated profile' : 'Published initial profile',
        createdAt: profile.updatedAt
      }
    ]
    const published = await this.publishAccountState(accountId, state)
    return { ...published, profile, profileRef: profileRef.magnetURI }
  }

  async resolveHead(accountId) {
    if (this.accounts[accountId] && this.headsIndex[accountId]) {
      return this.headsIndex[accountId]
    }
    const hash = sha1(Buffer.from(accountId, 'hex'))
    const result = await waitForDhtGet(this.dht, hash)
    if (!result?.v || !result?.k) throw new Error(`Missing DHT head for ${accountId}`)
    if (toHex(result.k) !== accountId) throw new Error('Mutable DHT key did not match requested account')
    return JSON.parse(result.v.toString('utf8'))
  }

  async resolveState(accountId) {
    const local = await this.resolveLocalState(accountId).catch(() => null)
    if (local) return local
    const head = await this.resolveHead(accountId)
    const state = await this.downloadJsonRecord(head.latestStateRef, 'states')
    const verified = state.accountId === accountId && verifyRecord(accountId, state)
    if (!verified) throw new Error(`Account state signature failed for ${accountId}`)
    return { head, state, verified }
  }

  async resolveProfile(accountId) {
    const { head, state } = await this.resolveState(accountId)
    const profile = await this.downloadJsonRecord(state.profileRef, 'profiles')
    const verified = profile.accountId === accountId && verifyRecord(accountId, profile)
    if (!verified) throw new Error(`Profile signature failed for ${accountId}`)
    return { head, state, profile, verified }
  }

  async publishMedia(accountId, input) {
    const account = this.requireAccount(accountId)
    const previousState = await this.resolveState(accountId)
    const mediaId = `media-${sha256Hex(`${accountId}:${input.fileName}:${nowIso()}`).slice(0, 24)}`
    const mediaDir = path.join(this.contentDir, accountId)
    const filePath = path.join(mediaDir, input.fileName)
    await ensureDir(mediaDir)
    await fs.writeFile(filePath, input.data)
    const contentTorrent = await this.seedFile(filePath, { name: input.fileName })
    const media = {
      id: mediaId,
      creatorAccountId: accountId,
      contentRef: contentTorrent.magnetURI,
      infoHash: contentTorrent.infoHash,
      mediaType: input.mediaType,
      title: input.title,
      description: input.description || '',
      fileName: input.fileName,
      createdAt: nowIso(),
      signature: ''
    }
    media.signature = signRecord(account.secretKeyHex, media)
    const metadataRef = await this.seedJsonRecord('media', mediaId, media)
    const state = createEmptyAccountState(accountId, account.publicKeyHex, previousState.state)
    state.profileRef = previousState.state.profileRef
    state.mediaRefs = [...previousState.state.mediaRefs, metadataRef.magnetURI]
    state.collectionRefs = previousState.state.collectionRefs
    state.keepRefs = previousState.state.keepRefs
    state.followRefs = previousState.state.followRefs
    state.activities = [
      ...previousState.state.activities,
      {
        kind: 'upload',
        subjectRef: metadataRef.magnetURI,
        subjectTitle: media.title,
        summary: `Published ${media.mediaType}: ${media.title}`,
        createdAt: media.createdAt
      }
    ]
    await this.publishAccountState(accountId, state)
    return {
      media,
      mediaRef: metadataRef.magnetURI,
      metadataInfoHash: metadataRef.infoHash,
      contentInfoHash: contentTorrent.infoHash
    }
  }

  async resolveMedia(mediaRef) {
    const media = await this.downloadJsonRecord(mediaRef, 'media')
    const verified = verifyRecord(media.creatorAccountId, media)
    if (!verified) throw new Error(`Media signature failed for ${media.id}`)
    return { media, verified }
  }

  async materializeMedia(mediaRef, bucket = 'preview') {
    const { media } = await this.resolveMedia(mediaRef)
    const existing = await this.client.get(media.contentRef)
    if (existing) {
      return {
        media,
        filePath: path.join(existing.path, existing.files[0].path)
      }
    }
    const targetPath = path.join(this.cacheDir, bucket, media.id)
    await ensureDir(targetPath)
    const torrent = await this.addTorrent(media.contentRef, targetPath)
    await waitForTorrentDone(torrent)
    return {
      media,
      filePath: path.join(targetPath, torrent.files[0].path)
    }
  }

  async publishCollection(accountId, input) {
    const account = this.requireAccount(accountId)
    const previousState = await this.resolveState(accountId)
    const collection = {
      id: `collection-${sha256Hex(`${accountId}:${input.title}:${nowIso()}`).slice(0, 24)}`,
      creatorAccountId: accountId,
      title: input.title,
      type: input.type,
      description: input.description || '',
      coverMediaRef: input.coverMediaRef || null,
      isCurated: Boolean(input.isCurated),
      children: input.children || [],
      updatedAt: nowIso(),
      signature: ''
    }
    collection.signature = signRecord(account.secretKeyHex, collection)
    const collectionRef = await this.seedJsonRecord('collections', collection.id, collection)
    const state = createEmptyAccountState(accountId, account.publicKeyHex, previousState.state)
    state.profileRef = previousState.state.profileRef
    state.mediaRefs = previousState.state.mediaRefs
    state.collectionRefs = [...previousState.state.collectionRefs, collectionRef.magnetURI]
    state.keepRefs = previousState.state.keepRefs
    state.followRefs = previousState.state.followRefs
    state.activities = [
      ...previousState.state.activities,
      {
        kind: 'collection',
        subjectRef: collectionRef.magnetURI,
        subjectTitle: collection.title,
        summary: `Published collection: ${collection.title}`,
        createdAt: collection.updatedAt
      }
    ]
    const published = await this.publishAccountState(accountId, state)
    return { ...published, collection, collectionRef: collectionRef.magnetURI }
  }

  async resolveCollection(collectionRef) {
    const collection = await this.downloadJsonRecord(collectionRef, 'collections')
    const verified = verifyRecord(collection.creatorAccountId, collection)
    if (!verified) throw new Error(`Collection signature failed for ${collection.id}`)
    return { collection, verified }
  }

  async publishFollow(accountId, followedAccountId) {
    const account = this.requireAccount(accountId)
    const previousState = await this.resolveState(accountId)
    const existing = await Promise.all(previousState.state.followRefs.map(ref => this.resolveFollow(ref).catch(() => null)))
    if (existing.some(item => item?.follow?.followedAccountId === followedAccountId)) {
      return { duplicate: true }
    }
    const targetProfile = await this.resolveProfile(followedAccountId).catch(() => null)
    const follow = {
      id: `follow-${sha256Hex(`${accountId}:${followedAccountId}`).slice(0, 24)}`,
      followerAccountId: accountId,
      followedAccountId,
      createdAt: nowIso(),
      signature: ''
    }
    follow.signature = signRecord(account.secretKeyHex, follow)
    const followRef = await this.seedJsonRecord('follows', follow.id, follow)
    const state = createEmptyAccountState(accountId, account.publicKeyHex, previousState.state)
    state.profileRef = previousState.state.profileRef
    state.mediaRefs = previousState.state.mediaRefs
    state.collectionRefs = previousState.state.collectionRefs
    state.keepRefs = previousState.state.keepRefs
    state.followRefs = [...previousState.state.followRefs, followRef.magnetURI]
    state.activities = [
      ...previousState.state.activities,
      {
        kind: 'follow',
        subjectRef: followRef.magnetURI,
        subjectTitle: targetProfile?.profile?.username || followedAccountId.slice(0, 12),
        summary: `Followed ${targetProfile?.profile?.username || followedAccountId.slice(0, 12)}`,
        createdAt: follow.createdAt
      }
    ]
    const published = await this.publishAccountState(accountId, state)
    return { ...published, follow, followRef: followRef.magnetURI }
  }

  async resolveFollow(followRef) {
    const follow = await this.downloadJsonRecord(followRef, 'follows')
    const verified = verifyRecord(follow.followerAccountId, follow)
    if (!verified) throw new Error(`Follow signature failed for ${follow.id}`)
    return { follow, verified }
  }

  async keepMedia(accountId, mediaRef) {
    const account = this.requireAccount(accountId)
    const previousState = await this.resolveState(accountId)
    const { media } = await this.resolveMedia(mediaRef)
    const existing = await Promise.all(previousState.state.keepRefs.map(ref => this.resolveKeep(ref).catch(() => null)))
    const previousKeep = existing.find(item => item?.keep?.mediaId === media.id)
    if (previousKeep) {
      return {
        keep: previousKeep.keep,
        media,
        downloadedPath: null,
        seeded: true
      }
    }
    const targetPath = path.join(this.downloadDir, account.accountId, media.id)
    await ensureDir(targetPath)
    const torrent = await this.addTorrent(media.contentRef, targetPath)
    await waitForTorrentDone(torrent)
    const keep = {
      accountId,
      mediaId: media.id,
      mediaRef,
      contentInfoHash: media.infoHash,
      createdAt: nowIso(),
      signature: ''
    }
    keep.signature = signRecord(account.secretKeyHex, keep)
    const keepId = `keep-${sha256Hex(`${accountId}:${media.id}`).slice(0, 24)}`
    const keepRef = await this.seedJsonRecord('keeps', keepId, keep)
    const state = createEmptyAccountState(accountId, account.publicKeyHex, previousState.state)
    state.profileRef = previousState.state.profileRef
    state.mediaRefs = previousState.state.mediaRefs
    state.collectionRefs = previousState.state.collectionRefs
    state.followRefs = previousState.state.followRefs
    state.keepRefs = [...previousState.state.keepRefs, keepRef.magnetURI]
    state.activities = [
      ...previousState.state.activities,
      {
        kind: 'keep',
        subjectRef: keepRef.magnetURI,
        subjectTitle: media.title,
        summary: `Keep + seed: ${media.title}`,
        createdAt: keep.createdAt
      }
    ]
    await this.publishAccountState(accountId, state)
    return {
      keep,
      media,
      downloadedPath: path.join(targetPath, torrent.files[0].path),
      seeded: torrent.done
    }
  }

  async resolveKeep(keepRef) {
    const keep = await this.downloadJsonRecord(keepRef, 'keeps')
    const verified = verifyRecord(keep.accountId, keep)
    if (!verified) throw new Error(`Keep signature failed for ${keep.id}`)
    return { keep, verified }
  }

  async removeKeep(accountId, mediaRef) {
    const account = this.requireAccount(accountId)
    const previousState = await this.resolveState(accountId)
    const keepEntries = await Promise.all(previousState.state.keepRefs.map(async keepRef => {
      const resolved = await this.resolveKeep(keepRef).catch(() => null)
      return resolved ? { keepRef, keep: resolved.keep } : null
    }))
    const target = keepEntries.find(entry => entry?.keep?.mediaRef === mediaRef)
    if (!target) return { removed: false, mediaRef }

    const { media } = await this.resolveMedia(mediaRef)
    const targetPath = path.join(this.downloadDir, account.accountId, media.id)
    const torrent = await this.client.get(media.contentRef)
    if (torrent && path.resolve(torrent.path) === path.resolve(targetPath)) {
      await this.removeTorrent(media.contentRef)
    }
    await fs.rm(targetPath, { recursive: true, force: true })

    const state = createEmptyAccountState(accountId, account.publicKeyHex, previousState.state)
    state.profileRef = previousState.state.profileRef
    state.mediaRefs = previousState.state.mediaRefs
    state.collectionRefs = previousState.state.collectionRefs
    state.followRefs = previousState.state.followRefs
    state.keepRefs = previousState.state.keepRefs.filter(keepRef => keepRef !== target.keepRef)
    state.activities = previousState.state.activities
    await this.publishAccountState(accountId, state)
    return { removed: true, mediaRef, media }
  }
}
