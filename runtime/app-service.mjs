import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { createBootstrapNode, P2PRuntime, signRecord, stableStringify, verifyRecord } from './p2p-runtime.mjs'

const uiDefaults = () => ({
  activeSection: 'discover',
  selectedProfileAccountId: null,
  discoverQuery: '',
  flashMessage: '',
  collectionDraftChildRefs: [],
  savedCollectionRefs: [],
  savedCollectionPackages: {},
  savedMediaRefs: []
})

const SAMPLE_MEDIA_FIXTURES = [
  {
    fileName: '97d7470b-c124-4957-ba72-8a9cb4c9cf56.jpg',
    owner: 'sol',
    title: 'Amber Lines',
    description: 'Still image from the harbor run at last light.',
    mediaType: 'image'
  },
  {
    fileName: 'open light.mp3',
    owner: 'sol',
    title: 'Open Light',
    description: 'Audio sketch sequenced for late playback.',
    mediaType: 'audio'
  },
  {
    fileName: 'grok-video-0a45c300-4996-4563-9faf-5c0b445871a0.mp4',
    owner: 'noor',
    title: 'Night Transit',
    description: 'Moving-image fragment built for the night set.',
    mediaType: 'video'
  },
  {
    fileName: 'b3ea02e2-5632-4af6-b502-69fd41681b7d.jpg',
    owner: 'noor',
    title: 'Signal Bloom',
    description: 'Companion still from the shared signal archive.',
    mediaType: 'image'
  }
]

const DEMO_NETWORK_VERSION = 2
const PACKAGE_KIND_CONFIG = {
  album: { collectionType: 'album', rootLabel: 'Music' },
  audiobook: { collectionType: 'audiobook', rootLabel: 'Audiobooks' },
  movie: { collectionType: 'movie', rootLabel: 'Movies' },
  show: { collectionType: 'season', rootLabel: 'Shows' },
  art: { collectionType: 'gallery', rootLabel: 'Art' },
  graphic_novel: { collectionType: 'graphic-novel', rootLabel: 'Graphic Novels' }
}
const FOLLOW_INVITE_PREFIX = 'yolk-follow:'
const transportDefaults = () => ({
  dhtPort: 0,
  peerHintsByAccountId: {}
})

function validIsoTimestamp(value) {
  const text = String(value || '').trim()
  return text && !Number.isNaN(Date.parse(text)) ? text : null
}

function mergePeerHint(base, next) {
  const failureCount = Math.max(
    0,
    Number(base?.failureCount || 0) || 0,
    Number(next?.failureCount || 0) || 0
  )
  const importedAt = [validIsoTimestamp(next?.lastImportedAt), validIsoTimestamp(base?.lastImportedAt)]
    .filter(Boolean)
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0] || null
  const lastTriedAt = [validIsoTimestamp(next?.lastTriedAt), validIsoTimestamp(base?.lastTriedAt)]
    .filter(Boolean)
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0] || null
  const lastSucceededAt = [validIsoTimestamp(next?.lastSucceededAt), validIsoTimestamp(base?.lastSucceededAt)]
    .filter(Boolean)
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0] || null
  const lastFailedAt = [validIsoTimestamp(next?.lastFailedAt), validIsoTimestamp(base?.lastFailedAt)]
    .filter(Boolean)
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0] || null
  return {
    host: String(next?.host || base?.host || '').trim(),
    port: Number(next?.port || base?.port || 0),
    scope: String(next?.scope || base?.scope || '').trim() || 'direct',
    source: String(next?.source || base?.source || '').trim() || 'invite',
    lastImportedAt: importedAt,
    lastTriedAt,
    lastSucceededAt,
    lastFailedAt,
    failureCount
  }
}

function hintRankValue(hint) {
  const succeededAt = validIsoTimestamp(hint?.lastSucceededAt)
  const importedAt = validIsoTimestamp(hint?.lastImportedAt)
  const failedAt = validIsoTimestamp(hint?.lastFailedAt)
  const triedAt = validIsoTimestamp(hint?.lastTriedAt)
  return (
    (succeededAt ? Date.parse(succeededAt) : 0) * 4 +
    (importedAt ? Date.parse(importedAt) : 0) * 2 +
    (triedAt ? Date.parse(triedAt) : 0) -
    (failedAt ? Date.parse(failedAt) : 0) -
    (Number(hint?.failureCount || 0) || 0) * 10_000_000_000_000
  )
}

function orderPeerHints(hints) {
  return normalizePeerHints(hints).sort((left, right) => hintRankValue(right) - hintRankValue(left))
}

function parseAdvertiseHosts(value) {
  if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean)
  return String(value || '')
    .split(/[,\s]+/)
    .map(item => item.trim())
    .filter(Boolean)
}

function normalizePeerHints(hints) {
  if (!Array.isArray(hints)) return []
  const byAddress = new Map()
  for (const hint of hints) {
    const host = String(hint?.host || '').trim()
    const port = Number(hint?.port || 0)
    if (!host || !Number.isInteger(port) || port <= 0) continue
    const key = `${host}:${port}`
    byAddress.set(key, mergePeerHint(byAddress.get(key), { ...hint, host, port }))
  }
  return [...byAddress.values()]
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

function normalizeLibraryPath(pathValue, fallback = []) {
  if (!Array.isArray(pathValue)) return [...fallback]
  const normalized = pathValue
    .map(part => String(part || '').trim())
    .filter(Boolean)
  return normalized.length ? normalized : [...fallback]
}

function inferPackageKind(input) {
  const mediaTypes = Array.isArray(input?.rows)
    ? input.rows.map(row => String(row?.mediaType || '').trim().toLowerCase()).filter(Boolean)
    : []
  if (!mediaTypes.length) return 'art'
  const unique = [...new Set(mediaTypes)]
  if (unique.length === 1) {
    if (unique[0] === 'audio') return 'album'
    if (unique[0] === 'video') return mediaTypes.length > 1 ? 'show' : 'movie'
    if (unique[0] === 'text') return 'audiobook'
    return 'art'
  }
  if (mediaTypes.every(type => type === 'video' || type === 'image')) return 'movie'
  if (mediaTypes.every(type => type === 'audio' || type === 'text')) return 'audiobook'
  return 'art'
}

function canonicalPackageFromInput(input) {
  const requestedKind = String(input.packageKind || '').trim()
  const packageKind = PACKAGE_KIND_CONFIG[requestedKind] ? requestedKind : inferPackageKind(input)
  const kindConfig = PACKAGE_KIND_CONFIG[packageKind] || PACKAGE_KIND_CONFIG.art
  const title = String(input.title || '').trim()
  const seriesTitle = String(input.seriesTitle || '').trim()
  const seasonLabel = String(input.seasonLabel || '').trim()
  const description = String(input.description || '').trim()

  if (packageKind === 'show') {
    const showTitle = seriesTitle || title || 'Untitled show'
    return {
      packageKind,
      collectionType: kindConfig.collectionType,
      collectionTitle: seasonLabel || 'Season 1',
      libraryPath: [kindConfig.rootLabel, showTitle],
      description
    }
  }

  if (packageKind === 'graphic_novel') {
    const seriesLabel = seriesTitle || title || 'Untitled graphic novel'
    return {
      packageKind,
      collectionType: kindConfig.collectionType,
      collectionTitle: title || 'Volume 1',
      libraryPath: [kindConfig.rootLabel, seriesLabel],
      description
    }
  }

  return {
    packageKind,
    collectionType: kindConfig.collectionType,
    collectionTitle: title || 'Untitled package',
    libraryPath: [kindConfig.rootLabel],
    description
  }
}

function serializeFollowInvite(invite) {
  return `${FOLLOW_INVITE_PREFIX}${Buffer.from(stableStringify(invite)).toString('base64url')}`
}

function parseFollowInviteToken(token) {
  const trimmed = String(token || '').trim()
  if (!trimmed) throw new Error('Invite is required.')
  if (!trimmed.startsWith(FOLLOW_INVITE_PREFIX)) throw new Error('Invite must start with yolk-follow:.')
  let invite = null
  try {
    invite = JSON.parse(Buffer.from(trimmed.slice(FOLLOW_INVITE_PREFIX.length), 'base64url').toString('utf8'))
  } catch {
    throw new Error('Invite could not be decoded.')
  }
  if (!invite || invite.kind !== 'follow-invite' || invite.version !== 1) throw new Error('Invite format is not recognized.')
  if (!invite.accountId || !invite.signature) throw new Error('Invite is incomplete.')
  if (!verifyRecord(invite.accountId, invite)) throw new Error('Invite signature is invalid.')
  return {
    ...invite,
    rendezvousHints: normalizePeerHints(invite.rendezvousHints)
  }
}

export class AppService {
  constructor(options = {}) {
    this.baseDir = options.baseDir || path.join(os.tmpdir(), 'yolk-app-service')
    this.sampleMediaDir = options.sampleMediaDir || path.join(process.cwd(), 'sample media')
    this.seedDemo = options.seedDemo === true
    this.advertiseHosts = parseAdvertiseHosts(options.advertiseHosts || process.env.YOLK_ADVERTISE_HOSTS)
    this.includeLanHints = options.includeLanHints !== false
    this.includeLoopbackHints = options.includeLoopbackHints !== false
    this.enableLanDiscovery = options.enableLanDiscovery !== false
    this.enableNatTraversal = options.enableNatTraversal !== false
    this.enableTrackers = options.enableTrackers === true
    this.clientsDir = path.join(this.baseDir, 'clients')
    this.demoDir = path.join(this.baseDir, 'demo')
    this.demoAccountsFile = path.join(this.baseDir, 'demo-accounts.json')
    this.bootstrap = null
    this.demoRuntime = null
    this.demoAccounts = {}
    this.sessions = new Map()
    this.knownAccounts = new Set()
  }

  static async create(options = {}) {
    const service = new AppService(options)
    await service.start()
    return service
  }

  async start() {
    await fs.mkdir(this.baseDir, { recursive: true })
    await fs.mkdir(this.clientsDir, { recursive: true })
    this.knownAccounts = new Set()
    this.sessions = new Map()
    this.bootstrap = await createBootstrapNode()
    this.demoAccounts = {}
    if (this.seedDemo) {
      this.demoRuntime = await P2PRuntime.create({
        name: 'demo',
        baseDir: this.demoDir,
        bootstrap: [`127.0.0.1:${this.bootstrap.address.port}`],
        enableLanDiscovery: this.enableLanDiscovery,
        enableNatTraversal: this.enableNatTraversal,
        enableTrackers: this.enableTrackers
      })
      await this.ensureDemoNetwork()
    }
  }

  async destroy() {
    for (const session of this.sessions.values()) await session.runtime.destroy()
    if (this.demoRuntime) await this.demoRuntime.destroy()
    if (this.bootstrap) await this.bootstrap.destroy()
  }

  async ensureDemoNetwork() {
    const existing = await fs.readFile(this.demoAccountsFile, 'utf8').then(JSON.parse).catch(() => null)
    if (existing?.version === DEMO_NETWORK_VERSION && existing?.sol && existing?.noor) {
      let hasCanonicalPackages = true
      for (const accountId of [existing.sol, existing.noor]) {
        const resolvedProfile = await this.demoRuntime.resolveProfile(accountId).catch(() => null)
        const collectionRefs = resolvedProfile?.state?.collectionRefs || []
        if (!resolvedProfile || !collectionRefs.length) {
          hasCanonicalPackages = false
          break
        }
        for (const collectionRef of collectionRefs) {
          const resolvedCollection = await this.demoRuntime.resolveCollection(collectionRef).catch(() => null)
          if (!resolvedCollection?.collection?.packageKind) {
            hasCanonicalPackages = false
            break
          }
        }
        if (!hasCanonicalPackages) break
      }
      if (hasCanonicalPackages) {
        this.demoAccounts = { sol: existing.sol, noor: existing.noor }
        this.knownAccounts.add(existing.sol)
        this.knownAccounts.add(existing.noor)
        return
      }
      await this.demoRuntime.destroy()
      await fs.rm(this.demoDir, { recursive: true, force: true })
      await fs.rm(this.demoAccountsFile, { force: true })
      this.demoRuntime = await P2PRuntime.create({
        name: 'demo',
        baseDir: this.demoDir,
        bootstrap: [`127.0.0.1:${this.bootstrap.address.port}`],
        enableLanDiscovery: this.enableLanDiscovery,
        enableNatTraversal: this.enableNatTraversal,
        enableTrackers: this.enableTrackers
      })
    }

    const sol = await this.demoRuntime.createAccount({
      username: 'sol',
      displayName: 'Sol Mercer',
      bio: 'Field recorder, image maker, and long-form release designer.'
    })
    const noor = await this.demoRuntime.createAccount({
      username: 'noor',
      displayName: 'Noor Vale',
      bio: 'Curator of late-night signal trails and shared scene notes.'
    })

    const sampleMedia = await Promise.all(SAMPLE_MEDIA_FIXTURES.map(async fixture => {
      const filePath = path.join(this.sampleMediaDir, fixture.fileName)
      const data = await fs.readFile(filePath)
      return {
        ...fixture,
        data
      }
    }))

    const amberFixture = sampleMedia.find(item => item.title === 'Amber Lines')
    const openLightFixture = sampleMedia.find(item => item.title === 'Open Light')
    const nightFixture = sampleMedia.find(item => item.title === 'Night Transit')
    const bloomFixture = sampleMedia.find(item => item.title === 'Signal Bloom')

    const amber = await this.demoRuntime.publishMedia(sol.accountId, {
      title: amberFixture.title,
      description: amberFixture.description,
      mediaType: amberFixture.mediaType,
      fileName: amberFixture.fileName,
      data: amberFixture.data
    })
    const openLight = await this.demoRuntime.publishMedia(sol.accountId, {
      title: openLightFixture.title,
      description: openLightFixture.description,
      mediaType: openLightFixture.mediaType,
      fileName: openLightFixture.fileName,
      data: openLightFixture.data
    })
    await this.demoRuntime.publishCollection(sol.accountId, {
      title: 'Harbor Studies',
      type: 'gallery',
      packageKind: 'art',
      libraryPath: ['Art'],
      description: "Sol's still-image release from the harbor run at dusk.",
      isCurated: false,
      children: [
        { kind: 'media', ref: amber.mediaRef }
      ]
    })
    await this.demoRuntime.publishCollection(sol.accountId, {
      title: 'Open Light',
      type: 'album',
      packageKind: 'album',
      libraryPath: ['Music'],
      description: "Sol's late-night single packaged for playback.",
      isCurated: false,
      children: [
        { kind: 'media', ref: openLight.mediaRef }
      ]
    })

    const night = await this.demoRuntime.publishMedia(noor.accountId, {
      title: nightFixture.title,
      description: nightFixture.description,
      mediaType: nightFixture.mediaType,
      fileName: nightFixture.fileName,
      data: nightFixture.data
    })
    const bloom = await this.demoRuntime.publishMedia(noor.accountId, {
      title: bloomFixture.title,
      description: bloomFixture.description,
      mediaType: bloomFixture.mediaType,
      fileName: bloomFixture.fileName,
      data: bloomFixture.data
    })
    await this.demoRuntime.publishCollection(noor.accountId, {
      title: 'Night Transit',
      type: 'movie',
      packageKind: 'movie',
      libraryPath: ['Movies'],
      description: "Noor's night-run film package with its companion still.",
      isCurated: false,
      children: [
        { kind: 'media', ref: night.mediaRef },
        { kind: 'media', ref: bloom.mediaRef }
      ]
    })
    await this.demoRuntime.publishFollow(noor.accountId, sol.accountId)

    this.demoAccounts = { sol: sol.accountId, noor: noor.accountId }
    this.knownAccounts.add(sol.accountId)
    this.knownAccounts.add(noor.accountId)
    await fs.writeFile(this.demoAccountsFile, JSON.stringify({ version: DEMO_NETWORK_VERSION, ...this.demoAccounts }, null, 2))
  }

  sessionFileFor(clientId) {
    return path.join(this.clientsDir, clientId, 'session.json')
  }

  async readSessionState(clientId) {
    const sessionFile = this.sessionFileFor(clientId)
    const existing = await fs.readFile(sessionFile, 'utf8').then(JSON.parse).catch(() => null)
    return existing
      ? {
          currentAccountId: existing.currentAccountId || null,
          transport: {
            ...transportDefaults(),
            ...(existing.transport && typeof existing.transport === 'object' ? existing.transport : {}),
            dhtPort: Number(existing.transport?.dhtPort || 0) || 0,
            peerHintsByAccountId: existing.transport?.peerHintsByAccountId && typeof existing.transport.peerHintsByAccountId === 'object'
              ? Object.fromEntries(Object.entries(existing.transport.peerHintsByAccountId).map(([accountId, hints]) => [accountId, normalizePeerHints(hints)]))
              : {}
          },
          ui: {
            ...uiDefaults(),
            ...existing.ui,
            discoverQuery: typeof existing.ui?.discoverQuery === 'string' ? existing.ui.discoverQuery : '',
            collectionDraftChildRefs: Array.isArray(existing.ui?.collectionDraftChildRefs) ? existing.ui.collectionDraftChildRefs : [],
            savedCollectionRefs: Array.isArray(existing.ui?.savedCollectionRefs) ? existing.ui.savedCollectionRefs : [],
            savedCollectionPackages: existing.ui?.savedCollectionPackages && typeof existing.ui.savedCollectionPackages === 'object' ? existing.ui.savedCollectionPackages : {},
            savedMediaRefs: Array.isArray(existing.ui?.savedMediaRefs) ? existing.ui.savedMediaRefs : []
          }
        }
      : null
  }

  async saveSession(clientId, session) {
    const sessionFile = this.sessionFileFor(clientId)
    await fs.mkdir(path.dirname(sessionFile), { recursive: true })
    await fs.writeFile(sessionFile, JSON.stringify({
      currentAccountId: session.currentAccountId || null,
      transport: session.transport || transportDefaults(),
      ui: session.ui
    }, null, 2))
  }

  bootstrapEntriesForTransport(transport) {
    const localBootstrap = this.bootstrap?.address?.port ? [`127.0.0.1:${this.bootstrap.address.port}`] : []
    const peerBootstrap = Object.values(transport?.peerHintsByAccountId || {})
      .flatMap(hints => orderPeerHints(hints).slice(0, 4))
      .map(hint => `${hint.host}:${hint.port}`)
    return [...new Set([...localBootstrap, ...peerBootstrap])]
  }

  async createSessionRuntime(clientId, transport) {
    const options = {
      name: `client-${clientId}`,
      baseDir: path.join(this.clientsDir, clientId),
      bootstrap: this.bootstrapEntriesForTransport(transport),
      dhtPort: transport?.dhtPort || 0,
      enableLanDiscovery: this.enableLanDiscovery,
      enableNatTraversal: this.enableNatTraversal,
      enableTrackers: this.enableTrackers
    }
    try {
      return await P2PRuntime.create(options)
    } catch (error) {
      if (options.dhtPort && error?.code === 'EADDRINUSE') {
        return P2PRuntime.create({
          ...options,
          dhtPort: 0
        })
      }
      throw error
    }
  }

  async restartSessionRuntime(clientId, session) {
    const currentAccountId = session.currentAccountId
    const ui = session.ui
    if (session.runtime) await session.runtime.destroy()
    session.runtime = await this.createSessionRuntime(clientId, session.transport)
    session.currentAccountId = currentAccountId
    session.ui = ui
    const dhtAddress = session.runtime.getDhtAddress()
    if (dhtAddress?.port) session.transport.dhtPort = dhtAddress.port
    this.sessions.set(clientId, session)
    session.transportDirty = false
    await this.saveSession(clientId, session)
    return session
  }

  async getSession(clientId) {
    if (this.sessions.has(clientId)) {
      const existing = this.sessions.get(clientId)
      if (existing?.runtime?.client && existing?.runtime?.dht) return existing
      return this.restartSessionRuntime(clientId, existing)
    }
    const persisted = await this.readSessionState(clientId)
    const transport = persisted?.transport || transportDefaults()
    const runtime = await this.createSessionRuntime(clientId, transport)
    const accountIds = Object.keys(runtime.accounts)
    const session = {
      runtime,
      transport,
      ui: persisted?.ui || {
        ...uiDefaults(),
        selectedProfileAccountId: accountIds[0] || null
      },
      currentAccountId: persisted?.currentAccountId || accountIds[0] || null
    }
    const dhtAddress = runtime.getDhtAddress()
    if (dhtAddress?.port) session.transport.dhtPort = dhtAddress.port
    if (!session.ui.selectedProfileAccountId) session.ui.selectedProfileAccountId = session.currentAccountId
    if (session.currentAccountId) this.knownAccounts.add(session.currentAccountId)
    this.sessions.set(clientId, session)
    session.transportDirty = false
    await this.saveSession(clientId, session)
    return session
  }

  async rememberAccount(accountId) {
    if (accountId) this.knownAccounts.add(accountId)
  }

  collectLocalRendezvousHints(session) {
    const port = Number(session?.runtime?.getDhtAddress?.()?.port || session?.transport?.dhtPort || 0)
    if (!port) return []
    const hints = []

    for (const host of this.advertiseHosts) {
      hints.push({ host, port, scope: 'manual' })
    }

    if (this.includeLanHints) {
      const interfaces = os.networkInterfaces()
      for (const entries of Object.values(interfaces)) {
        for (const entry of entries || []) {
          if (!entry || entry.internal || entry.family !== 'IPv4') continue
          hints.push({ host: entry.address, port, scope: 'lan' })
        }
      }
    }

    if (this.includeLoopbackHints) hints.push({ host: '127.0.0.1', port, scope: 'loopback' })
    return normalizePeerHints(hints)
  }

  mergePeerHintsForAccount(session, accountId, hints, metadata = {}) {
    if (!session?.transport || !accountId) return false
    const existing = normalizePeerHints(session.transport.peerHintsByAccountId[accountId])
    const next = normalizePeerHints([
      ...existing,
      ...normalizePeerHints(hints).map(hint => ({
        ...hint,
        ...metadata
      }))
    ])
    const existingSerialized = stableStringify(orderPeerHints(existing))
    const nextSerialized = stableStringify(orderPeerHints(next))
    if (existingSerialized === nextSerialized) return false
    session.transport.peerHintsByAccountId[accountId] = orderPeerHints(next)
    session.transportDirty = true
    return true
  }

  markPeerHintsAttempt(session, accountId, status) {
    if (!session?.transport || !accountId) return false
    const existing = normalizePeerHints(session.transport.peerHintsByAccountId[accountId])
    if (!existing.length) return false
    const timestamp = new Date().toISOString()
    const next = existing.map(hint => {
      if (status === 'success') {
        return {
          ...hint,
          lastTriedAt: timestamp,
          lastSucceededAt: timestamp,
          failureCount: 0
        }
      }
      return {
        ...hint,
        lastTriedAt: timestamp,
        lastFailedAt: timestamp,
        failureCount: (Number(hint.failureCount || 0) || 0) + 1
      }
    })
    const existingSerialized = stableStringify(orderPeerHints(existing))
    const nextSerialized = stableStringify(orderPeerHints(next))
    if (existingSerialized === nextSerialized) return false
    session.transport.peerHintsByAccountId[accountId] = orderPeerHints(next)
    session.transportDirty = true
    return true
  }

  async resolveProfileWithRetry(runtime, accountId, session = null, attempts = 10, delayMs = 120) {
    let lastResolved = null
    for (let index = 0; index < attempts; index += 1) {
      lastResolved = await runtime.resolveProfile(accountId).catch(() => null)
      if (lastResolved) {
        if (session) this.markPeerHintsAttempt(session, accountId, 'success')
        return lastResolved
      }
      if (index < attempts - 1) await wait(delayMs)
    }
    if (session) this.markPeerHintsAttempt(session, accountId, 'failure')
    return lastResolved
  }

  readerFor(accountId, preferredRuntime) {
    if (preferredRuntime?.accounts?.[accountId]) return preferredRuntime
    if (this.demoRuntime?.accounts?.[accountId]) return this.demoRuntime
    return preferredRuntime
  }

  async ensureSavedCollectionPackages(session) {
    let changed = false
    if (!session.ui.savedCollectionPackages || typeof session.ui.savedCollectionPackages !== 'object') {
      session.ui.savedCollectionPackages = {}
      changed = true
    }
    for (const collectionRef of session.ui.savedCollectionRefs) {
      if (session.ui.savedCollectionPackages[collectionRef]) continue
      session.ui.savedCollectionPackages[collectionRef] = await this.collectCollectionPackage(session.runtime, collectionRef)
      changed = true
    }
    return changed
  }

  async collectReachableProfiles(runtime, rootAccountId, session = null) {
    if (!rootAccountId) return []
    const queue = [{ accountId: rootAccountId, depth: 0 }]
    const queued = new Set([rootAccountId])
    const discovered = new Map()

    while (queue.length) {
      const { accountId, depth } = queue.shift()
      queued.delete(accountId)
      if (!accountId || discovered.has(accountId)) continue
      const reader = this.readerFor(accountId, runtime)
      const resolved = reader === runtime
        ? await this.resolveProfileWithRetry(runtime, accountId, session).catch(() => null)
        : await reader.resolveProfile(accountId).catch(() => null)
      if (!resolved) continue
      this.knownAccounts.add(accountId)
      discovered.set(accountId, { accountId, depth, reader, resolved })

      for (const followRef of resolved.state.followRefs) {
        const follow = await reader.resolveFollow(followRef).catch(() => null)
        const followedAccountId = follow?.follow?.followedAccountId
        if (!followedAccountId || discovered.has(followedAccountId) || queued.has(followedAccountId)) continue
        queue.push({ accountId: followedAccountId, depth: depth + 1 })
        queued.add(followedAccountId)
      }
    }

    return [...discovered.values()]
  }

  async directFollowedAccountIds(runtime, accountId) {
    if (!accountId) return new Set()
    const reader = this.readerFor(accountId, runtime)
    const resolved = await reader.resolveProfile(accountId).catch(() => null)
    const followed = new Set()
    if (!resolved) return followed
    for (const followRef of resolved.state.followRefs) {
      const follow = await reader.resolveFollow(followRef).catch(() => null)
      if (follow?.follow?.followedAccountId) followed.add(follow.follow.followedAccountId)
    }
    return followed
  }

  async searchKnownProfiles(runtime, rootAccountId, query, session = null) {
    if (!rootAccountId) return []
    const trimmed = String(query || '').trim()
    const lower = trimmed.toLowerCase()
    const results = new Map()

    for (const entry of await this.collectReachableProfiles(runtime, rootAccountId, session)) {
      results.set(entry.accountId, {
        accountId: entry.accountId,
        username: entry.resolved.profile.username,
        displayName: entry.resolved.profile.displayName,
        verified: entry.resolved.verified
      })
    }

    return [...results.values()]
      .filter(item => !lower
        || item.username.toLowerCase().includes(lower)
        || item.displayName.toLowerCase().includes(lower)
        || item.accountId.toLowerCase().includes(lower))
      .sort((left, right) => left.username.localeCompare(right.username) || left.displayName.localeCompare(right.displayName))
  }

  async buildNetworkStats(runtime, rootAccountId, session = null) {
    const profiles = await this.collectReachableProfiles(runtime, rootAccountId, session)
    const mediaRefs = new Set()
    const collectionRefs = new Set()
    const keepRefs = new Set()
    const followRefs = new Set()

    for (const entry of profiles) {
      entry.resolved.state.mediaRefs.forEach(ref => mediaRefs.add(ref))
      entry.resolved.state.collectionRefs.forEach(ref => collectionRefs.add(ref))
      entry.resolved.state.keepRefs.forEach(ref => keepRefs.add(ref))
      entry.resolved.state.followRefs.forEach(ref => followRefs.add(ref))
    }

    return {
      accounts: profiles.length,
      media: mediaRefs.size,
      collections: collectionRefs.size,
      keeps: keepRefs.size,
      follows: followRefs.size
    }
  }

  async buildFeedItem(runtime, actorId, actor, activity) {
    const base = {
      id: `${actorId}:${activity.kind}:${activity.createdAt}:${activity.subjectRef}`,
      actorAccountId: actorId,
      actorUsername: actor.profile.username,
      createdAt: activity.createdAt
    }
    const reader = this.readerFor(actorId, runtime)

    if (activity.kind === 'collection') {
      const post = await this.resolveCollectionSummary(reader, activity.subjectRef, actor.profile.username).catch(() => null)
      if (post) {
        return {
          ...base,
          kind: 'post',
          subjectTitle: post.title,
          summary: activity.summary || post.description || `${post.isCurated ? 'Curated' : 'Original'} ${post.type}`,
          collectionRef: activity.subjectRef,
          post
        }
      }
    }

    if (activity.kind === 'upload') {
      const resolvedMedia = await reader.resolveMedia(activity.subjectRef).catch(() => null)
      return {
        ...base,
        kind: 'upload',
        subjectTitle: resolvedMedia?.media?.title || activity.subjectTitle || 'Upload',
        summary: activity.summary || resolvedMedia?.media?.description || 'Published media'
      }
    }

    if (activity.kind === 'keep') {
      const resolvedKeep = await reader.resolveKeep(activity.subjectRef).catch(() => null)
      const resolvedMedia = resolvedKeep?.keep?.mediaRef
        ? await reader.resolveMedia(resolvedKeep.keep.mediaRef).catch(() => null)
        : null
      return {
        ...base,
        kind: 'keep',
        subjectTitle: resolvedMedia?.media?.title || activity.subjectTitle || 'Keep',
        summary: activity.summary || 'Downloaded and seeding.'
      }
    }

    if (activity.kind === 'follow') {
      const resolvedFollow = await reader.resolveFollow(activity.subjectRef).catch(() => null)
      const followedAccountId = resolvedFollow?.follow?.followedAccountId || null
      if (followedAccountId) this.knownAccounts.add(followedAccountId)
      const followedProfile = followedAccountId
        ? await this.readerFor(followedAccountId, runtime).resolveProfile(followedAccountId).catch(() => null)
        : null
      return {
        ...base,
        kind: 'follow',
        subjectTitle: followedProfile?.profile?.username || activity.subjectTitle || 'Follow',
        summary: activity.summary || `Followed ${followedProfile?.profile?.username || 'account'}`
      }
    }

    if (activity.kind === 'profile') {
      return {
        ...base,
        kind: 'profile',
        subjectTitle: activity.subjectTitle || actor.profile.displayName,
        summary: activity.summary || 'Updated profile'
      }
    }

    return {
      ...base,
      kind: activity.kind,
      subjectTitle: activity.subjectTitle || activity.kind,
      summary: activity.summary || activity.kind
    }
  }

  async resolveCollectionSummary(runtime, collectionRef, creatorUsernameOverride = null) {
    const { collection } = await runtime.resolveCollection(collectionRef)
    const creatorRuntime = this.readerFor(collection.creatorAccountId, runtime)
    const creatorProfile = await creatorRuntime.resolveProfile(collection.creatorAccountId)
    const children = []
    const childCreatorUsernames = []
    let firstMediaRef = collection.coverMediaRef || null
    for (const child of collection.children) {
      if (child.kind === 'media') {
        const mediaRuntime = this.readerFor(collection.creatorAccountId, runtime)
        const { media } = await mediaRuntime.resolveMedia(child.ref)
        const profile = await this.readerFor(media.creatorAccountId, runtime).resolveProfile(media.creatorAccountId)
        if (!firstMediaRef) firstMediaRef = child.ref
        childCreatorUsernames.push(profile.profile.username)
        children.push({
          kind: 'media',
          id: media.id,
          ref: child.ref,
          title: media.title,
          mediaType: media.mediaType,
          creatorAccountId: media.creatorAccountId,
          creatorUsername: profile.profile.username,
          description: media.description,
          contentRef: media.contentRef,
          thumbnailRef: null
        })
      } else {
        const nestedRuntime = this.readerFor(collection.creatorAccountId, runtime)
        const nested = await nestedRuntime.resolveCollection(child.ref)
        const profile = await this.readerFor(nested.collection.creatorAccountId, runtime).resolveProfile(nested.collection.creatorAccountId)
        childCreatorUsernames.push(profile.profile.username)
        children.push({
          kind: 'collection',
          id: nested.collection.id,
          ref: child.ref,
          title: nested.collection.title,
          mediaType: 'collection',
          creatorAccountId: nested.collection.creatorAccountId,
          creatorUsername: profile.profile.username,
          description: nested.collection.description,
          contentRef: '',
          thumbnailRef: null
        })
      }
    }
    return {
      sourceKind: 'collection',
      id: collection.id,
      ref: collectionRef,
      title: collection.title,
      type: collection.type,
      packageKind: collection.packageKind || null,
      libraryPath: normalizeLibraryPath(collection.libraryPath, []),
      isCurated: collection.isCurated,
      description: collection.description,
      coverMediaRef: firstMediaRef,
      creatorUsername: creatorUsernameOverride || creatorProfile.profile.username,
      childCreatorUsernames: [...new Set(childCreatorUsernames)],
      children,
      updatedAt: collection.updatedAt
    }
  }

  async resolveProfileSummary(runtime, accountId, session = null) {
    if (!accountId) return null
    const reader = this.readerFor(accountId, runtime)
    const resolved = reader === runtime
      ? await this.resolveProfileWithRetry(runtime, accountId, session)
      : await reader.resolveProfile(accountId)
    const uploads = []
    for (const mediaRef of [...resolved.state.mediaRefs].reverse()) {
      const { media } = await reader.resolveMedia(mediaRef)
      uploads.push({
        id: media.id,
        ref: mediaRef,
        title: media.title,
        mediaType: media.mediaType,
        creatorAccountId: media.creatorAccountId,
        contentRef: media.contentRef,
        thumbnailRef: null
      })
    }
    const collections = []
    for (const collectionRef of [...resolved.state.collectionRefs].reverse()) {
      collections.push(await this.resolveCollectionSummary(reader, collectionRef, resolved.profile.username))
    }
    return {
      accountId,
      username: resolved.profile.username,
      displayName: resolved.profile.displayName,
      bio: resolved.profile.bio,
      verified: resolved.verified,
      uploads,
      collections
    }
  }

  async buildLibrary(runtime, accountId, savedCollectionRefs = []) {
    if (!accountId) return { keptCount: 0, keptTitles: [], keptMedia: [], items: [], collections: [] }
    const resolved = await runtime.resolveProfile(accountId)
    const keptMedia = []
    const items = []
    const collections = []
    const seenCollectionRefs = new Set()
    const seenLooseMediaRefs = new Set()

    for (const collectionRef of [...resolved.state.collectionRefs].reverse()) {
      const summary = await this.resolveCollectionSummary(runtime, collectionRef, resolved.profile.username)
      seenCollectionRefs.add(collectionRef)
      collections.push({ ...summary, owned: true, liked: false })
      items.push({
        id: summary.id,
        ref: collectionRef,
        kind: 'collection',
        title: summary.title,
        mediaType: 'folder',
        creatorAccountId: accountId,
        creatorUsername: resolved.profile.username,
        description: summary.description,
        contentRef: '',
        thumbnailRef: null,
        coverRef: summary.coverMediaRef,
        childCount: summary.children.length,
        saved: false,
        owned: true,
        updatedAt: summary.updatedAt
      })
    }

    for (const collectionRef of savedCollectionRefs) {
      if (seenCollectionRefs.has(collectionRef)) continue
      const summary = await this.resolveCollectionSummary(runtime, collectionRef).catch(() => null)
      if (!summary) continue
      seenCollectionRefs.add(collectionRef)
      collections.push({ ...summary, owned: false, liked: true })
      items.push({
        id: summary.id,
        ref: collectionRef,
        kind: 'collection',
        title: summary.title,
        mediaType: 'folder',
        creatorAccountId: summary.children[0]?.creatorAccountId || summary.id,
        creatorUsername: summary.creatorUsername,
        description: summary.description,
        contentRef: '',
        thumbnailRef: null,
        coverRef: summary.coverMediaRef,
        childCount: summary.children.length,
        saved: true,
        owned: false,
        updatedAt: summary.updatedAt
      })
      for (const child of summary.children) {
        if (child.kind === 'media' && child.ref) seenLooseMediaRefs.add(child.ref)
      }
    }

    for (const keepRef of [...resolved.state.keepRefs].reverse()) {
      const { keep } = await runtime.resolveKeep(keepRef)
      const { media } = await runtime.resolveMedia(keep.mediaRef)
      const profile = await this.readerFor(media.creatorAccountId, runtime).resolveProfile(media.creatorAccountId)
      keptMedia.push({
        id: media.id,
        ref: keep.mediaRef,
        kind: 'media',
        title: media.title,
        mediaType: media.mediaType,
        creatorAccountId: media.creatorAccountId,
        creatorUsername: profile.profile.username,
        description: media.description,
        contentRef: media.contentRef,
        thumbnailRef: null,
        saved: true,
        owned: media.creatorAccountId === accountId,
        updatedAt: keep.createdAt
      })
      if (seenLooseMediaRefs.has(keep.mediaRef)) continue
      seenLooseMediaRefs.add(keep.mediaRef)
      const summary = {
        sourceKind: 'media',
        id: `saved-${media.id}`,
        ref: keep.mediaRef,
        title: media.title,
        type: media.mediaType,
        isCurated: false,
        description: media.description,
        coverMediaRef: media.mediaType === 'image' || media.mediaType === 'video' ? keep.mediaRef : null,
        creatorUsername: profile.profile.username,
        childCreatorUsernames: [profile.profile.username],
        liked: true,
        owned: false,
        children: [{
          kind: 'media',
          id: media.id,
          ref: keep.mediaRef,
          title: media.title,
          mediaType: media.mediaType,
          creatorAccountId: media.creatorAccountId,
          creatorUsername: profile.profile.username,
          description: media.description,
          contentRef: media.contentRef,
          thumbnailRef: null
        }],
        updatedAt: keep.createdAt
      }
      collections.push(summary)
      items.push({
        id: summary.id,
        ref: keep.mediaRef,
        kind: 'collection',
        title: summary.title,
        mediaType: 'folder',
        creatorAccountId: media.creatorAccountId,
        creatorUsername: profile.profile.username,
        description: summary.description,
        contentRef: '',
        thumbnailRef: null,
        coverRef: summary.coverMediaRef,
        childCount: 1,
        saved: true,
        owned: false,
        updatedAt: summary.updatedAt
      })
    }

    collections.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    return {
      keptCount: keptMedia.length,
      keptTitles: keptMedia.map(item => item.title),
      keptMedia,
      items,
      collections
    }
  }

  async buildFeed(runtime, accountId, session = null) {
    if (!accountId) return []
    const actors = (await this.collectReachableProfiles(runtime, accountId, session)).filter(entry => entry.depth > 0)
    const items = []
    for (const actor of actors) {
      const packagedMediaRefs = new Set()
      for (const collectionRef of actor.resolved.state.collectionRefs || []) {
        const resolvedCollection = await actor.reader.resolveCollection(collectionRef).catch(() => null)
        if (!resolvedCollection?.collection?.packageKind) continue
        for (const child of resolvedCollection.collection.children || []) {
          if (child.kind === 'media' && child.ref) packagedMediaRefs.add(child.ref)
        }
      }
      for (const activity of [...actor.resolved.state.activities].reverse()) {
        if (activity.kind !== 'collection') continue
        if (activity.kind === 'upload' && packagedMediaRefs.has(activity.subjectRef)) continue
        const item = await this.buildFeedItem(runtime, actor.accountId, actor.resolved, activity)
        if (item) items.push(item)
      }
    }
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async buildSuggestions(runtime, currentAccountId, session = null) {
    if (!currentAccountId) return []
    const followed = await this.directFollowedAccountIds(runtime, currentAccountId)
    return (await this.collectReachableProfiles(runtime, currentAccountId, session))
      .filter(entry => entry.depth >= 2)
      .map(entry => ({
        accountId: entry.accountId,
        username: entry.resolved.profile.username,
        displayName: entry.resolved.profile.displayName,
        verified: entry.resolved.verified
      }))
      .filter(item => item.accountId !== currentAccountId && !followed.has(item.accountId))
      .sort((left, right) => left.username.localeCompare(right.username) || left.displayName.localeCompare(right.displayName))
      .slice(0, 4)
  }

  async buildShelf(runtime, rootAccountId, session = null) {
    const shelf = []
    for (const entry of await this.collectReachableProfiles(runtime, rootAccountId, session)) {
      for (const mediaRef of [...entry.resolved.state.mediaRefs].reverse()) {
        const { media } = await entry.reader.resolveMedia(mediaRef)
        shelf.push({
          id: media.id,
          ref: mediaRef,
          title: media.title,
          mediaType: media.mediaType,
          creatorAccountId: media.creatorAccountId,
          creatorUsername: entry.resolved.profile.username,
          description: media.description,
          contentRef: media.contentRef,
          thumbnailRef: null
        })
      }
    }
    return shelf
  }

  async buildFollowInvite(session, accountId) {
    if (!accountId || !session?.runtime?.accounts?.[accountId]) return ''
    const account = session.runtime.accounts[accountId]
    const resolved = await session.runtime.resolveProfile(accountId).catch(() => null)
    if (!resolved) return ''
    const invite = {
      version: 1,
      kind: 'follow-invite',
      accountId,
      username: resolved.profile.username,
      displayName: resolved.profile.displayName,
      issuedAt: resolved.profile.updatedAt,
      rendezvousHints: this.collectLocalRendezvousHints(session)
    }
    return serializeFollowInvite({
      ...invite,
      signature: signRecord(account.secretKeyHex, invite)
    })
  }

  async buildSnapshot(clientId) {
    const session = await this.getSession(clientId)
    session.transportDirty = false
    if (await this.ensureSavedCollectionPackages(session)) await this.saveSession(clientId, session)
    const currentAccountId = session.currentAccountId
    const currentProfile = currentAccountId ? await session.runtime.resolveProfile(currentAccountId) : null
    const selectedAccountId = session.ui.selectedProfileAccountId || currentAccountId
    const selectedReader = selectedAccountId ? this.readerFor(selectedAccountId, session.runtime) : null
    const selectedResolved = selectedAccountId
      ? await this.resolveProfileWithRetry(selectedReader, selectedAccountId, selectedReader === session.runtime ? session : null).catch(() => null)
      : null
    const selectedProfile = await this.resolveProfileSummary(session.runtime, selectedAccountId, session)
    if (selectedProfile) {
      selectedProfile.collections = selectedProfile.collections.map(item => ({
        ...item,
        liked: Boolean(item.ref && session.ui.savedCollectionRefs.includes(item.ref)),
        owned: selectedProfile.accountId === currentAccountId
      }))
    }
    const feed = (await this.buildFeed(session.runtime, currentAccountId, session)).map(item => item.post && item.collectionRef
      ? {
          ...item,
          post: {
            ...item.post,
            liked: session.ui.savedCollectionRefs.includes(item.collectionRef),
            owned: item.actorAccountId === currentAccountId
          }
        }
      : item)
    const snapshot = {
      currentAccount: currentProfile ? {
        accountId: currentAccountId,
        username: currentProfile.profile.username,
        displayName: currentProfile.profile.displayName
      } : null,
      activeSection: session.ui.activeSection,
      discoverQuery: session.ui.discoverQuery,
      followInvite: await this.buildFollowInvite(session, currentAccountId),
      selectedProfile,
      searchResults: session.ui.discoverQuery ? await this.searchKnownProfiles(session.runtime, currentAccountId, session.ui.discoverQuery, session) : [],
      feed,
      library: await this.buildLibrary(session.runtime, currentAccountId, session.ui.savedCollectionRefs),
      network: await this.buildNetworkStats(session.runtime, currentAccountId, session),
      trust: {
        selectedAccountId,
        selectedHeadSeq: selectedResolved?.head?.seq ?? null,
        selectedProfileRef: selectedResolved?.state?.profileRef ?? null,
        resolvedViaDhtHead: Boolean(selectedAccountId && !session.runtime.accounts?.[selectedAccountId] && !this.demoRuntime?.accounts?.[selectedAccountId]),
        verifiedProfile: Boolean(selectedResolved?.verified)
      },
      suggestions: await this.buildSuggestions(session.runtime, currentAccountId, session),
      draftChildren: await this.buildDraft(session.runtime, session.ui.collectionDraftChildRefs),
      shelfMedia: await this.buildShelf(session.runtime, currentAccountId, session),
      flashMessage: session.ui.flashMessage
    }
    if (session.transportDirty) {
      session.transportDirty = false
      await this.saveSession(clientId, session)
    }
    return snapshot
  }

  async resolveMediaAsset(clientId, mediaRef) {
    const session = await this.getSession(clientId)
    return session.runtime.materializeMedia(mediaRef, 'preview')
  }

  async createAccount(clientId, input) {
    const session = await this.getSession(clientId)
    const account = await session.runtime.createAccount(input)
    if (this.seedDemo && this.demoAccounts.noor) await session.runtime.publishFollow(account.accountId, this.demoAccounts.noor).catch(() => null)
    session.currentAccountId = account.accountId
    session.ui.selectedProfileAccountId = account.accountId
    session.ui.discoverQuery = ''
    session.ui.activeSection = 'discover'
    session.ui.flashMessage = ''
    await this.rememberAccount(account.accountId)
    await this.saveSession(clientId, session)
    return account
  }

  async openProfile(clientId, accountId) {
    const session = await this.getSession(clientId)
    await this.rememberAccount(accountId)
    await this.resolveProfileWithRetry(session.runtime, accountId, session)
    session.ui.selectedProfileAccountId = accountId
    session.ui.activeSection = 'profile'
    session.ui.discoverQuery = ''
    session.ui.flashMessage = ''
    await this.saveSession(clientId, session)
    return true
  }

  async searchProfiles(clientId, query) {
    const session = await this.getSession(clientId)
    session.ui.discoverQuery = String(query || '').trim()
    session.ui.flashMessage = ''
    const results = session.ui.discoverQuery ? await this.searchKnownProfiles(session.runtime, session.currentAccountId, session.ui.discoverQuery, session) : []
    for (const result of results) await this.rememberAccount(result.accountId)
    await this.saveSession(clientId, session)
    return results
  }

  async clearSearch(clientId) {
    const session = await this.getSession(clientId)
    session.ui.discoverQuery = ''
    await this.saveSession(clientId, session)
    return true
  }

  async setSection(clientId, section) {
    const session = await this.getSession(clientId)
    session.ui.activeSection = section
    session.ui.discoverQuery = ''
    await this.saveSession(clientId, session)
  }

  async dismissFlash(clientId) {
    const session = await this.getSession(clientId)
    session.ui.flashMessage = ''
    await this.saveSession(clientId, session)
  }

  async uploadMedia(clientId, input) {
    const session = await this.getSession(clientId)
    const result = await session.runtime.publishMedia(session.currentAccountId, input)
    session.ui.collectionDraftChildRefs = [...new Set([...session.ui.collectionDraftChildRefs, result.mediaRef])]
    session.ui.activeSection = 'upload'
    session.ui.flashMessage = 'Added to draft.'
    await this.saveSession(clientId, session)
    return result
  }

  async publishStructuredUpload(clientId, input) {
    const session = await this.getSession(clientId)
    const rows = Array.isArray(input?.rows) ? input.rows : []
    if (!rows.length) throw new Error('At least one upload row is required')

    const structured = canonicalPackageFromInput(input)
    const childRefs = []

    for (const row of rows) {
      const mediaResult = await session.runtime.publishMedia(session.currentAccountId, {
        title: String(row.title || '').trim() || String(row.fileName || '').trim() || 'Untitled media',
        description: String(row.description || '').trim(),
        mediaType: row.mediaType,
        fileName: row.fileName,
        data: Buffer.from(row.dataBase64, 'base64')
      })
      childRefs.push(mediaResult.mediaRef)
    }

    const collectionResult = await session.runtime.publishCollection(session.currentAccountId, {
      title: structured.collectionTitle,
      type: structured.collectionType,
      description: structured.description,
      isCurated: false,
      coverMediaRef: childRefs[0] || null,
      packageKind: structured.packageKind,
      libraryPath: structured.libraryPath,
      children: childRefs.map(ref => ({ kind: 'media', ref }))
    })

    session.ui.collectionDraftChildRefs = []
    session.ui.selectedProfileAccountId = session.currentAccountId
    session.ui.activeSection = 'library'
    session.ui.flashMessage = 'Uploaded and seeding.'
    await this.saveSession(clientId, session)
    return {
      collectionRef: collectionResult.collectionRef,
      mediaRefs: childRefs,
      libraryPath: structured.libraryPath,
      packageKind: structured.packageKind
    }
  }

  async createCollection(clientId, input) {
    const session = await this.getSession(clientId)
    const result = await session.runtime.publishCollection(session.currentAccountId, {
      ...input,
      coverMediaRef: input.coverMediaRef || null,
      children: input.childRefs.map(ref => ({ kind: 'media', ref }))
    })
    session.ui.collectionDraftChildRefs = []
    session.ui.selectedProfileAccountId = session.currentAccountId
    session.ui.activeSection = 'library'
    session.ui.flashMessage = 'Folder created.'
    await this.saveSession(clientId, session)
    return result
  }

  async keepMedia(clientId, mediaRef) {
    const session = await this.getSession(clientId)
    const result = await session.runtime.keepMedia(session.currentAccountId, mediaRef)
    session.ui.savedMediaRefs = [...new Set([mediaRef, ...session.ui.savedMediaRefs])]
    session.ui.flashMessage = 'Downloaded and seeding.'
    await this.saveSession(clientId, session)
    return result
  }

  async collectCollectionPackage(runtime, collectionRef, visited = new Set()) {
    if (visited.has(collectionRef)) return { mediaRefs: [], collectionRefs: [] }
    visited.add(collectionRef)
    const { collection } = await runtime.resolveCollection(collectionRef)
    const mediaRefs = []
    const collectionRefs = [collectionRef]
    for (const child of collection.children) {
      if (child.kind === 'media') mediaRefs.push(child.ref)
      else {
        const nested = await this.collectCollectionPackage(runtime, child.ref, visited)
        mediaRefs.push(...nested.mediaRefs)
        collectionRefs.push(...nested.collectionRefs)
      }
    }
    return {
      mediaRefs: [...new Set(mediaRefs)],
      collectionRefs: [...new Set(collectionRefs)]
    }
  }

  async keepCollection(clientId, collectionRef) {
    const session = await this.getSession(clientId)
    const packageRefs = await this.collectCollectionPackage(session.runtime, collectionRef)
    for (const nestedCollectionRef of packageRefs.collectionRefs) {
      await session.runtime.resolveCollection(nestedCollectionRef)
    }
    for (const mediaRef of packageRefs.mediaRefs) {
      await session.runtime.keepMedia(session.currentAccountId, mediaRef)
    }
    session.ui.savedCollectionRefs = [...new Set([collectionRef, ...session.ui.savedCollectionRefs])]
    session.ui.savedCollectionPackages[collectionRef] = packageRefs
    session.ui.flashMessage = packageRefs.mediaRefs.length || packageRefs.collectionRefs.length ? 'Downloaded and seeding.' : 'Nothing to download.'
    await this.saveSession(clientId, session)
    return { keptRefs: packageRefs.mediaRefs, keptCollectionRefs: packageRefs.collectionRefs }
  }

  async unkeepCollection(clientId, collectionRef) {
    const session = await this.getSession(clientId)
    if (await this.ensureSavedCollectionPackages(session)) await this.saveSession(clientId, session)
    const packageRefs = session.ui.savedCollectionPackages[collectionRef] || await this.collectCollectionPackage(session.runtime, collectionRef)
    const remainingPackages = Object.entries(session.ui.savedCollectionPackages)
      .filter(([ref]) => ref !== collectionRef)
      .map(([, value]) => value)
    const remainingMediaRefs = new Set(remainingPackages.flatMap(value => value.mediaRefs || []))
    const pinnedMediaRefs = new Set(session.ui.savedMediaRefs || [])
    const removableMediaRefs = packageRefs.mediaRefs.filter(mediaRef => !remainingMediaRefs.has(mediaRef) && !pinnedMediaRefs.has(mediaRef))

    for (const mediaRef of removableMediaRefs) {
      await session.runtime.removeKeep(session.currentAccountId, mediaRef)
    }

    session.ui.savedCollectionRefs = session.ui.savedCollectionRefs.filter(ref => ref !== collectionRef)
    delete session.ui.savedCollectionPackages[collectionRef]
    session.ui.flashMessage = 'Removed from library.'
    await this.saveSession(clientId, session)
    return {
      removed: true,
      removedMediaRefs: removableMediaRefs,
      removedCollectionRef: collectionRef
    }
  }

  async followAccount(clientId, accountId) {
    const session = await this.getSession(clientId)
    const followed = await this.directFollowedAccountIds(session.runtime, session.currentAccountId)
    if (accountId === session.currentAccountId || followed.has(accountId)) {
      session.ui.flashMessage = accountId === session.currentAccountId ? "You're already here." : 'Already in your network.'
      await this.saveSession(clientId, session)
      return false
    }
    await this.rememberAccount(accountId)
    const result = await session.runtime.publishFollow(session.currentAccountId, accountId)
    session.ui.flashMessage = 'Following.'
    await this.saveSession(clientId, session)
    return result
  }

  async importFollowInvite(clientId, token) {
    const session = await this.getSession(clientId)
    let invite = null
    try {
      if (!session.currentAccountId) throw new Error('Create an account before importing an invite.')
      invite = parseFollowInviteToken(token)
      if (invite.accountId === session.currentAccountId) throw new Error('You cannot import your own invite.')
      const followed = await this.directFollowedAccountIds(session.runtime, session.currentAccountId)
      if (followed.has(invite.accountId)) {
        session.ui.flashMessage = `Already following @${invite.username}.`
        await this.saveSession(clientId, session)
        return false
      }
      if (invite.rendezvousHints.length) {
        this.mergePeerHintsForAccount(session, invite.accountId, invite.rendezvousHints, {
          source: 'invite',
          lastImportedAt: new Date().toISOString()
        })
        await this.restartSessionRuntime(clientId, session)
      }
      await this.rememberAccount(invite.accountId)
      await session.runtime.publishFollow(session.currentAccountId, invite.accountId)
      const reachable = await this.resolveProfileWithRetry(session.runtime, invite.accountId, session)
      if (invite.rendezvousHints.length) {
        const timestamp = new Date().toISOString()
        session.transport.peerHintsByAccountId[invite.accountId] = orderPeerHints((session.transport.peerHintsByAccountId[invite.accountId] || []).map(hint => reachable
          ? {
              ...hint,
              lastTriedAt: timestamp,
              lastSucceededAt: timestamp,
              failureCount: 0
            }
          : {
              ...hint,
              lastTriedAt: timestamp,
              lastFailedAt: timestamp,
              failureCount: (Number(hint.failureCount || 0) || 0) + 1
            }))
      }
      session.ui.discoverQuery = ''
      session.ui.activeSection = 'discover'
      session.ui.flashMessage = reachable
        ? `Added @${invite.username} to your network.`
        : `Added @${invite.username}. Their device will appear when one of their shared addresses is reachable.`
      await this.saveSession(clientId, session)
      return {
        accountId: invite.accountId,
        username: invite.username,
        displayName: invite.displayName
      }
    } catch (error) {
      if (invite?.accountId && invite?.rendezvousHints?.length) {
        const timestamp = new Date().toISOString()
        session.transport.peerHintsByAccountId[invite.accountId] = orderPeerHints((session.transport.peerHintsByAccountId[invite.accountId] || []).map(hint => ({
          ...hint,
          lastTriedAt: timestamp,
          lastFailedAt: timestamp,
          failureCount: (Number(hint.failureCount || 0) || 0) + 1
        })))
      }
      session.ui.flashMessage = error instanceof Error ? error.message : 'Invite could not be imported.'
      await this.saveSession(clientId, session)
      return false
    }
  }

  async addDraftChild(clientId, mediaRef) {
    const session = await this.getSession(clientId)
    session.ui.collectionDraftChildRefs = [...new Set([...session.ui.collectionDraftChildRefs, mediaRef])]
    session.ui.flashMessage = 'Added to draft.'
    await this.saveSession(clientId, session)
  }

  async removeDraftChild(clientId, mediaRef) {
    const session = await this.getSession(clientId)
    session.ui.collectionDraftChildRefs = session.ui.collectionDraftChildRefs.filter(ref => ref !== mediaRef)
    await this.saveSession(clientId, session)
  }

  async moveDraftChild(clientId, mediaRef, direction) {
    const session = await this.getSession(clientId)
    const index = session.ui.collectionDraftChildRefs.indexOf(mediaRef)
    const swapIndex = direction === 'up' ? index - 1 : index + 1
    if (index < 0 || swapIndex < 0 || swapIndex >= session.ui.collectionDraftChildRefs.length) return
    const next = session.ui.collectionDraftChildRefs.slice()
    ;[next[index], next[swapIndex]] = [next[swapIndex], next[index]]
    session.ui.collectionDraftChildRefs = next
    await this.saveSession(clientId, session)
  }

  async resetDraft(clientId) {
    const session = await this.getSession(clientId)
    session.ui.collectionDraftChildRefs = []
    await this.saveSession(clientId, session)
  }
  async buildDraft(runtime, refs) {
    const items = []
    for (const ref of refs) {
      const { media } = await runtime.resolveMedia(ref)
      const profile = await this.readerFor(media.creatorAccountId, runtime).resolveProfile(media.creatorAccountId)
      items.push({
        id: media.id,
        ref,
        title: media.title,
        mediaType: media.mediaType,
        creatorAccountId: media.creatorAccountId,
        creatorUsername: profile.profile.username,
        description: media.description,
        contentRef: media.contentRef,
        thumbnailRef: null
      })
    }
    return items
  }
}
