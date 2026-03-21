import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { createBootstrapNode, P2PRuntime } from './p2p-runtime.mjs'

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

export class AppService {
  constructor(options = {}) {
    this.baseDir = options.baseDir || path.join(os.tmpdir(), 'yolk-app-service')
    this.sampleMediaDir = options.sampleMediaDir || path.join(process.cwd(), 'sample media')
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
    this.demoRuntime = await P2PRuntime.create({
      name: 'demo',
      baseDir: this.demoDir,
      bootstrap: [`127.0.0.1:${this.bootstrap.address.port}`]
    })
    await this.ensureDemoNetwork()
  }

  async destroy() {
    for (const session of this.sessions.values()) await session.runtime.destroy()
    if (this.demoRuntime) await this.demoRuntime.destroy()
    if (this.bootstrap) await this.bootstrap.destroy()
  }

  async ensureDemoNetwork() {
    const existing = await fs.readFile(this.demoAccountsFile, 'utf8').then(JSON.parse).catch(() => null)
    if (existing?.sol && existing?.noor) {
      this.demoAccounts = existing
      this.knownAccounts.add(existing.sol)
      this.knownAccounts.add(existing.noor)
      return
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
      description: "Sol's original collection of late-light material.",
      isCurated: false,
      children: [
        { kind: 'media', ref: amber.mediaRef },
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
      title: 'Afterglass',
      type: 'series',
      description: "Noor's original moving-image and still sequence.",
      isCurated: false,
      children: [
        { kind: 'media', ref: night.mediaRef },
        { kind: 'media', ref: bloom.mediaRef }
      ]
    })
    await this.demoRuntime.publishCollection(noor.accountId, {
      title: 'Crossfade Relay',
      type: 'curated',
      description: "A curated post that preserves Sol's original authorship alongside Noor's own release.",
      isCurated: true,
      children: [
        { kind: 'media', ref: amber.mediaRef },
        { kind: 'media', ref: night.mediaRef }
      ]
    })
    await this.demoRuntime.keepMedia(noor.accountId, amber.mediaRef)
    await this.demoRuntime.publishFollow(noor.accountId, sol.accountId)

    this.demoAccounts = { sol: sol.accountId, noor: noor.accountId }
    this.knownAccounts.add(sol.accountId)
    this.knownAccounts.add(noor.accountId)
    await fs.writeFile(this.demoAccountsFile, JSON.stringify(this.demoAccounts, null, 2))
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
      ui: session.ui
    }, null, 2))
  }

  async getSession(clientId) {
    if (this.sessions.has(clientId)) return this.sessions.get(clientId)
    const persisted = await this.readSessionState(clientId)
    const runtime = await P2PRuntime.create({
      name: `client-${clientId}`,
      baseDir: path.join(this.clientsDir, clientId),
      bootstrap: [`127.0.0.1:${this.bootstrap.address.port}`]
    })
    const accountIds = Object.keys(runtime.accounts)
    const session = {
      runtime,
      ui: persisted?.ui || {
        ...uiDefaults(),
        selectedProfileAccountId: accountIds[0] || null
      },
      currentAccountId: persisted?.currentAccountId || accountIds[0] || null
    }
    if (!session.ui.selectedProfileAccountId) session.ui.selectedProfileAccountId = session.currentAccountId
    if (session.currentAccountId) this.knownAccounts.add(session.currentAccountId)
    this.sessions.set(clientId, session)
    await this.saveSession(clientId, session)
    return session
  }

  async rememberAccount(accountId) {
    if (accountId) this.knownAccounts.add(accountId)
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

  allKnownAccountIds(runtime) {
    return [...new Set([
      ...this.knownAccounts,
      ...Object.keys(this.demoRuntime?.accounts || {}),
      ...Object.keys(runtime?.accounts || {})
    ])]
  }

  async collectKnownProfiles(runtime) {
    const queue = this.allKnownAccountIds(runtime)
    const queued = new Set(queue)
    const discovered = new Map()

    while (queue.length) {
      const accountId = queue.shift()
      queued.delete(accountId)
      if (!accountId || discovered.has(accountId)) continue
      const reader = this.readerFor(accountId, runtime)
      const resolved = await reader.resolveProfile(accountId).catch(() => null)
      if (!resolved) continue
      this.knownAccounts.add(accountId)
      discovered.set(accountId, { accountId, reader, resolved })

      for (const followRef of resolved.state.followRefs) {
        const follow = await reader.resolveFollow(followRef).catch(() => null)
        const followedAccountId = follow?.follow?.followedAccountId
        if (!followedAccountId || discovered.has(followedAccountId) || queued.has(followedAccountId)) continue
        queue.push(followedAccountId)
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

  async searchKnownProfiles(runtime, query) {
    const trimmed = String(query || '').trim()
    const lower = trimmed.toLowerCase()
    const results = new Map()

    for (const entry of await this.collectKnownProfiles(runtime)) {
      results.set(entry.accountId, {
        accountId: entry.accountId,
        username: entry.resolved.profile.username,
        displayName: entry.resolved.profile.displayName,
        verified: entry.resolved.verified
      })
    }

    if (trimmed && /^[a-f0-9]{32,}$/i.test(trimmed) && !results.has(trimmed)) {
      const reader = this.readerFor(trimmed, runtime)
      const resolved = await reader.resolveProfile(trimmed).catch(() => null)
      if (resolved) {
        this.knownAccounts.add(trimmed)
        results.set(trimmed, {
          accountId: trimmed,
          username: resolved.profile.username,
          displayName: resolved.profile.displayName,
          verified: resolved.verified
        })
      }
    }

    return [...results.values()]
      .filter(item => !lower
        || item.username.toLowerCase().includes(lower)
        || item.displayName.toLowerCase().includes(lower)
        || item.accountId.toLowerCase().includes(lower))
      .sort((left, right) => left.username.localeCompare(right.username) || left.displayName.localeCompare(right.displayName))
  }

  async buildNetworkStats(runtime) {
    const profiles = await this.collectKnownProfiles(runtime)
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
        summary: activity.summary || 'Saved to library'
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
      isCurated: collection.isCurated,
      description: collection.description,
      coverMediaRef: firstMediaRef,
      creatorUsername: creatorUsernameOverride || creatorProfile.profile.username,
      childCreatorUsernames: [...new Set(childCreatorUsernames)],
      children,
      updatedAt: collection.updatedAt
    }
  }

  async resolveProfileSummary(runtime, accountId) {
    if (!accountId) return null
    const reader = this.readerFor(accountId, runtime)
    const resolved = await reader.resolveProfile(accountId)
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

  async buildFeed(runtime, accountId) {
    if (!accountId) return []
    const visited = new Set([accountId])
    const queue = []
    const resolved = await runtime.resolveProfile(accountId)
    for (const followRef of resolved.state.followRefs) {
      const { follow } = await runtime.resolveFollow(followRef)
      if (!visited.has(follow.followedAccountId)) {
        visited.add(follow.followedAccountId)
        queue.push(follow.followedAccountId)
      }
    }
    const actors = []
    while (queue.length) {
      const actorId = queue.shift()
      const actorReader = this.readerFor(actorId, runtime)
      const actor = await actorReader.resolveProfile(actorId).catch(() => null)
      if (!actor) continue
      actors.push({ accountId: actorId, reader: actorReader, resolved: actor })
      for (const followRef of actor.state.followRefs) {
        const { follow } = await actorReader.resolveFollow(followRef)
        if (!visited.has(follow.followedAccountId)) {
          visited.add(follow.followedAccountId)
          queue.push(follow.followedAccountId)
        }
      }
    }
    const items = []
    for (const actor of actors) {
      for (const activity of [...actor.resolved.state.activities].reverse()) {
        const item = await this.buildFeedItem(runtime, actor.accountId, actor.resolved, activity)
        if (item) items.push(item)
      }
    }
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async buildSuggestions(runtime, currentAccountId) {
    const followed = await this.directFollowedAccountIds(runtime, currentAccountId)
    return (await this.searchKnownProfiles(runtime, ''))
      .filter(item => item.accountId !== currentAccountId && !followed.has(item.accountId))
      .slice(0, 4)
  }

  async buildShelf(runtime) {
    const shelf = []
    for (const entry of await this.collectKnownProfiles(runtime)) {
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

  async buildSnapshot(clientId) {
    const session = await this.getSession(clientId)
    if (await this.ensureSavedCollectionPackages(session)) await this.saveSession(clientId, session)
    const currentAccountId = session.currentAccountId
    const currentProfile = currentAccountId ? await session.runtime.resolveProfile(currentAccountId) : null
    const selectedAccountId = session.ui.selectedProfileAccountId || currentAccountId
    const selectedResolved = selectedAccountId
      ? await this.readerFor(selectedAccountId, session.runtime).resolveProfile(selectedAccountId).catch(() => null)
      : null
    const selectedProfile = await this.resolveProfileSummary(session.runtime, selectedAccountId)
    if (selectedProfile) {
      selectedProfile.collections = selectedProfile.collections.map(item => ({
        ...item,
        liked: Boolean(item.ref && session.ui.savedCollectionRefs.includes(item.ref)),
        owned: selectedProfile.accountId === currentAccountId
      }))
    }
    const feed = (await this.buildFeed(session.runtime, currentAccountId)).map(item => item.post && item.collectionRef
      ? {
          ...item,
          post: {
            ...item.post,
            liked: session.ui.savedCollectionRefs.includes(item.collectionRef),
            owned: item.actorAccountId === currentAccountId
          }
        }
      : item)
    return {
      currentAccount: currentProfile ? {
        accountId: currentAccountId,
        username: currentProfile.profile.username,
        displayName: currentProfile.profile.displayName
      } : null,
      activeSection: session.ui.activeSection,
      discoverQuery: session.ui.discoverQuery,
      selectedProfile,
      searchResults: session.ui.discoverQuery ? await this.searchKnownProfiles(session.runtime, session.ui.discoverQuery) : [],
      feed,
      library: await this.buildLibrary(session.runtime, currentAccountId, session.ui.savedCollectionRefs),
      network: await this.buildNetworkStats(session.runtime),
      trust: {
        selectedAccountId,
        selectedHeadSeq: selectedResolved?.head?.seq ?? null,
        selectedProfileRef: selectedResolved?.state?.profileRef ?? null,
        resolvedViaDhtHead: Boolean(selectedAccountId && !session.runtime.accounts?.[selectedAccountId] && !this.demoRuntime?.accounts?.[selectedAccountId]),
        verifiedProfile: Boolean(selectedResolved?.verified)
      },
      suggestions: await this.buildSuggestions(session.runtime, currentAccountId),
      draftChildren: await this.buildDraft(session.runtime, session.ui.collectionDraftChildRefs),
      shelfMedia: await this.buildShelf(session.runtime),
      flashMessage: session.ui.flashMessage
    }
  }

  async resolveMediaAsset(clientId, mediaRef) {
    const session = await this.getSession(clientId)
    return session.runtime.materializeMedia(mediaRef, 'preview')
  }

  async createAccount(clientId, input) {
    const session = await this.getSession(clientId)
    const account = await session.runtime.createAccount(input)
    if (this.demoAccounts.noor) await session.runtime.publishFollow(account.accountId, this.demoAccounts.noor).catch(() => null)
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
    await session.runtime.resolveProfile(accountId)
    session.ui.selectedProfileAccountId = accountId
    session.ui.activeSection = 'profile'
    session.ui.flashMessage = ''
    await this.saveSession(clientId, session)
    return true
  }

  async searchProfiles(clientId, query) {
    const session = await this.getSession(clientId)
    session.ui.discoverQuery = String(query || '').trim()
    session.ui.activeSection = 'discover'
    session.ui.flashMessage = ''
    const results = session.ui.discoverQuery ? await this.searchKnownProfiles(session.runtime, session.ui.discoverQuery) : []
    for (const result of results) await this.rememberAccount(result.accountId)
    await this.saveSession(clientId, session)
    return results
  }

  async setSection(clientId, section) {
    const session = await this.getSession(clientId)
    session.ui.activeSection = section
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
    session.ui.flashMessage = 'Saved.'
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
    session.ui.flashMessage = packageRefs.mediaRefs.length || packageRefs.collectionRefs.length ? 'Saved to library.' : 'Nothing to save.'
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
    await this.rememberAccount(accountId)
    const result = await session.runtime.publishFollow(session.currentAccountId, accountId)
    session.ui.flashMessage = 'Following.'
    await this.saveSession(clientId, session)
    return result
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
