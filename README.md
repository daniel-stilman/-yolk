# Yolk

Yolk is a desktop-first decentralized media application built with plain TypeScript, plain CSS, native DOM APIs, and ES modules. The current build covers identity, signed account state, immutable media, collections, keeps, follows, and profile/feed browsing.

The repo now also contains the first real peer-to-peer runtime slice in [runtime/p2p-runtime.mjs](/C:/Users/danie/yolk/runtime/p2p-runtime.mjs): mutable account heads are published through a real DHT, immutable profile/media objects are distributed as real torrents, and Keep semantics are exercised as actual download-and-seed operations between multiple peers.

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

This application currently demonstrates:

- account creation with a generated local keypair
- signed profile publishing
- profile resolution by account id through a mutable account head
- account discovery and search by verified username or account id
- immutable media publishing for image, audio, video, and text metadata
- original and curated collections
- follow records
- keep records
- a feed composed from followed accounts' activity
- profile browsing with verified username/display-name rendering
- a seeded demo network so discovery works immediately

## Product UX Guardrails

The default product surface should be shaped around one job first: getting people to media with as little friction as possible.

- Library access comes first.
- Discovery comes second, as a way to bring more media and collections into the library.
- Default user-facing views should not expose account ids, raw refs, trust/debug fields, transport counters, or other implementation-detail scaffolding.
- If verification or diagnostics are needed, they belong behind an explicit dedicated affordance rather than in routine browsing and discovery UI.
- Collections should be presented consistently across discovery, library, and profile views so saved media packages do not change shape from screen to screen.

The networking and peer-to-peer transport are still simplified in parts of the app. The live browser shell now runs through the runtime-backed app service, but it still relies on:

- a local bootstrap DHT node per app-service instance
- a seeded demo network so discovery works immediately
- a known-account graph for search and suggestions instead of a decentralized global index

This keeps the identity and authorship architecture clean while the runtime hardening and wider discovery model are still being built out.

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

The runtime stores content bytes separately from the signed metadata records, and the app service materializes previews from those immutable refs.

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

The application includes:

- `Home / Feed`
- `Discover`
- `Library`
- `Profile`
- `Upload / Create`
- `Collection Editor`

The UI is deliberately desktop-first and media-forward. Internally everything is keyed by account id, even when the normal surface stays focused on usernames, display names, and media packages instead of system identifiers.

## Testing

Run the full suite with:

```bash
npm test
```

The suite has two layers:

1. Targeted controller/model assertions in `tests/app.test.mjs`
2. Real browser + running-backend sanity fixtures in `tests/e2e.test.mjs`
3. Real peer-to-peer runtime tests in `tests/network.test.mjs`

The sanity fixture pair is authoritative:

- `tests/sanity/yolk_sanity_input.json`
- `tests/sanity/yolk_sanity_expected.json`

The end-to-end harness starts `server.mjs`, opens the real app bundle in headless Edge through `playwright-core`, drives the actual DOM, and compares the rendered output against the curated expected snapshot. This is the baseline "full run of the program" check for onboarding, discovery, follows, keeps, uploads, collections, and feed rendering.

`tests/network.test.mjs` is the new non-UI proof layer for the actual transport. It launches multiple local peers against a bootstrap DHT node and verifies:

- mutable DHT account heads resolve the latest signed profile
- immutable media payloads move over a real torrent swarm
- Keep means download + continue seeding

When behavior changes:

1. update code
2. update targeted tests if the rule is covered there
3. update the browser sanity fixture case and expected result
4. update the Behavior Index below
5. run `npm test`

## Behavior Index

Keep this synchronized with `tests/sanity/yolk_sanity_input.json` and `tests/sanity/yolk_sanity_expected.json`.

- `profile_opens_from_discovery`
  Opens a collection from Discover and verifies that the collection overlay resolves from the live followed-network feed.
- `discover_search_opens_profile`
  Expands the header Search drawer inline from the nav, searches for a user, then opens the matching profile through the runtime-backed account lookup.
- `followed_activity_visible_in_feed`
  The followed network resolves into Discover activity and surfaces posts from both directly followed and transitively discovered accounts.
- `keep_media_flows_into_library`
  A Keep action creates a signed keep record and places the media in the local kept library with seeding intent.
- `like_feed_post_saves_library`
  Saving a collection from Discover fills the same Like control and pulls the whole package into the local library surface without changing its collection-style presentation.
- `unlike_saved_collection_removes_library_package`
  Removing a saved collection from the library confirms the action, un-fills the Like control, and removes the saved package from the library surface.
- `open_feed_post_opens_profile`
  Opening a Discover post resolves the collection overlay through the live feed payload.
- `upload_media_and_publish_original_collection`
  Uploads a new immutable media object through the actual form flow, then publishes an original collection from the collection editor shelf.
- `curated_collection_preserves_original_authorship`
  A curated collection can reference media by multiple creators while the collection creator remains separate from each original media creator.
- `full_program_journey`
  Runs the main desktop journey end-to-end: create account, discover, follow, resolve profile, keep, upload, curate, and confirm feed/library/profile outputs from the live DOM.

## Notes For The Next Build

- add device-key delegation on top of the root account key
- widen discovery beyond the current known-account graph and local bootstrap assumptions
- expose profile editing and richer upload/profile views on top of the runtime-backed shell
- expand collection layout rules without breaking signed authorship boundaries
