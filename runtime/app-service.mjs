import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { createBootstrapNode, P2PRuntime } from './p2p-runtime.mjs'

const uiDefaults = () => ({
  activeSection: 'discover',
  selectedProfileAccountId: null,
  flashMessage: '',
  collectionDraftChildRefs: [],
  savedCollectionRefs: []
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
            collectionDraftChildRefs: Array.isArray(existing.ui?.collectionDraftChildRefs) ? existing.ui.collectionDraftChildRefs : [],
            savedCollectionRefs: Array.isArray(existing.ui?.savedCollectionRefs) ? existing.ui.savedCollectionRefs : []
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
      uploads: [],
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
      collections.push(summary)
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
      collections.push(summary)
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
      actors.push(actorId)
      const actor = await this.readerFor(actorId, runtime).resolveProfile(actorId).catch(() => null)
      if (!actor) continue
      for (const followRef of actor.state.followRefs) {
        const { follow } = await this.readerFor(actorId, runtime).resolveFollow(followRef)
        if (!visited.has(follow.followedAccountId)) {
          visited.add(follow.followedAccountId)
          queue.push(follow.followedAccountId)
        }
      }
    }
    const items = []
    for (const actorId of actors) {
      const actor = await this.readerFor(actorId, runtime).resolveProfile(actorId)
      for (const collectionRef of [...actor.state.collectionRefs].reverse()) {
        const post = await this.resolveCollectionSummary(this.readerFor(actorId, runtime), collectionRef, actor.profile.username)
        items.push({
          id: `${actorId}:${post.updatedAt}:${collectionRef}`,
          kind: 'post',
          actorAccountId: actorId,
          actorUsername: actor.profile.username,
          subjectTitle: post.title,
          createdAt: post.updatedAt,
          summary: post.description || `${post.isCurated ? 'Curated' : 'Original'} ${post.type}`,
          collectionRef,
          post
        })
      }
    }
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async buildSuggestions(runtime, currentAccountId) {
    return []
  }

  async buildShelf(runtime) {
    const shelf = []
    for (const accountId of this.knownAccounts) {
      const reader = this.readerFor(accountId, runtime)
      const profile = await reader.resolveProfile(accountId).catch(() => null)
      if (!profile) continue
      for (const mediaRef of [...profile.state.mediaRefs].reverse()) {
        const { media } = await reader.resolveMedia(mediaRef)
        shelf.push({
          id: media.id,
          ref: mediaRef,
          title: media.title,
          mediaType: media.mediaType,
          creatorAccountId: media.creatorAccountId,
          creatorUsername: profile.profile.username,
          description: media.description,
          contentRef: media.contentRef,
          thumbnailRef: null
        })
      }
    }
    return shelf
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

  async buildSnapshot(clientId) {
    const session = await this.getSession(clientId)
    const currentAccountId = session.currentAccountId
    const currentProfile = currentAccountId ? await session.runtime.resolveProfile(currentAccountId) : null
    const selectedAccountId = session.ui.selectedProfileAccountId || currentAccountId
    return {
      currentAccount: currentProfile ? {
        accountId: currentAccountId,
        username: currentProfile.profile.username,
        displayName: currentProfile.profile.displayName
      } : null,
      activeSection: session.ui.activeSection,
      selectedProfile: await this.resolveProfileSummary(session.runtime, selectedAccountId),
      searchResults: [],
      feed: await this.buildFeed(session.runtime, currentAccountId),
      library: await this.buildLibrary(session.runtime, currentAccountId, session.ui.savedCollectionRefs),
      network: { accounts: this.knownAccounts.size, media: 0, collections: 0, keeps: 0, follows: 0 },
      trust: { selectedAccountId, selectedHeadSeq: null, selectedProfileRef: null, resolvedViaDhtHead: true, verifiedProfile: Boolean(selectedAccountId) },
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
    session.ui.flashMessage = 'Saved.'
    await this.saveSession(clientId, session)
    return result
  }

  async collectMediaRefs(runtime, collectionRef, visited = new Set()) {
    if (visited.has(collectionRef)) return []
    visited.add(collectionRef)
    const { collection } = await runtime.resolveCollection(collectionRef)
    const refs = []
    for (const child of collection.children) {
      if (child.kind === 'media') refs.push(child.ref)
      else refs.push(...await this.collectMediaRefs(runtime, child.ref, visited))
    }
    return [...new Set(refs)]
  }

  async keepCollection(clientId, collectionRef) {
    const session = await this.getSession(clientId)
    const refs = await this.collectMediaRefs(session.runtime, collectionRef)
    for (const mediaRef of refs) {
      await session.runtime.keepMedia(session.currentAccountId, mediaRef)
    }
    session.ui.savedCollectionRefs = [...new Set([collectionRef, ...session.ui.savedCollectionRefs])]
    session.ui.flashMessage = refs.length ? 'Saved to library.' : 'Nothing to save.'
    await this.saveSession(clientId, session)
    return { keptRefs: refs }
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
}
