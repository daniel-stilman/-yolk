/**
 * Yolk desktop-first application.
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

export type SectionName = "discover" | "library" | "profile" | "upload";
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
  packageKind?: string | null;
  libraryPath?: string[];
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
type PackageKind = "album" | "audiobook" | "movie" | "show" | "art" | "graphic_novel";
type UploadDraftRow = { id: string; title: string; fileName: string; mediaType: string; sizeLabel: string };
type LocalStore = {
  currentAccountId: string | null;
  publicJwk: JsonWebKey | null;
  privateJwk: JsonWebKey | null;
  activeSection: SectionName;
  selectedProfileAccountId: string | null;
  searchOpen: boolean;
  flashMessage: string;
  collectionDraftChildIds: string[];
  libraryBrowsePath: string[];
  libraryLayout: Record<string, { x: number; y: number }>;
  overlayMode: "media" | "folder" | null;
  collectionOverlayRef: string | null;
  uploadDraftKind: PackageKind;
  uploadDraftTitle: string;
  uploadDraftDescription: string;
  uploadDraftSeriesTitle: string;
  uploadDraftSeasonLabel: string;
  uploadDraftRows: UploadDraftRow[];
};

type SearchResult = { accountId: string; username: string; displayName: string; verified: boolean };
type FeedItem = {
  id: string;
  kind: "post" | ActivityRecord["kind"];
  actorAccountId: string;
  actorUsername: string;
  subjectTitle: string;
  createdAt: string;
  summary: string;
  collectionRef?: string;
  post?: ProfileSummary["collections"][number];
};
type LibraryItem = { id: string; ref?: string; title: string; mediaType: string; creatorAccountId: string; creatorUsername: string; description: string; contentRef: string; thumbnailRef: string | null; assetUrl?: string | null };
type WorkspaceItem = LibraryItem & {
  kind: "media" | "collection";
  coverRef?: string | null;
  coverAssetUrl?: string | null;
  childCount?: number;
  saved?: boolean;
  owned?: boolean;
  updatedAt?: string;
};
type ProfileSummary = {
  accountId: string;
  username: string;
  displayName: string;
  bio: string;
  verified: boolean;
  uploads: Array<{ id: string; title: string; mediaType: string; creatorAccountId: string; contentRef: string; thumbnailRef: string | null }>;
  collections: Array<{
    sourceKind?: "collection" | "media";
    id: string;
    ref?: string;
    title: string;
    type: string;
    packageKind?: string | null;
    libraryPath?: string[];
    isCurated: boolean;
    description: string;
    coverMediaRef?: string | null;
    creatorUsername: string;
    childCreatorUsernames: string[];
    liked?: boolean;
    owned?: boolean;
    children: Array<{
      kind: "media" | "collection";
      id: string;
      ref?: string;
      title: string;
      mediaType: string;
      creatorAccountId: string;
      creatorUsername: string;
      description: string;
      contentRef: string;
      thumbnailRef: string | null;
      assetUrl?: string | null;
      downloaded?: boolean;
    }>;
    updatedAt?: string;
  }>;
};
export type AppSnapshot = {
  currentAccount: { accountId: string; username: string; displayName: string } | null;
  activeSection: SectionName;
  discoverQuery: string;
  selectedProfile: ProfileSummary | null;
  searchResults: SearchResult[];
  feed: FeedItem[];
  library: { keptCount: number; keptTitles: string[]; keptMedia: LibraryItem[]; items: WorkspaceItem[]; collections: ProfileSummary["collections"] };
  network: { accounts: number; media: number; collections: number; keeps: number; follows: number };
  trust: { selectedAccountId: string | null; selectedHeadSeq: number | null; selectedProfileRef: string | null; resolvedViaDhtHead: boolean; verifiedProfile: boolean };
  suggestions: SearchResult[];
  draftChildren: LibraryItem[];
  shelfMedia?: Array<LibraryItem & { ref?: string }>;
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
const LIBRARY_LAYOUT_STORAGE_KEY = "yolk.library-layout.v1";

const PACKAGE_KIND_OPTIONS: Array<{ value: PackageKind; label: string }> = [
  { value: "album", label: "Music" },
  { value: "audiobook", label: "Audiobook" },
  { value: "movie", label: "Movie" },
  { value: "show", label: "Show" },
  { value: "art", label: "Art" },
  { value: "graphic_novel", label: "Graphic Novel" }
];
const LOOSE_MEDIA_LIBRARY_LABELS: Record<string, string> = {
  audio: "Music",
  video: "Movies",
  image: "Art",
  text: "Reading"
};
const LEGACY_LIBRARY_ROOT_LABELS: Record<string, string> = {
  Audio: "Music",
  Video: "Movies",
  Images: "Art",
  Texts: "Reading"
};
const PACKAGE_KIND_ROOT_LABELS: Record<string, string> = {
  album: "Music",
  audiobook: "Audiobooks",
  movie: "Movies",
  show: "Shows",
  art: "Art",
  graphic_novel: "Graphic Novels"
};
const COLLECTION_TYPE_ROOT_LABELS: Record<string, string> = {
  gallery: "Art",
  album: "Music",
  playlist: "Music",
  audiobook: "Audiobooks",
  book: "Reading",
  movie: "Movies",
  series: "Shows",
  season: "Shows",
  show: "Shows",
  "graphic-novel": "Graphic Novels",
  graphic_novel: "Graphic Novels"
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const uniq = (values: string[]) => Array.from(new Set(values));
const nowIso = () => new Date().toISOString();
const shortId = (value: string) => (!value ? "" : value.length <= 18 ? value : `${value.slice(0, 10)}…${value.slice(-6)}`);
const sanitizeHandle = (value: string) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24);
const escapeHtml = (value: string) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const sortDesc = <T extends { createdAt?: string; updatedAt?: string; id?: string }>(a: T, b: T) => (a.createdAt || a.updatedAt || "") > (b.createdAt || b.updatedAt || "") ? -1 : (a.createdAt || a.updatedAt || "") < (b.createdAt || b.updatedAt || "") ? 1 : (a.id || "").localeCompare(b.id || "");
const emptyUploadDraft = () => ({ uploadDraftKind: "album" as PackageKind, uploadDraftTitle: "", uploadDraftDescription: "", uploadDraftSeriesTitle: "", uploadDraftSeasonLabel: "", uploadDraftRows: [] as UploadDraftRow[] });
const fileBaseTitle = (fileName: string) => String(fileName || "").replace(/\.[^.]+$/, "");
const fileSizeLabel = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

function inferMediaTypeFromFile(file: File) {
  const fileType = String(file.type || "").toLowerCase();
  const fileName = String(file.name || "").toLowerCase();
  if (fileType.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/.test(fileName)) return "image";
  if (fileType.startsWith("audio/") || /\.(mp3|wav|ogg|m4a)$/.test(fileName)) return "audio";
  if (fileType.startsWith("video/") || /\.(mp4|webm|mov|mkv)$/.test(fileName)) return "video";
  if (fileType.startsWith("text/") || /\.(txt|md|json)$/.test(fileName)) return "text";
  return null;
}

function inferCollectionLibraryRoot(item: ProfileSummary["collections"][number]) {
  if (item.packageKind && PACKAGE_KIND_ROOT_LABELS[item.packageKind]) return PACKAGE_KIND_ROOT_LABELS[item.packageKind];
  if (COLLECTION_TYPE_ROOT_LABELS[item.type]) return COLLECTION_TYPE_ROOT_LABELS[item.type];
  const mediaChildren = item.children.filter(child => child.kind === "media");
  const mediaTypes = mediaChildren.map(child => child.mediaType);
  if (!mediaTypes.length) return "Art";
  const uniqueTypes = [...new Set(mediaTypes)];
  if (uniqueTypes.length === 1) {
    if (uniqueTypes[0] === "audio") return "Music";
    if (uniqueTypes[0] === "video") return mediaChildren.length > 1 ? "Shows" : "Movies";
    if (uniqueTypes[0] === "image") return "Art";
    if (uniqueTypes[0] === "text") return "Reading";
  }
  if (mediaTypes.every(type => type === "image" || type === "video")) return item.type === "series" ? "Shows" : "Art";
  if (mediaTypes.every(type => type === "audio" || type === "text")) return uniqueTypes.includes("audio") ? (item.type === "series" ? "Audiobooks" : "Music") : "Reading";
  return "Art";
}

function libraryPathForCollection(item: ProfileSummary["collections"][number]) {
  if (Array.isArray(item.libraryPath) && item.libraryPath.length) {
    const normalized = item.libraryPath.map(part => String(part || "").trim()).filter(Boolean);
    if (!normalized.length) return [inferCollectionLibraryRoot(item)];
    if (LEGACY_LIBRARY_ROOT_LABELS[normalized[0]]) return [LEGACY_LIBRARY_ROOT_LABELS[normalized[0]], ...normalized.slice(1)];
    if (normalized[0] !== "Collections") return normalized;
    return [inferCollectionLibraryRoot(item), ...normalized.slice(1)];
  }
  if (item.sourceKind === "media") return [LOOSE_MEDIA_LIBRARY_LABELS[item.type] || "Media"];
  return [inferCollectionLibraryRoot(item)];
}

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
const emptyLocal = (): LocalStore => ({ currentAccountId: null, publicJwk: null, privateJwk: null, activeSection: "discover", selectedProfileAccountId: null, searchOpen: false, flashMessage: "", collectionDraftChildIds: [], libraryBrowsePath: [], libraryLayout: {}, overlayMode: null, collectionOverlayRef: null, ...emptyUploadDraft() });
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

async function createCollection(network: NetworkStore, keys: AccountKeys, input: { title: string; type: string; description: string; isCurated: boolean; childIds: string[]; coverId?: string | null; packageKind?: string | null; libraryPath?: string[] }, now: string) {
  const id = `col_${(await sha256Hex(`${keys.accountId}:${input.title}:${now}`)).slice(0, 24)}`;
  const coverRef = input.coverId ? (network.media[input.coverId]?.thumbnailRef || network.media[input.coverId]?.contentRef || null) : (input.childIds.map(childId => network.media[childId]?.thumbnailRef || null).find(Boolean) || null);
  const record: CollectionRecord = { id, creatorAccountId: keys.accountId, title: String(input.title || "").trim() || "Untitled collection", type: String(input.type || "").trim() || "folder", packageKind: input.packageKind || null, libraryPath: Array.isArray(input.libraryPath) ? input.libraryPath : [], description: String(input.description || "").trim(), coverRef, children: input.childIds.map(childId => ({ kind: network.collections[childId] ? "collection" : "media", id: childId })), isCurated: Boolean(input.isCurated), updatedAt: now, signature: "" };
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
  await addActivity(network, keys, "keep", id, `Downloaded and seeding: ${network.media[mediaId]?.title || mediaId}`, now);
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
  const profiles = new Map<string, ProfileSummary | null>(await Promise.all([...actors].map(async accountId => [accountId, await buildProfileSummary(network, accountId)] as [string, ProfileSummary | null])));
  const items = await Promise.all(Object.values(network.activities)
    .filter(item => actors.has(item.actorAccountId) && item.kind === "collection")
    .sort(sortDesc)
    .map(async item => {
      const profile = profiles.get(item.actorAccountId) || null;
      const post = profile?.collections.find(collection => collection.ref === item.subjectId) || undefined;
      return {
        id: item.id,
        kind: "post" as const,
        actorAccountId: item.actorAccountId,
        actorUsername: await usernameFor(network, item.actorAccountId),
        subjectTitle: post?.title || await subjectTitle(network, item),
        createdAt: item.createdAt,
        summary: item.summary,
        collectionRef: item.subjectId,
        post
      };
    }));
  return items.filter(item => item.post);
}

async function buildLibrary(network: NetworkStore, accountId: string | null): Promise<AppSnapshot["library"]> {
  if (!accountId) return { keptCount: 0, keptTitles: [], keptMedia: [], items: [], collections: [] };
  const items: WorkspaceItem[] = [];
  const keptMedia = (await Promise.all(Object.values(network.keeps).filter(item => item.accountId === accountId).sort(sortDesc).map(async item => {
    const media = network.media[item.mediaId];
    if (!media) return null;
    return { id: media.id, ref: media.id, kind: "media", title: media.title, mediaType: media.mediaType, creatorAccountId: media.creatorAccountId, creatorUsername: await usernameFor(network, media.creatorAccountId), description: media.description, contentRef: media.contentRef, thumbnailRef: media.thumbnailRef, saved: true, owned: media.creatorAccountId === accountId, updatedAt: item.createdAt } as WorkspaceItem;
  }))).filter(Boolean) as LibraryItem[];
  Object.values(network.collections).filter(item => item.creatorAccountId === accountId).sort(sortDesc).forEach(item => {
    items.push({
      id: item.id,
      ref: item.id,
      kind: "collection",
      title: item.title,
      mediaType: "folder",
      creatorAccountId: item.creatorAccountId,
      creatorUsername: "",
      description: item.description,
      contentRef: "",
      thumbnailRef: null,
      coverRef: item.coverRef,
      childCount: item.children.length,
      owned: true,
      saved: false,
      updatedAt: item.updatedAt
    });
  });
  Object.values(network.media).filter(item => item.creatorAccountId === accountId).sort(sortDesc).forEach(item => {
    items.push({
      id: item.id,
      ref: item.id,
      kind: "media",
      title: item.title,
      mediaType: item.mediaType,
      creatorAccountId: item.creatorAccountId,
      creatorUsername: "",
      description: item.description,
      contentRef: item.contentRef,
      thumbnailRef: item.thumbnailRef,
      saved: false,
      owned: true,
      updatedAt: item.createdAt
    });
  });
  items.push(...(keptMedia as WorkspaceItem[]));
  return { keptCount: keptMedia.length, keptTitles: keptMedia.map(item => item.title), keptMedia, items, collections: [] };
}

async function buildProfileSummary(network: NetworkStore, accountId: string | null): Promise<ProfileSummary | null> {
  if (!accountId) return null;
  const resolved = await resolveVerifiedProfile(network, accountId);
  if (!resolved) return null;
  const uploads = Object.values(network.media).filter(item => item.creatorAccountId === accountId).sort(sortDesc).map(item => ({ id: item.id, title: item.title, mediaType: item.mediaType, creatorAccountId: item.creatorAccountId, contentRef: item.contentRef, thumbnailRef: item.thumbnailRef }));
  const collections = await Promise.all(Object.values(network.collections).filter(item => item.creatorAccountId === accountId).sort(sortDesc).map(async item => {
    const children = (await Promise.all(item.children.map(async child => {
      if (child.kind === "collection") {
        const record = network.collections[child.id];
        if (!record) return null;
        return {
          kind: "collection" as const,
          id: record.id,
          title: record.title,
          mediaType: "collection",
          creatorAccountId: record.creatorAccountId,
          creatorUsername: await usernameFor(network, record.creatorAccountId),
          description: record.description,
          contentRef: record.coverRef || "",
          thumbnailRef: record.coverRef
        };
      }
      const media = network.media[child.id];
      if (!media) return null;
      return {
        kind: "media" as const,
        id: media.id,
        title: media.title,
        mediaType: media.mediaType,
        creatorAccountId: media.creatorAccountId,
        creatorUsername: await usernameFor(network, media.creatorAccountId),
        description: media.description,
        contentRef: media.contentRef,
        thumbnailRef: media.thumbnailRef
      };
    }))).filter(Boolean) as ProfileSummary["collections"][number]["children"];
    return {
      id: item.id,
      ref: item.id,
      title: item.title,
      type: item.type,
      packageKind: item.packageKind || null,
      libraryPath: Array.isArray(item.libraryPath) ? item.libraryPath : [],
      isCurated: item.isCurated,
      description: item.description,
      coverMediaRef: item.coverRef,
      creatorUsername: await usernameFor(network, item.creatorAccountId),
      childCreatorUsernames: uniq(children.map(child => child.creatorUsername)),
      children
    };
  }));
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
  const openLight = await createMedia(network, sol, { title: "Open Light", description: "A late-night single published for playback.", mediaType: "audio", fileName: "open-light.mp3", dataUrl: null, textPreview: "Audio placeholder for playback and metadata flows.", thumbnailRef: demoSvg("Open Light", "#efb134") }, now());
  await createCollection(network, sol, { title: "Harbor Studies", type: "gallery", packageKind: "art", libraryPath: ["Art"], description: "Sol's still-image release from the harbor run at dusk.", isCurated: false, childIds: [amber.id] }, now());
  await createCollection(network, sol, { title: "Open Light", type: "album", packageKind: "album", libraryPath: ["Music"], description: "Sol's late-night single packaged for playback.", isCurated: false, childIds: [openLight.id] }, now());
  const night = await createMedia(network, noor, { title: "Night Transit", description: "A moving-image release sequenced for late playback.", mediaType: "video", fileName: "night-transit.mp4", dataUrl: null, textPreview: null, thumbnailRef: demoSvg("Night Transit", "#d98b2f") }, now());
  const bloom = await createMedia(network, noor, { title: "Signal Bloom", description: "Companion still from the Night Transit package.", mediaType: "image", fileName: "signal-bloom.svg", dataUrl: demoSvg("Signal Bloom", "#d98b2f"), textPreview: null }, now());
  await createCollection(network, noor, { title: "Night Transit", type: "movie", packageKind: "movie", libraryPath: ["Movies"], description: "Noor's night-run film package with its companion still.", isCurated: false, childIds: [night.id, bloom.id] }, now());
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
      local.activeSection = "discover";
      setFlash("");
      save();
      return keys.accountId;
    },
    async uploadMedia(input: { title: string; description: string; mediaType: string; fileName: string; dataUrl: string | null; textPreview: string | null; thumbnailRef?: string | null }) {
      const record = await createMedia(network, await currentKeys(), input, now());
      local.collectionDraftChildIds = uniq([...local.collectionDraftChildIds, record.id]);
      local.activeSection = "library";
      local.overlayMode = null;
      setFlash("Added to draft.");
      save();
      return record;
    },
    async createCollection(input: { title: string; type: string; description: string; isCurated: boolean; childIds: string[]; coverId?: string | null }) {
      const keys = await currentKeys();
      const record = await createCollection(network, keys, input, now());
      local.collectionDraftChildIds = [];
      local.selectedProfileAccountId = keys.accountId;
      local.activeSection = "library";
      local.overlayMode = null;
      setFlash("Folder created.");
      save();
      return record;
    },
    async keepMedia(mediaId: string) {
      await createKeep(network, await currentKeys(), mediaId, now());
      setFlash("Downloaded and seeding.");
      save();
    },
    async followAccount(accountId: string) {
      const keys = await currentKeys();
      if (accountId === keys.accountId) {
        setFlash("You're already here.");
        save();
        return;
      }
      await createFollow(network, keys, accountId, now());
      setFlash("Following.");
      save();
    },
    async openProfile(accountId: string) {
      const profile = await resolveVerifiedProfile(network, accountId);
      if (!profile) {
        setFlash("Profile unavailable.");
        save();
        return false;
      }
      local.selectedProfileAccountId = accountId;
      local.activeSection = "profile";
      setFlash("");
      save();
      return true;
    },
    async search(query: string) {
      setFlash("");
      save();
      return searchProfiles(network, query);
    },
    setSection(section: SectionName) { local.activeSection = section; if (section === "library") local.libraryBrowsePath = []; save(); },
    openOverlay(mode: "media" | "folder") { local.overlayMode = mode; local.collectionOverlayRef = null; local.activeSection = "library"; save(); },
    closeOverlay() { local.overlayMode = null; local.collectionOverlayRef = null; save(); },
    openCollection(ref: string) { local.collectionOverlayRef = ref; local.overlayMode = null; save(); },
    closeCollection() { local.collectionOverlayRef = null; save(); },
    openLibraryPath(pathKey: string) { local.libraryBrowsePath = String(pathKey || "").split(">").map(part => part.trim()).filter(Boolean); save(); },
    openLibraryRoot() { local.libraryBrowsePath = []; save(); },
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
        discoverQuery: "",
        selectedProfile: selected,
        searchResults: [],
        feed: await buildFeed(network, local.currentAccountId),
        library: await buildLibrary(network, local.currentAccountId),
        network: { accounts: Object.keys(network.accounts).length, media: Object.keys(network.media).length, collections: Object.keys(network.collections).length, keeps: Object.keys(network.keeps).length, follows: Object.keys(network.follows).length },
        trust: { selectedAccountId: selected?.accountId || null, selectedHeadSeq: selectedHead?.seq || null, selectedProfileRef: selectedHead?.profileRef || null, resolvedViaDhtHead: Boolean(selectedHead), verifiedProfile: Boolean(selected?.verified) },
        suggestions: await suggestions(network, local.currentAccountId),
        draftChildren,
        shelfMedia: (await Promise.all(Object.values(network.media).sort(sortDesc).map(async media => ({
          id: media.id,
          ref: media.id,
          title: media.title,
          mediaType: media.mediaType,
          creatorAccountId: media.creatorAccountId,
          creatorUsername: await usernameFor(network, media.creatorAccountId),
          description: media.description,
          contentRef: media.contentRef,
          thumbnailRef: media.thumbnailRef
        })))),
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
  const assetUrl = (item as any).assetUrl || null;
  const blob = network?.blobs?.[item.thumbnailRef || item.contentRef];
  if (item.mediaType === "image" && assetUrl) return `<div class="media-preview"><img src="${escapeHtml(assetUrl)}" alt=""></div>`;
  if (item.mediaType === "video" && assetUrl) return `<div class="media-preview"><video controls preload="metadata" src="${escapeHtml(assetUrl)}"></video></div>`;
  if (item.mediaType === "audio" && assetUrl) return `<div class="media-preview"><audio controls preload="metadata" src="${escapeHtml(assetUrl)}"></audio></div>`;
  if (item.mediaType === "image" && blob?.dataUrl) return `<div class="media-preview"><img src="${escapeHtml(blob.dataUrl)}" alt=""></div>`;
  if (item.mediaType === "video" && blob?.dataUrl) return `<div class="media-preview"><video controls src="${escapeHtml(blob.dataUrl)}"></video></div>`;
  if (item.mediaType === "audio" && blob?.dataUrl) return `<div class="media-preview"><audio controls src="${escapeHtml(blob.dataUrl)}"></audio></div>`;
  if (item.mediaType === "text") return `<div class="media-preview text-preview">${escapeHtml(network?.blobs?.[item.contentRef]?.textPreview || "Text object")}</div>`;
  return `<div class="media-preview">${escapeHtml(item.mediaType.toUpperCase())}</div>`;
}

function blockTitle(title: string, copy = "") {
  return `<div class="section-header"><div><h3 class="subsection-title">${escapeHtml(title)}</h3>${copy ? `<p>${escapeHtml(copy)}</p>` : ""}</div></div>`;
}

function networkUsername(network: NetworkStore, accountId: string) {
  const head = network?.heads?.[accountId];
  return head ? network.profiles[head.profileRef]?.username || "unknown" : "unknown";
}

function renderProfileLink(accountId: string, username: string, label?: string) {
  return `<button class="profile-link" data-open-profile="${escapeHtml(accountId)}">${escapeHtml(label || `@${username}`)}</button>`;
}

function renderDiscoverProfileCard(item: SearchResult, currentAccountId: string | null) {
  const canFollow = Boolean(currentAccountId && item.accountId !== currentAccountId);
  return `<article class="simple-item">
    <div class="simple-item-copy">
      <h4>${escapeHtml(item.displayName)}</h4>
      <p>@${escapeHtml(item.username)}</p>
    </div>
    <div class="button-row">
      <button class="button-secondary" data-open-profile="${escapeHtml(item.accountId)}">Open</button>
      ${canFollow ? `<button class="button-primary" data-follow-account="${escapeHtml(item.accountId)}">Follow</button>` : ""}
    </div>
  </article>`;
}

function renderHeaderSearchResultCard(item: SearchResult, currentAccountId: string | null) {
  const canFollow = Boolean(currentAccountId && item.accountId !== currentAccountId);
  return `<article class="header-search-result simple-item">
    <div class="simple-item-copy">
      <h4>${escapeHtml(item.displayName)}</h4>
      <p>@${escapeHtml(item.username)}</p>
    </div>
    <div class="button-row">
      <button class="button-secondary" type="button" data-open-profile="${escapeHtml(item.accountId)}">Open</button>
      ${canFollow ? `<button class="button-primary" type="button" data-follow-account="${escapeHtml(item.accountId)}">Follow</button>` : ""}
    </div>
  </article>`;
}

function renderCollectionPreviewItem(
  child: ProfileSummary["collections"][number]["children"][number],
  network: NetworkStore,
  actions: { canKeep: boolean }
) {
  const keepToken = (child as any).ref || child.id;
  const keepButton = actions.canKeep && child.kind === "media"
    ? renderDownloadButton({
        active: Boolean(child.downloaded),
        action: "keep-media",
        value: keepToken,
        compact: true,
        label: child.downloaded ? "Downloaded and seeding" : "Download"
      })
    : "";
  const preview = child.kind === "media"
    ? previewHtml({ mediaType: child.mediaType, contentRef: child.contentRef, thumbnailRef: child.thumbnailRef, assetUrl: child.assetUrl || null } as any, network)
    : `<div class="media-preview media-preview--collection"><span>${escapeHtml(child.title.slice(0, 1) || "C")}</span></div>`;
  return `<article class="post-child-card" data-media-title="${child.kind === "media" ? escapeHtml(child.title) : ""}">
    ${preview}
    <div class="post-child-meta">
      <div class="meta-row">
        <span class="pill">${escapeHtml(child.mediaType)}</span>
        ${renderProfileLink(child.creatorAccountId, child.creatorUsername)}
      </div>
      <h5>${escapeHtml(child.title)}</h5>
      ${child.description ? `<p>${escapeHtml(child.description)}</p>` : ""}
      ${keepButton ? `<div class="button-row">${keepButton}</div>` : ""}
    </div>
  </article>`;
}

function renderCollectionMode(item: ProfileSummary["collections"][number]) {
  return `<span class="pill-ghost">${item.isCurated ? "curated" : "original"}</span>`;
}

function renderCollectionType(item: ProfileSummary["collections"][number]) {
  return item.type === "curated" && item.isCurated ? "" : `<span class="pill">${escapeHtml(item.type)}</span>`;
}

function renderDownloadButton(input: { active: boolean; action: "keep-media" | "keep-collection" | "unkeep-collection"; value: string; compact?: boolean; label: string }) {
  return `<button class="download-button ${input.active ? "is-active" : ""} ${input.compact ? "download-button--compact" : ""}" type="button" aria-pressed="${input.active ? "true" : "false"}" aria-label="${escapeHtml(input.label)}" data-${input.action}="${escapeHtml(input.value)}"><span class="download-button-heart" aria-hidden="true"><span class="download-button-heart-glyph">♥</span><span class="download-button-arrow">${input.active ? "↑" : "↓"}</span></span><span class="visually-hidden">${escapeHtml(input.label)}</span></button>`;
}

function renderCollectionDownloadButton(item: ProfileSummary["collections"][number], interactive: boolean) {
  if (!interactive || !item.ref || item.sourceKind === "media" || item.owned) return "";
  if (item.liked) return renderDownloadButton({ active: true, action: "unkeep-collection", value: item.ref, label: "Downloaded and seeding" });
  return renderDownloadButton({ active: false, action: "keep-collection", value: item.ref, label: "Download" });
}

function renderCollectionCard(
  item: ProfileSummary["collections"][number],
  network: NetworkStore,
  options: { canKeepChildren: boolean; canKeepCollection?: boolean; clickable?: boolean }
) {
  const collectionDownloadButton = renderCollectionDownloadButton(item, Boolean(options.canKeepCollection));
  return `<article class="post-card ${options.clickable ? "post-card--clickable" : ""}" ${options.clickable && item.ref ? `data-open-collection="${escapeHtml(item.ref)}"` : ""}>
    <div class="post-card-head">
      <div class="meta-row meta-row--spread">
        <div class="meta-row">
          ${renderCollectionType(item)}
          ${renderCollectionMode(item)}
        </div>
        <div class="button-row">
          ${collectionDownloadButton}
        </div>
      </div>
      <h4>${escapeHtml(item.title)}</h4>
      ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}
    </div>
    <div class="post-child-grid">
      ${item.children.length ? item.children.map(child => renderCollectionPreviewItem(child, network, { canKeep: options.canKeepChildren })).join("") : `<div class="empty-state empty-state--tight"></div>`}
    </div>
  </article>`;
}

function renderFeedPostCard(item: FeedItem, network: NetworkStore, downloadedMediaRefs: Set<string>) {
  if (!item.post) {
    return `<article class="activity-card"><div class="meta-row"><span class="pill">${escapeHtml(item.kind)}</span>${renderProfileLink(item.actorAccountId, item.actorUsername)}</div><h4>${escapeHtml(item.subjectTitle)}</h4><p>${escapeHtml(item.summary)}</p></article>`;
  }
  const post = withDownloadedChildren(item.post, downloadedMediaRefs);
  return `<article class="activity-card feed-post-card" data-feed-title="${escapeHtml(item.post.title)}" ${item.collectionRef ? `data-open-collection="${escapeHtml(item.collectionRef)}"` : ""}>
    <div class="feed-post-head">
      <div class="meta-row">
        ${renderProfileLink(item.actorAccountId, item.actorUsername)}
        ${renderCollectionType(post)}
        ${renderCollectionMode(post)}
      </div>
      <div class="button-row">
        ${renderCollectionDownloadButton(post, true)}
      </div>
    </div>
    <div class="post-card-head">
      <h4>${escapeHtml(post.title)}</h4>
      ${(post.description || item.summary) ? `<p>${escapeHtml(post.description || item.summary)}</p>` : ""}
    </div>
    <div class="post-child-grid">
      ${post.children.length ? post.children.map(child => renderCollectionPreviewItem(child, network, { canKeep: false })).join("") : `<div class="empty-state empty-state--tight"></div>`}
    </div>
  </article>`;
}

function withDownloadedChildren(collection: ProfileSummary["collections"][number], downloadedMediaRefs: Set<string>) {
  return {
    ...collection,
    children: collection.children.map(child => ({
      ...child,
      downloaded: Boolean(child.kind === "media" && child.ref && downloadedMediaRefs.has(child.ref))
    }))
  };
}

type LibraryMediaEntry = ProfileSummary["collections"][number]["children"][number];
type LibraryFolderNode = {
  label: string;
  pathKey: string;
  folders: Map<string, LibraryFolderNode>;
  media: LibraryMediaEntry[];
  collection: ProfileSummary["collections"][number] | null;
};

function createLibraryFolderNode(label: string, pathKey: string): LibraryFolderNode {
  return { label, pathKey, folders: new Map(), media: [], collection: null };
}

function compareLibraryLabels(left: string, right: string) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

function buildLibraryTree(collections: ProfileSummary["collections"] = []) {
  const root = createLibraryFolderNode("library", "");

  const ensureFolder = (path: string[]) => {
    let current = root;
    let pathSoFar: string[] = [];
    for (const segment of path) {
      pathSoFar = [...pathSoFar, segment];
      if (!current.folders.has(segment)) current.folders.set(segment, createLibraryFolderNode(segment, pathSoFar.join(">")));
      current = current.folders.get(segment)!;
    }
    return current;
  };

  const insertChildren = (folderPath: string[], children: Array<LibraryMediaEntry & { children?: LibraryMediaEntry[] }> = []) => {
    const folder = ensureFolder(folderPath);
    for (const child of children) {
      if (child.kind === "media") {
        folder.media.push(child);
        continue;
      }
      const nestedPath = [...folderPath, child.title];
      ensureFolder(nestedPath);
      if (Array.isArray((child as any).children) && (child as any).children.length) insertChildren(nestedPath, (child as any).children);
    }
  };

  for (const item of collections) {
    const basePath = libraryPathForCollection(item);
    if (item.sourceKind === "media") {
      insertChildren(basePath, item.children as Array<LibraryMediaEntry & { children?: LibraryMediaEntry[] }>);
      continue;
    }
    const packagePath = [...basePath, item.title];
    const folder = ensureFolder(packagePath);
    folder.collection = item;
    insertChildren(packagePath, item.children as Array<LibraryMediaEntry & { children?: LibraryMediaEntry[] }>);
  }

  return root;
}

function resolveLibraryBrowse(root: LibraryFolderNode, browsePath: string[] = []) {
  let current = root;
  const resolvedPath: string[] = [];
  for (const segment of browsePath) {
    const next = current.folders.get(segment);
    if (!next) break;
    current = next;
    resolvedPath.push(next.label);
  }
  return {
    path: resolvedPath,
    current,
    folders: [...current.folders.values()].sort((left, right) => compareLibraryLabels(left.label, right.label)),
    media: [...current.media]
  };
}

function describeLibraryFolder(node: LibraryFolderNode) {
  const parts = [];
  if (node.folders.size) parts.push(`${node.folders.size} folder${node.folders.size === 1 ? "" : "s"}`);
  if (node.media.length) parts.push(`${node.media.length} item${node.media.length === 1 ? "" : "s"}`);
  return parts.join(" · ") || "Open";
}

function renderLibraryBreadcrumb(path: string[]) {
  return `<div class="library-breadcrumbs" aria-label="Library path">
    ${path.length ? `<a class="library-path-link" href="#" data-open-library-root="true">library</a>` : `<span class="library-path-current">library</span>`}
    ${path.map((segment, index) => `<span class="library-breadcrumb-separator">/</span>${index === path.length - 1 ? `<span class="library-path-current">${escapeHtml(segment)}</span>` : `<a class="library-path-link" href="#" data-open-library-path="${escapeHtml(path.slice(0, index + 1).join(">"))}">${escapeHtml(segment)}</a>`}`).join("")}
  </div>`;
}

function renderLibraryFolderTile(node: LibraryFolderNode) {
  return `<button class="library-folder-tile" type="button" data-open-library-path="${escapeHtml(node.pathKey)}">
    <span class="library-folder-tile-icon" aria-hidden="true"><span class="library-folder-icon-tab"></span><span class="library-folder-icon-body"></span></span>
    <span class="library-folder-tile-copy">
      <h4>${escapeHtml(node.label)}</h4>
      <p>${escapeHtml(describeLibraryFolder(node))}</p>
    </span>
  </button>`;
}

function renderLibraryMediaPreview(item: LibraryMediaEntry, network: NetworkStore) {
  if (item.mediaType === "image" && item.assetUrl) return `<div class="library-media-preview"><img src="${escapeHtml(item.assetUrl)}" alt=""></div>`;
  if (item.mediaType === "video" && item.assetUrl) return `<div class="library-media-preview"><video muted playsinline preload="metadata" src="${escapeHtml(item.assetUrl)}"></video></div>`;
  if (item.mediaType === "image") return previewHtml(item as any, network).replace("media-preview", "library-media-preview");
  const label = item.mediaType === "audio" ? "PLAY" : item.mediaType === "text" ? "READ" : item.mediaType.toUpperCase();
  return `<div class="library-media-preview library-media-preview--label"><span>${escapeHtml(label)}</span></div>`;
}

function renderLibraryMediaTile(item: LibraryMediaEntry, network: NetworkStore) {
  const href = item.assetUrl || "";
  const openAttrs = href ? `href="${escapeHtml(href)}" target="_blank" rel="noreferrer"` : `role="group"`;
  const tag = href ? "a" : "div";
  return `<${tag} class="library-media-tile" ${openAttrs} data-library-media-title="${escapeHtml(item.title)}">
    ${renderLibraryMediaPreview(item, network)}
    <span class="library-media-copy">
      <h4>${escapeHtml(item.title)}</h4>
      <p>${escapeHtml(item.creatorUsername ? `@${item.creatorUsername}` : item.mediaType)}</p>
    </span>
  </${tag}>`;
}

function renderLibraryBrowser(root: LibraryFolderNode, browsePath: string[], network: NetworkStore) {
  const current = resolveLibraryBrowse(root, browsePath);
  const removableCollection = current.current.collection?.ref && !current.current.collection?.owned && current.current.collection?.sourceKind !== "media"
    ? renderDownloadButton({
        active: true,
        action: "unkeep-collection",
        value: current.current.collection.ref,
        label: "Downloaded and seeding"
      })
    : "";
  const entries = [
    ...current.folders.map(node => renderLibraryFolderTile(node)),
    ...current.media.map(item => renderLibraryMediaTile(item, network))
  ].join("");
  const empty = !entries
    ? `<div class="empty-state empty-state--quiet">Upload something to start building your library.</div>`
    : "";
  return `<div class="library-browser">
    <div class="library-browser-head">
      <div class="library-browser-copy">${renderLibraryBreadcrumb(current.path)}</div>
      <div class="button-row">${removableCollection}<button class="button-primary" data-open-media-modal="true">+</button></div>
    </div>
    ${entries ? `<div class="library-entry-grid">${entries}</div>` : empty}
  </div>`;
}

function renderStructuredUploadFields(state: { local: LocalStore }) {
  const kind = state.local.uploadDraftKind;
  if (kind === "show") {
    return `<div class="form-grid cols-2">
      <div class="field"><label for="upload-series-title">Show</label><input id="upload-series-title" data-upload-draft-field="seriesTitle" value="${escapeHtml(state.local.uploadDraftSeriesTitle)}" placeholder="Signal Bureau"></div>
      <div class="field"><label for="upload-season-label">Season</label><input id="upload-season-label" data-upload-draft-field="seasonLabel" value="${escapeHtml(state.local.uploadDraftSeasonLabel)}" placeholder="Season 1"></div>
    </div>`;
  }
  if (kind === "graphic_novel") {
    return `<div class="form-grid cols-2">
      <div class="field"><label for="upload-series-title">Series</label><input id="upload-series-title" data-upload-draft-field="seriesTitle" value="${escapeHtml(state.local.uploadDraftSeriesTitle)}" placeholder="Night Panels"></div>
      <div class="field"><label for="upload-title">Volume</label><input id="upload-title" data-upload-draft-field="title" value="${escapeHtml(state.local.uploadDraftTitle)}" placeholder="Volume 1"></div>
    </div>`;
  }
  return `<div class="field"><label for="upload-title">Title</label><input id="upload-title" data-upload-draft-field="title" value="${escapeHtml(state.local.uploadDraftTitle)}" placeholder="Package title"></div>`;
}

function renderUploadDraftRows(rows: UploadDraftRow[]) {
  if (!rows.length) return `<div class="empty-state empty-state--tight upload-draft-empty">Drop files here or choose files to begin.</div>`;
  return `<div class="upload-draft-rows">${rows.map(row => `<article class="upload-draft-row" data-upload-row="${escapeHtml(row.id)}">
    <div class="upload-draft-handle" draggable="true" data-upload-drag-row="${escapeHtml(row.id)}" aria-label="Drag to reorder">::</div>
    <input class="upload-draft-title" data-upload-row-title="${escapeHtml(row.id)}" value="${escapeHtml(row.title)}" aria-label="Row title">
    <div class="upload-draft-meta">
      <span class="pill">${escapeHtml(row.mediaType)}</span>
      <span>${escapeHtml(row.fileName)}</span>
      <span>${escapeHtml(row.sizeLabel)}</span>
    </div>
    <button class="button-ghost upload-draft-remove" type="button" data-remove-upload-row="${escapeHtml(row.id)}">Remove</button>
  </article>`).join("")}</div>`;
}

function defaultTilePosition(index: number) {
  return {
    x: 28 + (index % 5) * 184,
    y: 28 + Math.floor(index / 5) * 204
  };
}

function resolveOverlayCollection(snapshot: AppSnapshot, ref: string | null) {
  if (!ref) return null;
  for (const item of snapshot.feed) {
    if (item.collectionRef === ref && item.post) return item.post;
  }
  for (const item of snapshot.library.collections || []) {
    if (item.ref === ref) return item;
  }
  for (const item of snapshot.selectedProfile?.collections || []) {
    if (item.ref === ref) return item;
  }
  return null;
}

function renderOverlay(snapshot: AppSnapshot, state: { network: NetworkStore; local: LocalStore }) {
  const downloadedMediaRefs = new Set((snapshot.library.keptMedia || []).map(item => (item as any).ref || item.id));
  const collection = resolveOverlayCollection(snapshot, state.local.collectionOverlayRef);
  if (collection) {
    return `<div class="overlay-backdrop">
      <section class="overlay-panel overlay-panel--wide" role="dialog" aria-modal="true" aria-label="${escapeHtml(collection.title || collection.type)}">
        <div class="overlay-header">
          <div class="overlay-copy">
            <h3 class="subsection-title">${escapeHtml(collection.title || "Untitled")}</h3>
            <div class="meta-row">${renderCollectionType(collection)}${renderCollectionMode(collection)}</div>
          </div>
          <button class="button-ghost" type="button" data-close-collection="true">Close</button>
        </div>
        ${renderCollectionCard(withDownloadedChildren(collection, downloadedMediaRefs), state.network, { canKeepChildren: true, canKeepCollection: collection.sourceKind !== "media" })}
      </section>
    </div>`;
  }
  const mode = state.local.overlayMode;
  if (mode !== "media") return "";
  if (mode === "media") {
    return `<div class="overlay-backdrop">
      <section class="overlay-panel overlay-panel--wide" role="dialog" aria-modal="true" aria-label="Upload package">
        <div class="overlay-header"><h3 class="subsection-title">Upload Package</h3><button class="button-ghost" type="button" data-close-overlay="true">Close</button></div>
        <form id="upload-form" class="form-grid form-grid--stack">
          <div class="form-grid cols-2">
            <div class="field"><label for="upload-kind">Type</label><select id="upload-kind" data-upload-draft-field="kind">${PACKAGE_KIND_OPTIONS.map(option => `<option value="${escapeHtml(option.value)}" ${state.local.uploadDraftKind === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}</select></div>
            <div class="field"><label for="upload-description">Notes</label><input id="upload-description" data-upload-draft-field="description" value="${escapeHtml(state.local.uploadDraftDescription)}" placeholder="Optional notes"></div>
          </div>
          ${renderStructuredUploadFields(state)}
          <label class="upload-dropzone" for="upload-files">
            <span>Drop files here or choose files</span>
            <input id="upload-files" type="file" multiple data-upload-files="true">
          </label>
          ${renderUploadDraftRows(state.local.uploadDraftRows)}
          <div class="button-row"><button class="button-primary" type="submit" ${state.local.uploadDraftRows.length ? "" : "disabled"}>Publish</button></div>
        </form>
      </section>
    </div>`;
  }
  return "";
}

function renderSection(snapshot: AppSnapshot, state: { network: NetworkStore; local: LocalStore }) {
  const activeSection = snapshot.activeSection === "upload" ? "library" : snapshot.activeSection;
  const downloadedMediaRefs = new Set((snapshot.library.keptMedia || []).map(item => (item as any).ref || item.id));
  if (activeSection === "discover") {
    const discoverPosts = snapshot.feed.filter(item => item.kind === "post" && item.post);
    return `<section class="section-block section-block--discover">
      <div class="sheet feed-sheet">
        ${blockTitle("Discover", "New media packages from creators you follow.")}
        ${discoverPosts.length ? `<div class="activity-stack">${discoverPosts.map(item => renderFeedPostCard(item, state.network, downloadedMediaRefs)).join("")}</div>` : `<div class="empty-state empty-state--quiet"></div>`}
      </div>
      <div class="sheet people-sheet">${blockTitle("People To Follow", "Find more creators when you want new additions to your library.")}${snapshot.suggestions.length ? `<div class="simple-list">${snapshot.suggestions.map(item => renderDiscoverProfileCard(item, snapshot.currentAccount?.accountId || null)).join("")}</div>` : `<div class="empty-state empty-state--tight discover-empty">No suggestions yet.</div>`}</div>
    </section>`;
  }
  if (activeSection === "library") {
    const tree = buildLibraryTree(snapshot.library.collections);
    return `<section class="section-block section-block--library">
      <div class="sheet">
        ${renderLibraryBrowser(tree, state.local.libraryBrowsePath || [], state.network)}
      </div>
    </section>`;
  }
  if (activeSection === "profile") {
    const profile = snapshot.selectedProfile;
    if (!profile) return `<div class="empty-state empty-state--quiet"></div>`;
    const isOwnProfile = snapshot.currentAccount?.accountId === profile.accountId;
    return `<section class="section-block section-block--profile">
      <div class="profile-hero">
        <div class="profile-hero-main">
          <div class="profile-avatar" aria-hidden="true">${escapeHtml(profile.displayName.slice(0, 1) || profile.username.slice(0, 1) || "Y")}</div>
          <div class="profile-copy">
            <span class="profile-handle">@${escapeHtml(profile.username)}</span>
            <h3>${escapeHtml(profile.displayName)}</h3>
            ${profile.bio ? `<p class="section-copy">${escapeHtml(profile.bio)}</p>` : ""}
          </div>
        </div>
        ${!isOwnProfile ? `<div class="profile-summary"><button class="button-primary" data-follow-account="${escapeHtml(profile.accountId)}">Follow</button></div>` : ""}
      </div>
      <div class="profile-layout profile-layout--rows">
        <div class="sheet">
          ${blockTitle(isOwnProfile ? "Releases" : `${profile.displayName}'s Releases`)}
          ${profile.collections.length ? `<div class="post-stack">${profile.collections.map(item => renderCollectionCard(withDownloadedChildren(item, downloadedMediaRefs), state.network, { canKeepChildren: !isOwnProfile, canKeepCollection: true, clickable: true })).join("")}</div>` : `<div class="empty-state empty-state--quiet"></div>`}
        </div>
      </div>
    </section>`;
  }
  return renderSection({ ...snapshot, activeSection: "discover" }, state);
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

const NAV_ITEMS: Array<[SectionName, string]> = [
  ["discover", "Discover"],
  ["library", "Library"],
  ["profile", "Profile"]
];

function renderBrandLockup() {
  return `<div class="brand-lockup"><h1 class="brand-title">///yolk</h1></div>`;
}

function renderHeaderSearchPanel(snapshot: AppSnapshot) {
  const results = snapshot.discoverQuery
    ? (
        snapshot.searchResults.length
          ? `<div class="header-search-results simple-list" data-search-results="true">${snapshot.searchResults.map(item => renderHeaderSearchResultCard(item, snapshot.currentAccount?.accountId || null)).join("")}</div>`
          : `<div class="header-search-empty" data-search-results="true">No users matched that search.</div>`
      )
    : "";
  return `<div class="header-search-panel">
    <form id="header-search-form" class="header-search-inline" role="search">
      <input id="header-search-query" class="header-search-input" name="query" value="${escapeHtml(snapshot.discoverQuery)}" placeholder="Search for a user" autocomplete="off">
      <button class="button-secondary" type="submit">Go</button>
    </form>
    ${results}
  </div>`;
}

function renderNavigation(snapshot: AppSnapshot, searchOpen: boolean) {
  const active = snapshot.activeSection === "upload" ? "library" : snapshot.activeSection;
  return `<div class="nav-stack">
    <nav class="top-nav">${NAV_ITEMS.map(([id, title]) => `<button class="nav-button ${active === id ? "is-active" : ""}" type="button" data-nav="${id}"><strong>${escapeHtml(title)}</strong></button>`).join("")}${snapshot.currentAccount ? `<div class="search-nav-cluster"><button class="nav-button nav-button--search ${searchOpen ? "is-open" : ""}" type="button" data-toggle-search="true" aria-expanded="${searchOpen ? "true" : "false"}"><strong>Search</strong></button>${searchOpen ? renderHeaderSearchPanel(snapshot) : ""}</div>` : ""}</nav>
  </div>`;
}

function renderIdentityChip(snapshot: AppSnapshot, variant: "full" | "compact" = "full") {
  return `<div class="identity-chip identity-chip--${variant}"><h3>${escapeHtml(snapshot.currentAccount?.displayName || "Your profile")}</h3><p>${escapeHtml(snapshot.currentAccount ? `@${snapshot.currentAccount.username}` : "Create a profile")}</p></div>`;
}

function renderOnboarding() {
  return `<div class="onboarding"><div class="onboarding-card"><h2 class="brand-title">Yolk</h2><form id="onboarding-form" class="sheet form-grid"><div class="field"><label for="onboarding-username">Username</label><input id="onboarding-username" name="username" placeholder="alice" required></div><div class="field"><label for="onboarding-display-name">Display name</label><input id="onboarding-display-name" name="displayName" placeholder="Alice Atlas" required></div><div class="field"><label for="onboarding-bio">Bio</label><textarea id="onboarding-bio" name="bio" placeholder="Say something short"></textarea></div><div class="button-row"><button class="button-primary" type="submit">Create account</button></div></form></div></div>`;
}

function renderShell(snapshot: AppSnapshot, state: { network: NetworkStore; local: LocalStore }) {
  const flash = snapshot.flashMessage ? `<div class="flash">${escapeHtml(snapshot.flashMessage)} <button class="button-ghost" data-dismiss-flash="true">Dismiss</button></div>` : "";
  const section = renderSection(snapshot, state);
  return `<div class="app-shell"><header class="shell-header shell-header--app"><div class="header-stack">${renderBrandLockup()}${renderNavigation(snapshot, state.local.searchOpen)}</div>${renderIdentityChip(snapshot, "compact")}</header><main class="main-panel">${flash}${section}</main>${renderOverlay(snapshot, state)}</div>`;
}

function createApiController(storage: StorageLike) {
  const clientStorageKey = "yolk.client-id";
  let lastSnapshot: AppSnapshot | null = null;
  const clientId = storage.getItem(clientStorageKey) || (globalThis.crypto?.randomUUID?.() || `client-${Date.now()}`);
  storage.setItem(clientStorageKey, clientId);
  const uploadFiles = new Map<string, File>();
  const rawLayout = storage.getItem(LIBRARY_LAYOUT_STORAGE_KEY);
  let parsedLayout: Record<string, { x: number; y: number }> = {};
  if (rawLayout) {
    try { parsedLayout = JSON.parse(rawLayout); } catch { parsedLayout = {}; }
  }
  const localState = {
    currentAccountId: null as string | null,
    searchOpen: false,
    collectionDraftChildIds: [] as string[],
    libraryBrowsePath: [] as string[],
    libraryLayout: parsedLayout,
    overlayMode: null as "media" | "folder" | null,
    collectionOverlayRef: null as string | null,
    ...emptyUploadDraft()
  };
  const request = async (url: string, init?: RequestInit) => {
    const response = await fetch(url, init);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.json();
  };
  const syncFromSnapshot = (snapshot: AppSnapshot) => {
    lastSnapshot = snapshot;
    localState.currentAccountId = snapshot.currentAccount?.accountId || null;
    localState.collectionDraftChildIds = (snapshot.draftChildren || []).map(item => ((item as any).ref || item.id));
  };
  const postAction = async (type: string, payload: Record<string, unknown> = {}) => {
    const body = await request("/api/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, type, ...payload })
    });
    return body.result;
  };
  const assetUrlForRef = (ref?: string) => ref ? `/api/media?clientId=${encodeURIComponent(clientId)}&mediaRef=${encodeURIComponent(ref)}` : null;
  const decorateLibraryItem = <T extends LibraryItem>(item: T): T => ({
    ...item,
    assetUrl: (item as any).kind === "collection" ? null : assetUrlForRef(item.ref)
  });
  const decorateWorkspaceItem = (item: WorkspaceItem): WorkspaceItem => ({
    ...decorateLibraryItem(item),
    coverAssetUrl: item.coverRef ? assetUrlForRef(item.coverRef) : null
  });
  const decorateCollection = (collection: ProfileSummary["collections"][number]) => ({
    ...collection,
    children: collection.children.map(child => ({
      ...child,
      assetUrl: child.kind === "media" ? assetUrlForRef(child.ref) : null
    }))
  });
  const decorateSnapshot = (snapshot: AppSnapshot): AppSnapshot => ({
    ...snapshot,
    library: {
      ...snapshot.library,
      keptMedia: snapshot.library.keptMedia.map(item => decorateLibraryItem(item as LibraryItem)),
      items: snapshot.library.items.map(item => decorateWorkspaceItem(item as WorkspaceItem)),
      collections: (snapshot.library.collections || []).map(item => decorateCollection(item))
    },
    draftChildren: snapshot.draftChildren.map(item => decorateLibraryItem(item as LibraryItem)),
    shelfMedia: (snapshot.shelfMedia || []).map(item => decorateLibraryItem(item as LibraryItem & { ref?: string })),
    selectedProfile: snapshot.selectedProfile
      ? {
          ...snapshot.selectedProfile,
          collections: snapshot.selectedProfile.collections.map(item => decorateCollection(item))
        }
      : null,
    feed: snapshot.feed.map(item => ({
      ...item,
      post: item.post ? decorateCollection(item.post) : item.post
    }))
  });
  return {
    async initialize() {
      const snapshot = await this.buildSnapshot();
      syncFromSnapshot(snapshot);
    },
    async buildSnapshot() {
      const snapshot = decorateSnapshot(await request(`/api/snapshot?clientId=${encodeURIComponent(clientId)}`));
      syncFromSnapshot(snapshot);
      return snapshot as AppSnapshot;
    },
    getState() {
      return {
        network: {} as NetworkStore,
        local: {
          currentAccountId: localState.currentAccountId,
          searchOpen: localState.searchOpen,
          collectionDraftChildIds: localState.collectionDraftChildIds,
          libraryBrowsePath: localState.libraryBrowsePath,
          libraryLayout: localState.libraryLayout,
          overlayMode: localState.overlayMode,
          collectionOverlayRef: localState.collectionOverlayRef,
          uploadDraftKind: localState.uploadDraftKind,
          uploadDraftTitle: localState.uploadDraftTitle,
          uploadDraftDescription: localState.uploadDraftDescription,
          uploadDraftSeriesTitle: localState.uploadDraftSeriesTitle,
          uploadDraftSeasonLabel: localState.uploadDraftSeasonLabel,
          uploadDraftRows: localState.uploadDraftRows
        } as any
      };
    },
    async createAccount(input: { username: string; displayName: string; bio: string }) { return postAction("createAccount", { input }); },
    async openProfile(accountId: string) {
      localState.searchOpen = false;
      return postAction("openProfile", { accountId });
    },
    async search(query: string) {
      localState.searchOpen = true;
      return postAction("searchProfiles", { query });
    },
    async clearSearch() { return postAction("clearSearch"); },
    async followAccount(accountId: string) { return postAction("followAccount", { accountId }); },
    async keepMedia(mediaRef: string) { return postAction("keepMedia", { mediaRef }); },
    async keepCollection(collectionRef: string) { return postAction("keepCollection", { collectionRef }); },
    async unkeepCollection(collectionRef: string) { return postAction("unkeepCollection", { collectionRef }); },
    async uploadMedia(input: { title: string; description: string; mediaType: string; fileName: string; dataUrl: string | null; textPreview: string | null }) {
      const dataBase64 = input.dataUrl
        ? input.dataUrl.split(",")[1] || ""
        : btoa(input.textPreview || "");
      return postAction("uploadMedia", {
        input: {
          title: input.title,
          description: input.description,
          mediaType: input.mediaType,
          fileName: input.fileName,
          dataBase64
        }
      });
    },
    async publishStructuredUpload() {
      const rows = [];
      for (const row of localState.uploadDraftRows) {
        const file = uploadFiles.get(row.id);
        if (!file) continue;
        const upload = await fileToInput(file, row.mediaType);
        rows.push({
          title: row.title,
          fileName: row.fileName,
          mediaType: row.mediaType,
          description: "",
          dataBase64: upload.dataUrl ? upload.dataUrl.split(",")[1] || "" : btoa(upload.textPreview || "")
        });
      }
      const result = await postAction("publishStructuredUpload", {
        input: {
          packageKind: localState.uploadDraftKind,
          title: localState.uploadDraftTitle,
          description: localState.uploadDraftDescription,
          seriesTitle: localState.uploadDraftSeriesTitle,
          seasonLabel: localState.uploadDraftSeasonLabel,
          rows
        }
      });
      uploadFiles.clear();
      Object.assign(localState, emptyUploadDraft());
      localState.overlayMode = null;
      localState.libraryBrowsePath = [];
      return result;
    },
    async createCollection(input: { title: string; type: string; description: string; isCurated: boolean; childIds: string[]; coverId?: string | null }) {
      return postAction("createCollection", {
        input: {
          title: input.title,
          type: input.type,
          description: input.description,
          isCurated: input.isCurated,
          childRefs: input.childIds,
          coverMediaRef: input.coverId || null
        }
      });
    },
    async setSection(section: SectionName) {
      localState.searchOpen = false;
      if (section === "library") localState.libraryBrowsePath = [];
      return postAction("setSection", { section });
    },
    async dismissFlash() { return postAction("dismissFlash"); },
    toggleSearch() { localState.searchOpen = !localState.searchOpen; },
    closeSearch() { localState.searchOpen = false; },
    openOverlay(mode: "media" | "folder") { localState.overlayMode = mode; localState.collectionOverlayRef = null; },
    closeOverlay() { localState.overlayMode = null; },
    openCollection(ref: string) { localState.collectionOverlayRef = ref; localState.overlayMode = null; },
    closeCollection() { localState.collectionOverlayRef = null; },
    openLibraryPath(pathKey: string) { localState.libraryBrowsePath = String(pathKey || "").split(">").map(part => part.trim()).filter(Boolean); },
    openLibraryRoot() { localState.libraryBrowsePath = []; },
    setUploadDraftField(field: "kind" | "title" | "description" | "seriesTitle" | "seasonLabel", value: string) {
      if (field === "kind") localState.uploadDraftKind = value as PackageKind;
      else if (field === "title") localState.uploadDraftTitle = value;
      else if (field === "description") localState.uploadDraftDescription = value;
      else if (field === "seriesTitle") localState.uploadDraftSeriesTitle = value;
      else if (field === "seasonLabel") localState.uploadDraftSeasonLabel = value;
    },
    appendUploadFiles(files: File[]) {
      const rows = files
        .map(file => {
          const mediaType = inferMediaTypeFromFile(file);
          if (!mediaType) return null;
          const id = globalThis.crypto?.randomUUID?.() || `upload-${Date.now()}-${Math.random()}`;
          uploadFiles.set(id, file);
          return {
            id,
            title: fileBaseTitle(file.name),
            fileName: file.name,
            mediaType,
            sizeLabel: fileSizeLabel(file.size)
          } as UploadDraftRow;
        })
        .filter(Boolean) as UploadDraftRow[];
      localState.uploadDraftRows = [...localState.uploadDraftRows, ...rows];
    },
    updateUploadRowTitle(rowId: string, value: string) {
      localState.uploadDraftRows = localState.uploadDraftRows.map(row => row.id === rowId ? { ...row, title: value } : row);
    },
    removeUploadRow(rowId: string) {
      uploadFiles.delete(rowId);
      localState.uploadDraftRows = localState.uploadDraftRows.filter(row => row.id !== rowId);
    },
    moveUploadRow(rowId: string, targetRowId: string) {
      const currentIndex = localState.uploadDraftRows.findIndex(row => row.id === rowId);
      const targetIndex = localState.uploadDraftRows.findIndex(row => row.id === targetRowId);
      if (currentIndex < 0 || targetIndex < 0 || currentIndex === targetIndex) return;
      const next = localState.uploadDraftRows.slice();
      const [row] = next.splice(currentIndex, 1);
      next.splice(targetIndex, 0, row);
      localState.uploadDraftRows = next;
    },
    resetUploadDraft() {
      uploadFiles.clear();
      Object.assign(localState, emptyUploadDraft());
    },
    setLibraryTilePosition(ref: string, x: number, y: number) {
      localState.libraryLayout[ref] = { x, y };
      storage.setItem(LIBRARY_LAYOUT_STORAGE_KEY, JSON.stringify(localState.libraryLayout));
    },
    async addDraftChild(mediaRef: string) { return postAction("addDraftChild", { mediaRef }); },
    async removeDraftChild(mediaRef: string) { return postAction("removeDraftChild", { mediaRef }); },
    async moveDraftChild(mediaRef: string, direction: "up" | "down") { return postAction("moveDraftChild", { mediaRef, direction }); },
    async resetDraft() { return postAction("resetDraft"); }
  };
}

async function renderApp(root: HTMLElement, controller: ReturnType<typeof createAppController> | ReturnType<typeof createApiController>) {
  const snapshot = await controller.buildSnapshot();
  const state = controller.getState();
  root.innerHTML = `${renderShell(snapshot, state)}${snapshot.currentAccount ? "" : renderOnboarding()}`;
}

export async function startApp(root: HTMLElement, storage: StorageLike = window.localStorage) {
  const controller = createApiController(storage);
  await controller.initialize();
  let dragState: { ref: string; offsetX: number; offsetY: number } | null = null;
  let uploadDragRowId: string | null = null;
  root.addEventListener("click", async event => {
    const target = (event.target as HTMLElement)?.closest?.("[data-nav],[data-toggle-search],[data-open-compose],[data-open-media-modal],[data-open-library-path],[data-open-library-root],[data-close-overlay],[data-close-collection],[data-dismiss-flash],[data-open-profile],[data-open-collection],[data-follow-account],[data-keep-media],[data-keep-collection],[data-unkeep-collection],[data-add-draft-child],[data-remove-draft-child],[data-move-draft-child],[data-reset-draft],[data-remove-upload-row]") as HTMLElement | null;
    if (!target) return;
    if (target.tagName === "A") event.preventDefault();
    let handled = true;
    if (target.dataset.toggleSearch) {
      if (controller.getState().local.searchOpen) {
        (controller as any).closeSearch?.();
        await (controller as any).clearSearch?.();
      } else (controller as any).toggleSearch?.();
    }
    else if (target.dataset.nav === "profile") {
      const currentAccountId = controller.getState().local.currentAccountId;
      if (currentAccountId) {
        await controller.openProfile(currentAccountId);
        await controller.dismissFlash();
      } else await controller.setSection("profile");
    }
    else if (target.dataset.nav) await controller.setSection(target.dataset.nav as SectionName);
    else if (target.dataset.openCompose) await controller.setSection("upload");
    else if (target.dataset.openMediaModal) (controller as any).openOverlay?.("media");
    else if (target.dataset.openLibraryPath) (controller as any).openLibraryPath?.(target.dataset.openLibraryPath);
    else if (target.dataset.openLibraryRoot) (controller as any).openLibraryRoot?.();
    else if (target.dataset.closeOverlay) (controller as any).closeOverlay?.();
    else if (target.dataset.closeCollection) (controller as any).closeCollection?.();
    else if (target.dataset.dismissFlash) await controller.dismissFlash();
    else if (target.dataset.openProfile) await controller.openProfile(target.dataset.openProfile);
    else if (target.dataset.openCollection) (controller as any).openCollection?.(target.dataset.openCollection);
    else if (target.dataset.followAccount) { try { await controller.followAccount(target.dataset.followAccount); } catch (error) { console.error(error); } }
    else if (target.dataset.keepMedia) { try { await controller.keepMedia(target.dataset.keepMedia); } catch (error) { console.error(error); } }
    else if (target.dataset.keepCollection) { try { await (controller as any).keepCollection(target.dataset.keepCollection); } catch (error) { console.error(error); } }
    else if (target.dataset.unkeepCollection) {
      const confirmed = typeof globalThis.confirm === "function"
        ? globalThis.confirm("Remove this collection from your library and delete its saved files?")
        : true;
      if (!confirmed) handled = false;
      else {
        try { await (controller as any).unkeepCollection(target.dataset.unkeepCollection); } catch (error) { console.error(error); }
      }
    }
    else if (target.dataset.addDraftChild) await controller.addDraftChild(target.dataset.addDraftChild);
    else if (target.dataset.removeDraftChild) await controller.removeDraftChild(target.dataset.removeDraftChild);
    else if (target.dataset.moveDraftChild) await controller.moveDraftChild(target.dataset.moveDraftChild, (target.dataset.direction as "up" | "down") || "up");
    else if (target.dataset.resetDraft) await controller.resetDraft();
    else if (target.dataset.removeUploadRow) (controller as any).removeUploadRow?.(target.dataset.removeUploadRow);
    else handled = false;
    if (!handled) return;
    await renderApp(root, controller);
  });
  root.addEventListener("dragstart", event => {
    const handle = (event.target as HTMLElement)?.closest?.("[data-upload-drag-row]") as HTMLElement | null;
    if (!handle) return;
    uploadDragRowId = handle.dataset.uploadDragRow || null;
    event.dataTransfer?.setData("text/plain", uploadDragRowId || "");
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  });
  root.addEventListener("dragover", event => {
    const row = (event.target as HTMLElement)?.closest?.("[data-upload-row]") as HTMLElement | null;
    const dropzone = (event.target as HTMLElement)?.closest?.(".upload-dropzone") as HTMLElement | null;
    if (!row && !dropzone) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  });
  root.addEventListener("drop", async event => {
    const row = (event.target as HTMLElement)?.closest?.("[data-upload-row]") as HTMLElement | null;
    const dropzone = (event.target as HTMLElement)?.closest?.(".upload-dropzone") as HTMLElement | null;
    if (dropzone) {
      event.preventDefault();
      const files = [...(event.dataTransfer?.files || [])];
      if (files.length) {
        (controller as any).appendUploadFiles?.(files);
        await renderApp(root, controller);
      }
      uploadDragRowId = null;
      return;
    }
    if (!row || !uploadDragRowId) return;
    event.preventDefault();
    (controller as any).moveUploadRow?.(uploadDragRowId, row.dataset.uploadRow || "");
    uploadDragRowId = null;
    await renderApp(root, controller);
  });
  root.addEventListener("change", async event => {
    const target = event.target as HTMLElement | null;
    if (!(target instanceof HTMLElement)) return;
    if (target instanceof HTMLInputElement && target.dataset.uploadFiles === "true") {
      const files = [...(target.files || [])];
      if (!files.length) return;
      (controller as any).appendUploadFiles?.(files);
      target.value = "";
      await renderApp(root, controller);
      return;
    }
    if (target instanceof HTMLSelectElement && target.dataset.uploadDraftField === "kind") {
      (controller as any).setUploadDraftField?.("kind", target.value);
      await renderApp(root, controller);
      return;
    }
  });
  root.addEventListener("input", event => {
    const target = event.target as HTMLElement | null;
    if (!(target instanceof HTMLElement)) return;
    if (target instanceof HTMLInputElement && target.dataset.uploadDraftField) {
      (controller as any).setUploadDraftField?.(target.dataset.uploadDraftField, target.value);
      return;
    }
    if (target instanceof HTMLInputElement && target.dataset.uploadRowTitle) {
      (controller as any).updateUploadRowTitle?.(target.dataset.uploadRowTitle, target.value);
    }
  });
  root.addEventListener("pointerdown", event => {
    const tile = (event.target as HTMLElement)?.closest?.("[data-library-tile]") as HTMLElement | null;
    if (!tile) return;
    if ((event.target as HTMLElement)?.closest?.("button, audio, video")) return;
    const ref = tile.dataset.libraryTile;
    if (!ref) return;
    const rect = tile.getBoundingClientRect();
    dragState = {
      ref,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    };
    tile.setPointerCapture?.(event.pointerId);
  });
  root.addEventListener("pointermove", event => {
    if (!dragState) return;
    const workspace = root.querySelector(".library-workspace") as HTMLElement | null;
    const tile = root.querySelector(`[data-library-tile="${CSS.escape(dragState.ref)}"]`) as HTMLElement | null;
    if (!workspace || !tile) return;
    const rect = workspace.getBoundingClientRect();
    const x = Math.max(12, event.clientX - rect.left - dragState.offsetX);
    const y = Math.max(12, event.clientY - rect.top - dragState.offsetY);
    tile.style.left = `${x}px`;
    tile.style.top = `${y}px`;
  });
  root.addEventListener("pointerup", event => {
    if (!dragState) return;
    const workspace = root.querySelector(".library-workspace") as HTMLElement | null;
    if (!workspace) {
      dragState = null;
      return;
    }
    const rect = workspace.getBoundingClientRect();
    const x = Math.max(12, event.clientX - rect.left - dragState.offsetX);
    const y = Math.max(12, event.clientY - rect.top - dragState.offsetY);
    (controller as any).setLibraryTilePosition?.(dragState.ref, x, y);
    dragState = null;
  });
  root.addEventListener("submit", async event => {
    const form = event.target as HTMLFormElement;
    if (!form) return;
    event.preventDefault();
    if (form.id === "onboarding-form") {
      const data = new FormData(form);
      await controller.createAccount({ username: String(data.get("username") || ""), displayName: String(data.get("displayName") || ""), bio: String(data.get("bio") || "") });
    } else if (form.id === "header-search-form") {
      const data = new FormData(form);
      await controller.search(String(data.get("query") || ""));
    } else if (form.id === "upload-form") {
      await (controller as any).publishStructuredUpload?.();
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
