/**
 * Yolk desktop-first prototype.
 *
 * Sections
 * - types + helpers
 * - crypto + signatures
 * - local mock network
 * - controller + selectors
 * - demo seeding
 * - fixture runner
 * - DOM app
 */

export type SectionName = "home" | "discover" | "library" | "profile" | "upload" | "collections";
export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type Profile = {
  accountId: string;
  username: string;
  displayName: string;
  bio: string;
  avatarRef: string | null;
  bannerRef: string | null;
  pinnedCollectionIds: string[];
  updatedAt: string;
  signature: string;
};

export type AccountHead = {
  accountId: string;
  profileRef: string;
  latestActivityRef: string | null;
  seq: number;
  signature: string;
};

export type MediaObject = {
  id: string;
  creatorAccountId: string;
  contentRef: string;
  mediaType: string;
  title: string;
  description: string;
  thumbnailRef: string | null;
  createdAt: string;
  signature: string;
};

export type CollectionRecord = {
  id: string;
  creatorAccountId: string;
  title: string;
  type: string;
  description: string;
  coverRef: string | null;
  children: Array<{ kind: "media" | "collection"; id: string }>;
  isCurated: boolean;
  updatedAt: string;
  signature: string;
};

type BlobRecord = { ref: string; mediaType: string; name: string; dataUrl: string | null; textPreview: string | null };
type KeepRecord = { id: string; accountId: string; mediaId: string; createdAt: string; signature: string };
type FollowRecord = { id: string; followerAccountId: string; followedAccountId: string; createdAt: string; signature: string };
type ActivityRecord = { id: string; actorAccountId: string; kind: "profile" | "upload" | "collection" | "keep" | "follow"; subjectId: string; createdAt: string; summary: string };
type AccountRecord = { id: string; publicJwk: JsonWebKey };
type AccountKeys = { accountId: string; publicJwk: JsonWebKey; privateJwk: JsonWebKey };
type NetworkStore = {
  version: number;
  meta: { demoReady: boolean; demoAccounts: Record<string, string> };
  accounts: Record<string, AccountRecord>;
  heads: Record<string, AccountHead>;
  profiles: Record<string, Profile>;
  blobs: Record<string, BlobRecord>;
  media: Record<string, MediaObject>;
  collections: Record<string, CollectionRecord>;
  keeps: Record<string, KeepRecord>;
  follows: Record<string, FollowRecord>;
  activities: Record<string, ActivityRecord>;
  usernameIndex: Record<string, string[]>;
};
type LocalStore = {
  currentAccountId: string | null;
  publicJwk: JsonWebKey | null;
  privateJwk: JsonWebKey | null;
  activeSection: SectionName;
  selectedProfileAccountId: string | null;
  flashMessage: string;
  searchQuery: string;
  collectionDraftChildIds: string[];
};

type SearchResult = { accountId: string; username: string; displayName: string; verified: boolean };
type FeedItem = { id: string; kind: ActivityRecord["kind"]; actorAccountId: string; actorUsername: string; subjectTitle: string; createdAt: string; summary: string };
type LibraryItem = { id: string; title: string; mediaType: string; creatorAccountId: string; creatorUsername: string; description: string; contentRef: string; thumbnailRef: string | null };
type ProfileSummary = {
  accountId: string;
  username: string;
  displayName: string;
  bio: string;
  verified: boolean;
  uploads: Array<{ id: string; title: string; mediaType: string; creatorAccountId: string; contentRef: string; thumbnailRef: string | null }>;
  collections: Array<{ id: string; title: string; type: string; isCurated: boolean; description: string; creatorUsername: string; childCreatorUsernames: string[] }>;
};
export type AppSnapshot = {
  currentAccount: { accountId: string; username: string; displayName: string } | null;
  activeSection: SectionName;
  selectedProfile: ProfileSummary | null;
  searchResults: SearchResult[];
  feed: FeedItem[];
  library: { keptCount: number; keptTitles: string[]; keptMedia: LibraryItem[] };
  network: { accounts: number; media: number; collections: number; keeps: number; follows: number };
  trust: { selectedAccountId: string | null; selectedHeadSeq: number | null; selectedProfileRef: string | null; resolvedViaDhtHead: boolean; verifiedProfile: boolean };
  suggestions: SearchResult[];
  draftChildren: LibraryItem[];
  flashMessage: string;
};
type ScenarioAction =
  | { type: "createAccount"; username: string; displayName: string; bio: string }
  | { type: "openProfile"; accountRef: string }
  | { type: "follow"; accountRef: string }
  | { type: "keep"; mediaRef: string }
  | { type: "search"; query: string }
  | { type: "createCollection"; title: string; collectionType: string; description: string; isCurated: boolean; children: string[] };
export type ScenarioFixture = { id: string; actions: ScenarioAction[] };

const NETWORK_STORAGE_KEY = "yolk.network.v1";
const LOCAL_STORAGE_KEY = "yolk.local.v1";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const uniq = (values: string[]) => Array.from(new Set(values));
const nowIso = () => new Date().toISOString();
const shortId = (value: string) => (!value ? "" : value.length <= 18 ? value : `${value.slice(0, 10)}…${value.slice(-6)}`);
const sanitizeHandle = (value: string) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24);
const escapeHtml = (value: string) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const sortDesc = <T extends { createdAt?: string; updatedAt?: string; id?: string }>(a: T, b: T) => (a.createdAt || a.updatedAt || "") > (b.createdAt || b.updatedAt || "") ? -1 : (a.createdAt || a.updatedAt || "") < (b.createdAt || b.updatedAt || "") ? 1 : (a.id || "").localeCompare(b.id || "");

function stableValue(value: any): any {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") return Object.keys(value).sort().reduce((acc, key) => ((acc[key] = stableValue(value[key])), acc), {} as Record<string, any>);
  return value;
}

export function stableStringify(value: any): string {
  return JSON.stringify(stableValue(value));
}

const stripSignature = <T extends { signature?: string }>(value: T): Omit<T, "signature"> => {
  const copy = clone(value) as T & { signature?: string };
  delete copy.signature;
  return copy;
};

export function createMemoryStorage(initial: Record<string, string> = {}): StorageLike {
  const map = new Map(Object.entries(initial));
  return { getItem: key => (map.has(key) ? map.get(key)! : null), setItem: (key, value) => void map.set(key, String(value)), removeItem: key => void map.delete(key) };
}

function subtle(): SubtleCrypto {
  if (!globalThis.crypto?.subtle) throw new Error("Web Crypto is required for Yolk.");
  return globalThis.crypto.subtle;
}

const utf8 = (value: string) => new TextEncoder().encode(value);
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromB64 = (value: string) => Uint8Array.from(atob(value), char => char.charCodeAt(0));

async function sha256Hex(value: string): Promise<string> {
  const digest = await subtle().digest("SHA-256", utf8(value));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function signPayload(privateJwk: JsonWebKey, payload: unknown): Promise<string> {
  const key = await subtle().importKey("jwk", privateJwk, { name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
  const signature = await subtle().sign({ name: "ECDSA", hash: "SHA-256" }, key, utf8(stableStringify(payload)));
  return b64(new Uint8Array(signature));
}

export async function verifySignedRecord(publicJwk: JsonWebKey, record: { signature: string }): Promise<boolean> {
  const key = await subtle().importKey("jwk", publicJwk, { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"]);
  return subtle().verify({ name: "ECDSA", hash: "SHA-256" }, key, fromB64(record.signature || ""), utf8(stableStringify(stripSignature(record))));
}

async function deriveAccountId(publicJwk: JsonWebKey): Promise<string> {
  return `acct_${(await sha256Hex(stableStringify(publicJwk))).slice(0, 32)}`;
}

async function createAccountKeys(): Promise<AccountKeys> {
  const pair = await subtle().generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const publicJwk = await subtle().exportKey("jwk", pair.publicKey);
  const privateJwk = await subtle().exportKey("jwk", pair.privateKey);
  return { accountId: await deriveAccountId(publicJwk), publicJwk, privateJwk };
}

const emptyNetwork = (): NetworkStore => ({ version: 1, meta: { demoReady: false, demoAccounts: {} }, accounts: {}, heads: {}, profiles: {}, blobs: {}, media: {}, collections: {}, keeps: {}, follows: {}, activities: {}, usernameIndex: {} });
const emptyLocal = (): LocalStore => ({ currentAccountId: null, publicJwk: null, privateJwk: null, activeSection: "home", selectedProfileAccountId: null, flashMessage: "", searchQuery: "", collectionDraftChildIds: [] });
const readJson = <T>(storage: StorageLike, key: string, fallback: T): T => {
  const raw = storage.getItem(key);
  if (!raw) return clone(fallback);
  try {
    return { ...clone(fallback), ...JSON.parse(raw) } as T;
  } catch {
    return clone(fallback);
  }
};
const writeJson = (storage: StorageLike, key: string, value: unknown) => storage.setItem(key, JSON.stringify(value));
const initialState = (storage: StorageLike) => ({ network: readJson(storage, NETWORK_STORAGE_KEY, emptyNetwork()), local: readJson(storage, LOCAL_STORAGE_KEY, emptyLocal()) });
const updateUsernameIndex = (network: NetworkStore, username: string, accountId: string) => {
  const key = sanitizeHandle(username);
  if (key) network.usernameIndex[key] = uniq([...(network.usernameIndex[key] || []), accountId]);
};
const createClock = (startIso = "2026-01-01T00:00:00.000Z") => {
  let current = new Date(startIso).getTime();
  return () => {
    const value = new Date(current).toISOString();
    current += 60_000;
    return value;
  };
};

async function publishProfile(network: NetworkStore, keys: AccountKeys, input: { username: string; displayName: string; bio: string; avatarRef?: string | null; bannerRef?: string | null; pinnedCollectionIds?: string[] }, now: string) {
  network.accounts[keys.accountId] = { id: keys.accountId, publicJwk: clone(keys.publicJwk) };
  const previous = network.heads[keys.accountId];
  const profileRef = `profile:${keys.accountId}:${(previous?.seq || 0) + 1}`;
  const profile: Profile = { accountId: keys.accountId, username: sanitizeHandle(input.username), displayName: String(input.displayName || "").trim() || sanitizeHandle(input.username), bio: String(input.bio || "").trim(), avatarRef: input.avatarRef || null, bannerRef: input.bannerRef || null, pinnedCollectionIds: input.pinnedCollectionIds || [], updatedAt: now, signature: "" };
  profile.signature = await signPayload(keys.privateJwk, stripSignature(profile));
  network.profiles[profileRef] = profile;
  updateUsernameIndex(network, profile.username, keys.accountId);
  const head: AccountHead = { accountId: keys.accountId, profileRef, latestActivityRef: previous?.latestActivityRef || null, seq: (previous?.seq || 0) + 1, signature: "" };
  head.signature = await signPayload(keys.privateJwk, stripSignature(head));
  network.heads[keys.accountId] = head;
}

async function refreshHead(network: NetworkStore, keys: AccountKeys, latestActivityRef: string | null) {
  const previous = network.heads[keys.accountId];
  if (!previous) throw new Error("Profile must exist before head refresh.");
  const head: AccountHead = { accountId: keys.accountId, profileRef: previous.profileRef, latestActivityRef, seq: previous.seq + 1, signature: "" };
  head.signature = await signPayload(keys.privateJwk, stripSignature(head));
  network.heads[keys.accountId] = head;
}

function storeBlob(network: NetworkStore, mediaType: string, name: string, dataUrl: string | null, textPreview: string | null): BlobRecord {
  const ref = `blob:${mediaType}:${name.replace(/\s+/g, "-").toLowerCase()}:${Object.keys(network.blobs).length + 1}`;
  return (network.blobs[ref] = { ref, mediaType, name, dataUrl, textPreview });
}

async function addActivity(network: NetworkStore, keys: AccountKeys, kind: ActivityRecord["kind"], subjectId: string, summary: string, now: string) {
  const id = `activity:${keys.accountId}:${Object.keys(network.activities).length + 1}`;
  network.activities[id] = { id, actorAccountId: keys.accountId, kind, subjectId, createdAt: now, summary };
  await refreshHead(network, keys, id);
}

async function createMedia(network: NetworkStore, keys: AccountKeys, input: { title: string; description: string; mediaType: string; fileName: string; dataUrl: string | null; textPreview: string | null; thumbnailRef?: string | null }, now: string) {
  const blob = storeBlob(network, input.mediaType, input.fileName, input.dataUrl, input.textPreview);
  const id = `media_${(await sha256Hex(`${keys.accountId}:${blob.ref}:${input.title}:${now}`)).slice(0, 24)}`;
  const media: MediaObject = { id, creatorAccountId: keys.accountId, contentRef: blob.ref, mediaType: input.mediaType, title: String(input.title || "").trim() || input.fileName, description: String(input.description || "").trim(), thumbnailRef: input.thumbnailRef || (input.mediaType === "image" ? blob.ref : null), createdAt: now, signature: "" };
  media.signature = await signPayload(keys.privateJwk, stripSignature(media));
  network.media[id] = media;
  await addActivity(network, keys, "upload", id, `Published ${media.mediaType}: ${media.title}`, now);
  return media;
}

async function createCollection(network: NetworkStore, keys: AccountKeys, input: { title: string; type: string; description: string; isCurated: boolean; childIds: string[] }, now: string) {
  const id = `col_${(await sha256Hex(`${keys.accountId}:${input.title}:${now}`)).slice(0, 24)}`;
  const coverRef = input.childIds.map(childId => network.media[childId]?.thumbnailRef || null).find(Boolean) || null;
  const record: CollectionRecord = { id, creatorAccountId: keys.accountId, title: String(input.title || "").trim() || "Untitled collection", type: String(input.type || "").trim() || "folder", description: String(input.description || "").trim(), coverRef, children: input.childIds.map(childId => ({ kind: network.collections[childId] ? "collection" : "media", id: childId })), isCurated: Boolean(input.isCurated), updatedAt: now, signature: "" };
  record.signature = await signPayload(keys.privateJwk, stripSignature(record));
  network.collections[id] = record;
  await addActivity(network, keys, "collection", id, `Published collection: ${record.title}`, now);
  return record;
}

async function createKeep(network: NetworkStore, keys: AccountKeys, mediaId: string, now: string) {
  const id = `keep_${keys.accountId}_${mediaId}`;
  if (network.keeps[id]) return network.keeps[id];
  const keep: KeepRecord = { id, accountId: keys.accountId, mediaId, createdAt: now, signature: "" };
  keep.signature = await signPayload(keys.privateJwk, stripSignature(keep));
  network.keeps[id] = keep;
  await addActivity(network, keys, "keep", id, `Keep + seed: ${network.media[mediaId]?.title || mediaId}`, now);
  return keep;
}

async function createFollow(network: NetworkStore, keys: AccountKeys, followedAccountId: string, now: string) {
  const id = `follow_${keys.accountId}_${followedAccountId}`;
  if (network.follows[id]) return network.follows[id];
  const follow: FollowRecord = { id, followerAccountId: keys.accountId, followedAccountId, createdAt: now, signature: "" };
  follow.signature = await signPayload(keys.privateJwk, stripSignature(follow));
  network.follows[id] = follow;
  await addActivity(network, keys, "follow", id, `Followed ${await usernameFor(network, followedAccountId)}`, now);
  return follow;
}

export async function resolveVerifiedProfile(network: NetworkStore, accountId: string): Promise<{ accountId: string; profile: Profile; head: AccountHead; verified: boolean } | null> {
  const account = network.accounts[accountId];
  const head = network.heads[accountId];
  if (!account || !head) return null;
  const profile = network.profiles[head.profileRef];
  if (!profile) return null;
  const verified = head.accountId === accountId && profile.accountId === accountId && (await verifySignedRecord(account.publicJwk, head)) && (await verifySignedRecord(account.publicJwk, profile));
  return { accountId, profile, head, verified };
}

async function allProfiles(network: NetworkStore) {
  return (await Promise.all(Object.keys(network.accounts).map(id => resolveVerifiedProfile(network, id)))).filter(Boolean) as Array<Awaited<ReturnType<typeof resolveVerifiedProfile>>>;
}

async function usernameFor(network: NetworkStore, accountId: string) {
  return (await resolveVerifiedProfile(network, accountId))?.profile.username || shortId(accountId);
}

async function searchProfiles(network: NetworkStore, query: string): Promise<SearchResult[]> {
  const lower = sanitizeHandle(query) || String(query || "").trim().toLowerCase();
  return (await allProfiles(network))
    .filter(profile => !lower || profile.profile.username.includes(lower) || profile.profile.displayName.toLowerCase().includes(lower) || profile.accountId.toLowerCase().includes(lower))
    .sort((a, b) => a.profile.username.localeCompare(b.profile.username))
    .map(profile => ({ accountId: profile.accountId, username: profile.profile.username, displayName: profile.profile.displayName, verified: profile.verified }));
}

async function subjectTitle(network: NetworkStore, activity: ActivityRecord) {
  if (activity.kind === "upload") return network.media[activity.subjectId]?.title || activity.subjectId;
  if (activity.kind === "collection") return network.collections[activity.subjectId]?.title || activity.subjectId;
  if (activity.kind === "keep") return network.media[network.keeps[activity.subjectId]?.mediaId || ""]?.title || activity.subjectId;
  if (activity.kind === "follow") return await usernameFor(network, network.follows[activity.subjectId]?.followedAccountId || "");
  return "Profile update";
}

async function buildFeed(network: NetworkStore, viewerAccountId: string | null): Promise<FeedItem[]> {
  if (!viewerAccountId) return [];
  const followed = new Set(Object.values(network.follows).filter(item => item.followerAccountId === viewerAccountId).map(item => item.followedAccountId));
  const actors = new Set([viewerAccountId, ...followed]);
  return Promise.all(Object.values(network.activities).filter(item => actors.has(item.actorAccountId)).sort(sortDesc).map(async item => ({ id: item.id, kind: item.kind, actorAccountId: item.actorAccountId, actorUsername: await usernameFor(network, item.actorAccountId), subjectTitle: await subjectTitle(network, item), createdAt: item.createdAt, summary: item.summary })));
}

async function buildLibrary(network: NetworkStore, accountId: string | null): Promise<AppSnapshot["library"]> {
  if (!accountId) return { keptCount: 0, keptTitles: [], keptMedia: [] };
  const keptMedia = (await Promise.all(Object.values(network.keeps).filter(item => item.accountId === accountId).sort(sortDesc).map(async item => {
    const media = network.media[item.mediaId];
    if (!media) return null;
    return { id: media.id, title: media.title, mediaType: media.mediaType, creatorAccountId: media.creatorAccountId, creatorUsername: await usernameFor(network, media.creatorAccountId), description: media.description, contentRef: media.contentRef, thumbnailRef: media.thumbnailRef } as LibraryItem;
  }))).filter(Boolean) as LibraryItem[];
  return { keptCount: keptMedia.length, keptTitles: keptMedia.map(item => item.title), keptMedia };
}

async function buildProfileSummary(network: NetworkStore, accountId: string | null): Promise<ProfileSummary | null> {
  if (!accountId) return null;
  const resolved = await resolveVerifiedProfile(network, accountId);
  if (!resolved) return null;
  const uploads = Object.values(network.media).filter(item => item.creatorAccountId === accountId).sort(sortDesc).map(item => ({ id: item.id, title: item.title, mediaType: item.mediaType, creatorAccountId: item.creatorAccountId, contentRef: item.contentRef, thumbnailRef: item.thumbnailRef }));
  const collections = await Promise.all(Object.values(network.collections).filter(item => item.creatorAccountId === accountId).sort(sortDesc).map(async item => ({ id: item.id, title: item.title, type: item.type, isCurated: item.isCurated, description: item.description, creatorUsername: await usernameFor(network, item.creatorAccountId), childCreatorUsernames: uniq(await Promise.all(item.children.map(async child => child.kind === "collection" ? usernameFor(network, network.collections[child.id]?.creatorAccountId || child.id) : usernameFor(network, network.media[child.id]?.creatorAccountId || child.id)))) })));
  return { accountId, username: resolved.profile.username, displayName: resolved.profile.displayName, bio: resolved.profile.bio, verified: resolved.verified, uploads, collections };
}

async function suggestions(network: NetworkStore, currentAccountId: string | null) {
  return (await searchProfiles(network, "")).filter(item => item.accountId !== currentAccountId).slice(0, 4);
}

function demoSvg(label: string, hue: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="720" viewBox="0 0 960 720"><defs><linearGradient id="g" x1="0%" x2="100%" y1="0%" y2="100%"><stop offset="0%" stop-color="${hue}" /><stop offset="100%" stop-color="#fff3cf" /></linearGradient></defs><rect width="960" height="720" fill="url(#g)" rx="48" /><circle cx="760" cy="160" r="140" fill="rgba(255,255,255,0.25)" /><circle cx="180" cy="560" r="180" fill="rgba(255,255,255,0.18)" /><text x="80" y="360" font-family="Aptos, Segoe UI, sans-serif" font-size="80" fill="#2f2312" font-weight="700">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function ensureDemoNetwork(network: NetworkStore, now: () => string) {
  if (network.meta.demoReady) return;
  const sol = await createAccountKeys();
  const noor = await createAccountKeys();
  network.meta.demoAccounts.sol = sol.accountId;
  network.meta.demoAccounts.noor = noor.accountId;
  const solAvatar = storeBlob(network, "image", "sol-avatar.svg", demoSvg("SOL", "#efb134"), null);
  const noorAvatar = storeBlob(network, "image", "noor-avatar.svg", demoSvg("NOOR", "#d98b2f"), null);
  await publishProfile(network, sol, { username: "sol", displayName: "Sol Mercer", bio: "Field recorder, image maker, and long-form release designer.", avatarRef: solAvatar.ref, bannerRef: solAvatar.ref, pinnedCollectionIds: [] }, now());
  await addActivity(network, sol, "profile", network.heads[sol.accountId].profileRef, "Published initial profile", now());
  await publishProfile(network, noor, { username: "noor", displayName: "Noor Vale", bio: "Curator of late-night signal trails and shared scene notes.", avatarRef: noorAvatar.ref, bannerRef: noorAvatar.ref, pinnedCollectionIds: [] }, now());
  await addActivity(network, noor, "profile", network.heads[noor.accountId].profileRef, "Published initial profile", now());
  const amber = await createMedia(network, sol, { title: "Amber Lines", description: "An original image set from a ferry crossing at dusk.", mediaType: "image", fileName: "amber-lines.svg", dataUrl: demoSvg("Amber Lines", "#efb134"), textPreview: null }, now());
  const notes = await createMedia(network, sol, { title: "Field Notes Vol. 1", description: "A text dispatch about signal capture and drift.", mediaType: "text", fileName: "field-notes.txt", dataUrl: null, textPreview: "Waypoint sketches, ferry horns, and the first rough map of the harbor loop." }, now());
  await createCollection(network, sol, { title: "Harbor Studies", type: "gallery", description: "Sol's original collection of visual and written field work.", isCurated: false, childIds: [amber.id, notes.id] }, now());
  const night = await createMedia(network, noor, { title: "Night Transit", description: "Audio drift sketches sequenced for late playback.", mediaType: "audio", fileName: "night-transit.mp3", dataUrl: null, textPreview: "Audio placeholder for prototype playback and metadata flows.", thumbnailRef: demoSvg("Night Transit", "#d98b2f") }, now());
  await createCollection(network, noor, { title: "Crossfade Relay", type: "curated", description: "A curated collection that preserves Sol's original authorship alongside Noor's own release.", isCurated: true, childIds: [amber.id, night.id] }, now());
  await createKeep(network, noor, amber.id, now());
  await createFollow(network, noor, sol.accountId, now());
  network.meta.demoReady = true;
}

export function createAppController(storage: StorageLike, options?: { now?: () => string }) {
  const now = options?.now || nowIso;
  let { network, local } = initialState(storage);
  const save = () => {
    writeJson(storage, NETWORK_STORAGE_KEY, network);
    writeJson(storage, LOCAL_STORAGE_KEY, local);
  };
  const setFlash = (message: string) => {
    local.flashMessage = message;
  };
  const currentKeys = async () => {
    if (!local.currentAccountId || !local.publicJwk || !local.privateJwk) throw new Error("Create a local account first.");
    return { accountId: local.currentAccountId, publicJwk: local.publicJwk, privateJwk: local.privateJwk } as AccountKeys;
  };
  const findAccountIdByAlias = (alias: string) => alias === "self" ? local.currentAccountId : alias.startsWith("demo:") ? network.meta.demoAccounts[alias.slice(5)] || null : (network.usernameIndex[sanitizeHandle(alias)] || [])[0] || null;
  const resolveMediaRefToken = (token: string) => {
    const parts = token.split(":");
    if (parts[0] !== "media" || parts.length < 3) return null;
    const accountId = findAccountIdByAlias(parts[1]) || findAccountIdByAlias(`demo:${parts[1]}`);
    const index = Number(parts[2] || "0");
    const media = Object.values(network.media).filter(item => item.creatorAccountId === accountId).sort(sortDesc);
    return media[index]?.id || null;
  };
  return {
    async initialize() {
      ({ network, local } = initialState(storage));
      await ensureDemoNetwork(network, now);
      if (!local.selectedProfileAccountId && local.currentAccountId) local.selectedProfileAccountId = local.currentAccountId;
      save();
    },
    async createAccount(input: { username: string; displayName: string; bio: string }) {
      const keys = await createAccountKeys();
      local.currentAccountId = keys.accountId;
      local.publicJwk = clone(keys.publicJwk);
      local.privateJwk = clone(keys.privateJwk);
      await publishProfile(network, keys, input, now());
      await addActivity(network, keys, "profile", network.heads[keys.accountId].profileRef, "Published initial profile", now());
      local.selectedProfileAccountId = keys.accountId;
      local.activeSection = "home";
      setFlash("Local keypair generated, profile signed, and account head published to the mock DHT.");
      save();
      return keys.accountId;
    },
    async uploadMedia(input: { title: string; description: string; mediaType: string; fileName: string; dataUrl: string | null; textPreview: string | null; thumbnailRef?: string | null }) {
      const record = await createMedia(network, await currentKeys(), input, now());
      setFlash(`Published immutable ${record.mediaType} object signed by ${shortId(record.creatorAccountId)}.`);
      save();
      return record;
    },
    async createCollection(input: { title: string; type: string; description: string; isCurated: boolean; childIds: string[] }) {
      const keys = await currentKeys();
      const record = await createCollection(network, keys, input, now());
      local.collectionDraftChildIds = [];
      local.selectedProfileAccountId = keys.accountId;
      local.activeSection = "profile";
      setFlash(record.isCurated ? "Curated collection published. Original media creators remain attached to every referenced item." : "Original collection published and signed.");
      save();
      return record;
    },
    async keepMedia(mediaId: string) {
      await createKeep(network, await currentKeys(), mediaId, now());
      local.activeSection = "library";
      setFlash("Keep recorded. This media is now in the local library and marked for seeding.");
      save();
    },
    async followAccount(accountId: string) {
      const keys = await currentKeys();
      if (accountId === keys.accountId) {
        setFlash("This prototype does not let an account follow itself.");
        save();
        return;
      }
      await createFollow(network, keys, accountId, now());
      local.activeSection = "home";
      setFlash("Follow record signed. Future feed reads can use the followed account's activity.");
      save();
    },
    async openProfile(accountId: string) {
      const profile = await resolveVerifiedProfile(network, accountId);
      if (!profile) {
        setFlash("No verified profile could be resolved for that account id.");
        save();
        return false;
      }
      local.selectedProfileAccountId = accountId;
      local.activeSection = "profile";
      setFlash(`Resolved profile through the mutable account head for ${profile.profile.username}.`);
      save();
      return true;
    },
    async search(query: string) {
      local.searchQuery = query;
      setFlash(query ? "Search results are discovery labels only. Opened profiles resolve by account id." : "");
      save();
      return searchProfiles(network, query);
    },
    setSection(section: SectionName) { local.activeSection = section; save(); },
    dismissFlash() { local.flashMessage = ""; save(); },
    addDraftChild(mediaId: string) { local.collectionDraftChildIds = uniq([...local.collectionDraftChildIds, mediaId]); setFlash("Media added to the collection draft."); save(); },
    removeDraftChild(mediaId: string) { local.collectionDraftChildIds = local.collectionDraftChildIds.filter(id => id !== mediaId); save(); },
    moveDraftChild(mediaId: string, direction: "up" | "down") {
      const index = local.collectionDraftChildIds.indexOf(mediaId);
      const swapIndex = direction === "up" ? index - 1 : index + 1;
      if (index < 0 || swapIndex < 0 || swapIndex >= local.collectionDraftChildIds.length) return;
      const next = local.collectionDraftChildIds.slice();
      [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
      local.collectionDraftChildIds = next;
      save();
    },
    resetDraft() { local.collectionDraftChildIds = []; save(); },
    findAccountIdByAlias,
    resolveMediaRefToken,
    getState() { return { network: clone(network), local: clone(local) }; },
    async buildSnapshot(): Promise<AppSnapshot> {
      const current = local.currentAccountId ? await buildProfileSummary(network, local.currentAccountId) : null;
      const selected = await buildProfileSummary(network, local.selectedProfileAccountId || local.currentAccountId);
      const selectedHead = selected ? network.heads[selected.accountId] : null;
      const draftChildren = (await Promise.all(local.collectionDraftChildIds.map(async id => {
        const media = network.media[id];
        if (!media) return null;
        return { id: media.id, title: media.title, mediaType: media.mediaType, creatorAccountId: media.creatorAccountId, creatorUsername: await usernameFor(network, media.creatorAccountId), description: media.description, contentRef: media.contentRef, thumbnailRef: media.thumbnailRef } as LibraryItem;
      }))).filter(Boolean) as LibraryItem[];
      return {
        currentAccount: current ? { accountId: current.accountId, username: current.username, displayName: current.displayName } : null,
        activeSection: local.activeSection,
        selectedProfile: selected,
        searchResults: await searchProfiles(network, local.searchQuery),
        feed: await buildFeed(network, local.currentAccountId),
        library: await buildLibrary(network, local.currentAccountId),
        network: { accounts: Object.keys(network.accounts).length, media: Object.keys(network.media).length, collections: Object.keys(network.collections).length, keeps: Object.keys(network.keeps).length, follows: Object.keys(network.follows).length },
        trust: { selectedAccountId: selected?.accountId || null, selectedHeadSeq: selectedHead?.seq || null, selectedProfileRef: selectedHead?.profileRef || null, resolvedViaDhtHead: Boolean(selectedHead), verifiedProfile: Boolean(selected?.verified) },
        suggestions: await suggestions(network, local.currentAccountId),
        draftChildren,
        flashMessage: local.flashMessage
      };
    }
  };
}

export async function runScenarioFixture(fixture: ScenarioFixture): Promise<AppSnapshot> {
  const controller = createAppController(createMemoryStorage(), { now: createClock() });
  await controller.initialize();
  for (const action of fixture.actions) {
    if (action.type === "createAccount") await controller.createAccount(action);
    else if (action.type === "openProfile") await controller.openProfile(controller.findAccountIdByAlias(action.accountRef) || action.accountRef);
    else if (action.type === "follow") await controller.followAccount(controller.findAccountIdByAlias(action.accountRef) || action.accountRef);
    else if (action.type === "keep") await controller.keepMedia(controller.resolveMediaRefToken(action.mediaRef) || action.mediaRef);
    else if (action.type === "search") await controller.search(action.query);
    else if (action.type === "createCollection") await controller.createCollection({ title: action.title, type: action.collectionType, description: action.description, isCurated: action.isCurated, childIds: action.children.map(token => controller.resolveMediaRefToken(token) || token).filter(Boolean) });
  }
  return controller.buildSnapshot();
}

function previewHtml(item: { mediaType: string; contentRef: string; thumbnailRef?: string | null }, network: NetworkStore) {
  const blob = network.blobs[item.thumbnailRef || item.contentRef];
  if (item.mediaType === "image" && blob?.dataUrl) return `<div class="media-preview"><img src="${escapeHtml(blob.dataUrl)}" alt=""></div>`;
  if (item.mediaType === "video" && blob?.dataUrl) return `<div class="media-preview"><video controls src="${escapeHtml(blob.dataUrl)}"></video></div>`;
  if (item.mediaType === "audio" && blob?.dataUrl) return `<div class="media-preview"><audio controls src="${escapeHtml(blob.dataUrl)}"></audio></div>`;
  if (item.mediaType === "text") return `<div class="media-preview text-preview">${escapeHtml(network.blobs[item.contentRef]?.textPreview || "Text object")}</div>`;
  return `<div class="media-preview">${escapeHtml(item.mediaType.toUpperCase())}</div>`;
}

function blockTitle(title: string, copy: string) {
  return `<div class="section-header"><div><h3 class="subsection-title">${escapeHtml(title)}</h3><p>${escapeHtml(copy)}</p></div></div>`;
}

function renderSection(snapshot: AppSnapshot, state: { network: NetworkStore }) {
  if (snapshot.activeSection === "discover") {
    return `<section class="section-block"><div class="sheet">${blockTitle("Discover", "Search by username for discovery, but open profiles by account id for trust.")}<form id="search-form" class="form-grid cols-2"><div class="field"><label for="search-query">Username / label search</label><input id="search-query" name="query" placeholder="sol, noor, or an account id fragment"></div><div class="field"><label for="lookup-account-id">Open profile by account id</label><input id="lookup-account-id" name="accountId" placeholder="acct_..."></div><div class="button-row"><button class="button-primary" type="submit">Resolve discovery</button></div></form></div><div class="section-grid"><div class="sheet">${blockTitle("Search Results", "Verified results come from signed profiles after account-head resolution.")}${snapshot.searchResults.length ? `<div class="search-results">${snapshot.searchResults.map(item => `<article class="search-card"><div class="meta-row"><span class="pill">${item.verified ? "verified profile" : "unverified"}</span><span class="pill-ghost">@${escapeHtml(item.username)}</span></div><h4>${escapeHtml(item.displayName)}</h4><p>${escapeHtml(item.accountId)}</p><div class="button-row"><button class="button-primary" data-open-profile="${escapeHtml(item.accountId)}">Open profile</button><button class="button-secondary" data-follow-account="${escapeHtml(item.accountId)}">Follow</button></div></article>`).join("")}</div>` : `<div class="empty-state"><strong>No discovery results.</strong><p class="empty-copy">Search is only a lookup layer. Verified profiles still resolve by account id through the mutable account head.</p></div>`}</div><div class="sheet">${blockTitle("Suggested Accounts", "A seeded demo graph gives you something real to browse and follow immediately.")}<div class="simple-list">${snapshot.suggestions.map(item => `<article class="simple-item"><h4>${escapeHtml(item.displayName)}</h4><p>@${escapeHtml(item.username)}</p><div class="button-row"><button class="button-secondary" data-open-profile="${escapeHtml(item.accountId)}">Open profile</button><button class="button-ghost" data-follow-account="${escapeHtml(item.accountId)}">Follow</button></div></article>`).join("")}</div></div></div></section>`;
  }
  if (snapshot.activeSection === "library") {
    return `<section class="section-block">${blockTitle("Kept Library", "In Yolk, a like is a Keep action: stored locally, preserved in your library, and conceptually queued to seed.")}<div class="media-grid">${snapshot.library.keptMedia.length ? snapshot.library.keptMedia.map(item => `<article class="media-card">${previewHtml(item, state.network)}<div class="meta-row"><span class="pill-success">kept + seed</span><span class="pill-ghost">@${escapeHtml(item.creatorUsername)}</span></div><h4>${escapeHtml(item.title)}</h4><p>${escapeHtml(item.description || "No description")}</p></article>`).join("") : `<div class="empty-state"><strong>Nothing kept yet.</strong><p class="empty-copy">Keep media from profiles or discovery to make it part of your permanent local library.</p></div>`}</div></section>`;
  }
  if (snapshot.activeSection === "upload") {
    return `<section class="section-block"><div class="sheet">${blockTitle("Upload / Publish", "Create an immutable media object, sign the metadata, and publish it to the shared prototype graph.")}<form id="upload-form" class="form-grid"><div class="form-grid cols-2"><div class="field"><label for="upload-title">Title</label><input id="upload-title" name="title" placeholder="Signal piece title" required></div><div class="field"><label for="upload-type">Media type</label><select id="upload-type" name="mediaType"><option value="image">image</option><option value="audio">audio</option><option value="video">video</option><option value="text">text</option></select></div></div><div class="field"><label for="upload-description">Description</label><textarea id="upload-description" name="description" placeholder="What is this object and why publish it?"></textarea></div><div class="field"><label for="upload-file">Media file</label><input id="upload-file" name="file" type="file" required></div><div class="button-row"><button class="button-primary" type="submit">Publish media object</button></div></form></div></section>`;
  }
  if (snapshot.activeSection === "collections") {
    const media = Object.values(state.network.media).sort(sortDesc);
    return `<section class="section-block"><div class="sheet">${blockTitle("Collection Editor", "Collections are the primary organizing unit. Curated sets keep the collection creator and original media creators visible at the same time.")}<div class="collection-editor"><div class="collection-shelf"><h4 class="subsection-title">Media Shelf</h4>${media.map(item => `<article class="collection-item-card"><div class="meta-row"><span class="pill">${escapeHtml(item.mediaType)}</span><span class="pill-ghost">${escapeHtml(shortId(item.creatorAccountId))}</span></div><h4>${escapeHtml(item.title)}</h4><p>${escapeHtml(item.description || "No description")}</p><div class="button-row"><button class="button-secondary" data-add-draft-child="${escapeHtml(item.id)}">Add</button></div></article>`).join("")}</div><div class="collection-draft"><form id="collection-form" class="form-grid"><div class="field"><label for="collection-title">Title</label><input id="collection-title" name="title" placeholder="Cross-account set" required></div><div class="form-grid cols-2"><div class="field"><label for="collection-type">Type</label><select id="collection-type" name="type"><option value="playlist">playlist</option><option value="gallery">gallery</option><option value="album">album</option><option value="series">series</option><option value="book">book</option><option value="folder">folder</option><option value="curated">curated</option></select></div><div class="field"><label for="collection-curated">Mode</label><select id="collection-curated" name="isCurated"><option value="false">Original collection</option><option value="true">Curated collection</option></select></div></div><div class="field"><label for="collection-description">Description</label><textarea id="collection-description" name="description" placeholder="Describe the organizing idea and why these items belong together."></textarea></div><div class="button-row"><button class="button-primary" type="submit">Publish collection</button><button class="button-ghost" type="button" data-reset-draft="true">Clear draft</button></div></form><div class="sheet"><h4 class="subsection-title">Ordered Draft</h4>${snapshot.draftChildren.length ? snapshot.draftChildren.map(item => `<article class="collection-item-card"><div class="meta-row"><span class="pill-ghost">${escapeHtml(item.mediaType)}</span><span class="pill-ghost">@${escapeHtml(item.creatorUsername)}</span></div><h4>${escapeHtml(item.title)}</h4><p>${escapeHtml(item.description || "No description")}</p><div class="button-row"><button class="chip-button" data-move-draft-child="${escapeHtml(item.id)}" data-direction="up">Move up</button><button class="chip-button" data-move-draft-child="${escapeHtml(item.id)}" data-direction="down">Move down</button><button class="chip-button" data-remove-draft-child="${escapeHtml(item.id)}">Remove</button></div></article>`).join("") : `<div class="empty-state"><strong>No draft children yet.</strong><p class="empty-copy">Add media from the shelf to set order and publish a signed collection.</p></div>`}</div></div></div></div></section>`;
  }
  if (snapshot.activeSection === "profile") {
    const profile = snapshot.selectedProfile;
    if (!profile) return `<div class="empty-state"><strong>No verified profile selected.</strong><p class="empty-copy">Open a profile by account id or create a local account to publish your own signed profile.</p></div>`;
    return `<section class="section-block"><div class="profile-hero"><div class="meta-row"><span class="pill">${profile.verified ? "signature verified" : "verification failed"}</span><span class="pill-ghost">@${escapeHtml(profile.username)}</span></div><h3>${escapeHtml(profile.displayName)}</h3><p class="section-copy">${escapeHtml(profile.bio || "No bio published yet.")}</p><div class="meta-row"><span class="account-id">${escapeHtml(profile.accountId)}</span></div></div><div class="panel-grid"><div class="sheet">${blockTitle("Published Media", "Immutable media objects authored by this account.")}<div class="media-grid">${profile.uploads.length ? profile.uploads.map(item => `<article class="media-card">${previewHtml(item, state.network)}<div class="meta-row"><span class="pill">${escapeHtml(item.mediaType)}</span><span class="pill-ghost">creator ${escapeHtml(shortId(item.creatorAccountId))}</span></div><h4>${escapeHtml(item.title)}</h4><div class="button-row"><button class="button-secondary" data-keep-media="${escapeHtml(item.id)}">Keep + seed</button><button class="button-ghost" data-add-draft-child="${escapeHtml(item.id)}">Add to collection draft</button></div></article>`).join("") : `<div class="empty-state"><strong>No uploads yet.</strong><p class="empty-copy">This profile has not published any immutable media objects yet.</p></div>`}</div></div><div class="sheet">${blockTitle("Collections", "Original and curated collections signed by the collection creator.")}<div class="simple-list">${profile.collections.length ? profile.collections.map(item => `<article class="simple-item"><div class="meta-row"><span class="pill">${escapeHtml(item.type)}</span><span class="pill-ghost">${item.isCurated ? "curated" : "original"}</span></div><h4>${escapeHtml(item.title)}</h4><p>${escapeHtml(item.description || "No description")}</p><div class="meta-stack"><span class="mini-caption">Collection creator: @${escapeHtml(item.creatorUsername)}</span><span class="mini-caption">Child creators: ${escapeHtml(item.childCreatorUsernames.join(", ") || "none")}</span></div></article>`).join("") : `<div class="empty-state"><strong>No collections yet.</strong><p class="empty-copy">Use the collection editor to publish original or curated sets.</p></div>`}</div></div></div></section>`;
  }
  return `<section class="section-block"><div class="section-grid"><div class="sheet">${blockTitle("Followed Feed", "Uploads, collections, keeps, and follow actions from accounts you follow.")}${snapshot.feed.length ? `<div class="activity-stack">${snapshot.feed.map(item => `<article class="activity-card"><div class="meta-row"><span class="pill">${escapeHtml(item.kind)}</span><span class="pill-ghost">${escapeHtml(item.actorUsername)}</span><span class="pill-ghost">${escapeHtml(shortId(item.actorAccountId))}</span></div><h4>${escapeHtml(item.subjectTitle)}</h4><p>${escapeHtml(item.summary)}</p><div class="meta-row"><span class="mini-caption">${escapeHtml(item.createdAt)}</span></div></article>`).join("")}</div>` : `<div class="empty-state"><strong>No followed activity yet.</strong><p class="empty-copy">Follow a verified account to make the feed resolve their signed uploads, collections, keeps, and follow actions.</p></div>`}</div><div class="sheet">${blockTitle("Suggested Next Steps", "The vertical slice is centered on identity, signed state, and authorship.")}<div class="simple-list"><article class="simple-item"><h4>1. Follow a demo account</h4><p>The feed stays identity-first: actor account ids drive resolution, usernames are display only.</p></article><article class="simple-item"><h4>2. Publish media</h4><p>Every media object is immutable. New bytes mean a new object id and new signed metadata.</p></article><article class="simple-item"><h4>3. Curate across creators</h4><p>Collection authorship and media authorship remain separate and visible in both data and UI.</p></article></div></div></div></section>`;
}

async function fileToInput(file: File, mediaType: string) {
  if (mediaType === "text") return { title: file.name.replace(/\.[^.]+$/, ""), description: "", mediaType, fileName: file.name, dataUrl: null, textPreview: (await file.text()).slice(0, 260) };
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });
  return { title: file.name.replace(/\.[^.]+$/, ""), description: "", mediaType, fileName: file.name, dataUrl, textPreview: null };
}

async function renderApp(root: HTMLElement, controller: ReturnType<typeof createAppController>) {
  const snapshot = await controller.buildSnapshot();
  const state = controller.getState();
  root.innerHTML = `<div class="app-shell"><aside class="sidebar"><div class="brand-lockup"><span class="brand-pill">desktop-first prototype</span><h1 class="brand-title">Yolk</h1><p class="brand-copy">A decentralized media graph where public keys are identity, account heads are mutable pointers, and collections are the main publishing surface.</p></div><nav class="nav-stack">${[["home", "Home / Feed", "Followed uploads, keeps, and collections."], ["discover", "Discover", "Search labels, resolve by account id."], ["library", "Library", "Keeps are local saves with seeding intent."], ["profile", "Profile", "Verified profile, uploads, and collections."], ["upload", "Upload / Create", "Publish immutable media metadata."], ["collections", "Collection Editor", "Compose original or curated sets."]].map(([id, title, copy]) => `<button class="nav-button ${snapshot.activeSection === id ? "is-active" : ""}" data-nav="${id}"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(copy)}</span></button>`).join("")}</nav><div class="identity-chip"><h3>${escapeHtml(snapshot.currentAccount?.displayName || "No local account yet")}</h3><p>${escapeHtml(snapshot.currentAccount ? `@${snapshot.currentAccount.username}` : "Create a keypair to start publishing signed state.")}</p><span class="account-id">${escapeHtml(snapshot.currentAccount?.accountId || "public key identity will appear here")}</span></div></aside><main class="main-panel"><section class="main-hero"><div class="hero-copy"><div class="meta-row"><span class="pill">public-key identity</span><span class="pill">signed account state</span><span class="pill">framework-free UI</span></div><h2>Publishing, discovery, curation, and keeping all follow the same rule: trust the account id first.</h2><p>The prototype keeps the network model intentionally simple: a mutable account head acts like a DHT-backed pointer, profiles and records are signed, media is immutable, and keeps are saved locally with seeding intent.</p></div><div class="hero-metrics"><article class="stat-card"><strong>Accounts</strong><span>${snapshot.network.accounts}</span></article><article class="stat-card"><strong>Media Objects</strong><span>${snapshot.network.media}</span></article><article class="stat-card"><strong>Collections</strong><span>${snapshot.network.collections}</span></article><article class="stat-card"><strong>Keeps</strong><span>${snapshot.network.keeps}</span></article><article class="stat-card"><strong>Follows</strong><span>${snapshot.network.follows}</span></article></div></section>${snapshot.flashMessage ? `<div class="flash">${escapeHtml(snapshot.flashMessage)} <button class="button-ghost" data-dismiss-flash="true">Dismiss</button></div>` : ""}${renderSection(snapshot, state)}</main><div class="detail-rail"><div class="section-block"><h3>Trust Model</h3><p class="detail-note">Canonical identity is always the public-key-derived account id. Profiles are mutable signed views, not the root source of truth.</p></div><div class="trust-list"><article class="trust-item"><strong>Selected Account</strong><p>${escapeHtml(snapshot.trust.selectedAccountId || "None selected")}</p></article><article class="trust-item"><strong>Mutable DHT Head</strong><p>${escapeHtml(snapshot.trust.selectedProfileRef || "No head yet")}</p></article><article class="trust-item"><strong>Head Sequence</strong><p>${snapshot.trust.selectedHeadSeq ?? "n/a"}</p></article><article class="trust-item"><strong>Verification Status</strong><p>${snapshot.trust.verifiedProfile ? "Verified against account key" : "Not verified"}</p></article></div><div class="section-block"><h3>Non-negotiables</h3><div class="simple-list"><article class="simple-item"><h4>Username is not identity</h4><p>Search can surface a label. Verification still resolves by account id through the signed head.</p></article><article class="simple-item"><h4>Keep = save + seed</h4><p>The prototype stores keeps locally and treats them as seeding intent, even though swarm transport is mocked.</p></article><article class="simple-item"><h4>Curation preserves authorship</h4><p>The collection creator and every referenced media creator remain separate fields and UI badges.</p></article></div></div></div></div>${snapshot.currentAccount ? "" : `<div class="onboarding"><div class="onboarding-card"><span class="brand-pill">create your first account</span><div class="onboarding-grid"><div class="section-block"><h2 class="brand-title">Generate a keypair and publish a signed profile.</h2><p class="section-copy">Usernames are only labels. The generated public key becomes the canonical identity, and the profile is published as signed state behind a mutable account head.</p><div class="simple-list"><article class="simple-item"><h4>Identity</h4><p>Public key-derived account id is the root source of truth.</p></article><article class="simple-item"><h4>Profile</h4><p>Username, display name, and bio become a signed public page for that identity.</p></article><article class="simple-item"><h4>Network</h4><p>A seeded demo graph is already available for discovery, browsing, following, and curation once your account exists.</p></article></div></div><form id="onboarding-form" class="sheet form-grid"><div class="field"><label for="onboarding-username">Username</label><input id="onboarding-username" name="username" placeholder="alice" required></div><div class="field"><label for="onboarding-display-name">Display name</label><input id="onboarding-display-name" name="displayName" placeholder="Alice Atlas" required></div><div class="field"><label for="onboarding-bio">Bio</label><textarea id="onboarding-bio" name="bio" placeholder="What do you publish or collect?"></textarea></div><div class="button-row"><button class="button-primary" type="submit">Create account</button></div></form></div></div></div>`}`;
}

export async function startApp(root: HTMLElement, storage: StorageLike = window.localStorage) {
  const controller = createAppController(storage);
  await controller.initialize();
  root.addEventListener("click", async event => {
    const target = (event.target as HTMLElement)?.closest?.("button");
    if (!target) return;
    let handled = true;
    if (target.dataset.nav) controller.setSection(target.dataset.nav as SectionName);
    else if (target.dataset.dismissFlash) controller.dismissFlash();
    else if (target.dataset.openProfile) await controller.openProfile(target.dataset.openProfile);
    else if (target.dataset.followAccount) { try { await controller.followAccount(target.dataset.followAccount); } catch (error) { console.error(error); } }
    else if (target.dataset.keepMedia) { try { await controller.keepMedia(target.dataset.keepMedia); } catch (error) { console.error(error); } }
    else if (target.dataset.addDraftChild) controller.addDraftChild(target.dataset.addDraftChild);
    else if (target.dataset.removeDraftChild) controller.removeDraftChild(target.dataset.removeDraftChild);
    else if (target.dataset.moveDraftChild) controller.moveDraftChild(target.dataset.moveDraftChild, (target.dataset.direction as "up" | "down") || "up");
    else if (target.dataset.resetDraft) controller.resetDraft();
    else handled = false;
    if (!handled) return;
    await renderApp(root, controller);
  });
  root.addEventListener("submit", async event => {
    const form = event.target as HTMLFormElement;
    if (!form) return;
    event.preventDefault();
    if (form.id === "onboarding-form") {
      const data = new FormData(form);
      await controller.createAccount({ username: String(data.get("username") || ""), displayName: String(data.get("displayName") || ""), bio: String(data.get("bio") || "") });
    } else if (form.id === "search-form") {
      const data = new FormData(form);
      const accountId = String(data.get("accountId") || "").trim();
      if (accountId) await controller.openProfile(accountId);
      else { await controller.search(String(data.get("query") || "")); controller.setSection("discover"); }
    } else if (form.id === "upload-form") {
      const data = new FormData(form);
      const file = data.get("file");
      const mediaType = String(data.get("mediaType") || "image");
      if (file instanceof File) {
        const upload = await fileToInput(file, mediaType);
        upload.title = String(data.get("title") || upload.title);
        upload.description = String(data.get("description") || "");
        await controller.uploadMedia(upload);
        controller.setSection("profile");
      }
    } else if (form.id === "collection-form") {
      const data = new FormData(form);
      const draftChildren = controller.getState().local.collectionDraftChildIds.slice();
      await controller.createCollection({ title: String(data.get("title") || ""), type: String(data.get("type") || ""), description: String(data.get("description") || ""), isCurated: String(data.get("isCurated") || "false") === "true", childIds: draftChildren });
    }
    await renderApp(root, controller);
  }, { capture: true });
  await renderApp(root, controller);
}

if (typeof document !== "undefined") {
  const root = document.getElementById("app");
  if (root) {
    startApp(root).catch(error => {
      console.error(error);
      root.innerHTML = `<pre>${escapeHtml(String(error))}</pre>`;
    });
  }
}
