# Yolk

Yolk is a desktop-first prototype for a decentralized media platform built with plain TypeScript, plain CSS, native DOM APIs, and ES modules. The current build is a vertical slice for identity, signed account state, immutable media, collections, keeps, follows, and profile/feed browsing.

## Core Model

The app follows these non-negotiable rules:

1. Canonical identity is the public-key-derived account id.
2. Usernames are display and discovery labels only.
3. Profiles are mutable signed state, not the identity itself.
4. The DHT layer is modeled as a small mutable `AccountHead` pointer per account.
5. Media objects are immutable and signed by their creator account.
6. Collections are signed by the collection creator and can reference media from many creators.
7. Curation never overwrites original authorship.
8. A Keep is a signed save action with seeding intent.

## First Build Scope

This prototype currently demonstrates:

- account creation with a generated local keypair
- signed profile publishing
- profile resolution by account id through a mutable account head
- immutable media publishing for image, audio, video, and text metadata
- original and curated collections
- follow records
- keep records
- a feed composed from followed accounts' activity
- profile browsing with verified username/display-name rendering
- a seeded demo network so discovery works immediately

The networking and peer-to-peer transport are intentionally simplified for this first build. The app uses a local mock store for:

- mutable DHT-like account heads
- signed public records
- content/blob references
- username discovery index

This keeps the identity and authorship architecture clean while leaving room for a future native backend and real swarm transport.

## Stack

- plain TypeScript
- plain CSS
- native DOM APIs
- ES modules
- Node only for static serving, build, and tests
- no React
- no large frontend frameworks

## Run

Install the local compiler:

```bash
npm install
```

Build the app:

```bash
npm run build
```

Run the desktop-first static shell:

```bash
npm run dev
```

Open `http://127.0.0.1:4173`.

## Architecture

### 1. Identity Layer

Each account has a local keypair. The public key is exported and hashed into the canonical `accountId`.

Trust order is always:

1. account id / public key
2. signed account head and signed profile for that account
3. username and display fields inside the verified profile

### 2. Account / Profile Layer

Profiles are signed records stored behind a mutable `AccountHead` pointer. The client:

1. resolves the head for a known account id
2. fetches the latest profile ref from that head
3. verifies the head and profile signatures against the account public key
4. only then renders the username and display name

### 3. Content Layer

Media metadata is signed and immutable. A new file or changed bytes produce a new media object.

The prototype stores local blob refs in the mock network, but the record model is already split between:

- content/blob refs
- signed metadata objects

### 4. Social / Action Layer

Follows and Keeps are signed records. The feed is built from recent activity by followed accounts.

Keep means:

- save in the local library
- mark as intended to seed

### 5. Collections

Collections are the primary publishing surface. They can reference:

- media items
- other collections

Collection authorship and media authorship are both preserved and visible.

## UI Areas

The prototype includes:

- `Home / Feed`
- `Discover`
- `Library`
- `Profile`
- `Upload / Create`
- `Collection Editor`

The UI is deliberately desktop-first and media-forward. Internally everything is keyed by account id, even when the surface shows usernames and display names.

## Testing

Run the full suite with:

```bash
npm test
```

The suite has two layers:

1. Targeted controller/model assertions in `tests/app.test.mjs`
2. Curated sanity fixtures in `tests/sanity/`

The sanity fixture pair is authoritative:

- `tests/sanity/yolk_sanity_input.json`
- `tests/sanity/yolk_sanity_expected.json`

When behavior changes:

1. update code
2. update targeted tests if the rule is covered there
3. update the sanity fixture case and expected result
4. update the Behavior Index below
5. run `npm test`

## Behavior Index

Keep this synchronized with `tests/sanity/yolk_sanity_input.json` and `tests/sanity/yolk_sanity_expected.json`.

- `verified_profile_lookup_by_account_id`
  Opens a profile from the underlying account reference and renders the username from the verified signed profile.
- `keep_creates_local_library_entry`
  A Keep action creates a signed keep record and places the media in the local kept library with seeding intent.
- `curated_collection_preserves_original_authorship`
  A curated collection can reference media by multiple creators while the collection creator remains separate from each original media creator.
- `follow_brings_activity_into_feed`
  Following an account makes their uploads, collections, keeps, and follow actions visible in the feed.

## Notes For The Next Build

- move the mock DHT/content stores behind a native backend
- replace local blob refs with actual p2p content references
- add device-key delegation on top of the root account key
- deepen search/discovery without changing the identity trust order
- expand collection layout rules without breaking signed authorship boundaries
