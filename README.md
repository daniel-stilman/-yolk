# Yolk

Yolk is a desktop-first decentralized media application built with plain TypeScript, plain CSS, native DOM APIs, and ES modules. The current build covers identity, signed account state, immutable media, collections, keeps, follows, follow invites, and graph-scoped profile/feed browsing.

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
8. A Keep is the signed download action with seeding intent.

## Network Model

The live product path is invite-first:

1. There is no central directory and no assumption of one mega-network.
2. A person enters a network by importing a follow invite from someone they trust.
3. Follow invites now carry signed rendezvous hints for the sharer's current device.
4. Search and discovery are scoped to the reachable follow graph rooted in that trust path.
5. Different clusters may overlap, or may stay disconnected forever.
6. Follow has real cost: it expands the people and releases that shape discovery.
7. Keep has real cost: it stores the media locally with seeding intent.

## First Build Scope

This application currently demonstrates:

- account creation with a generated local keypair
- signed profile publishing
- profile resolution by account id through a mutable account head
- follow-invite export/import as the default way to join another person's network
- invite-carried rendezvous hints plus a persisted peerbook so imported follows can reconnect after restart
- network-scoped account discovery and search through the reachable follow graph
- immutable media publishing for image, audio, video, and text metadata
- original and curated collections
- follow records
- keep records
- a Discover queue composed from followed accounts' media posts
- profile browsing with verified username/display-name rendering

## Product UX Guardrails

The default product surface should be shaped around one job first: getting people to media with as little friction as possible.

- Library access comes first.
- Discovery comes second, as a way to bring more media packages into the library.
- Default user-facing views should not expose account ids, raw refs, trust/debug fields, transport counters, or other implementation-detail scaffolding.
- Placeholder stat rows, account/network totals, and similar diagnostic furniture should not appear in the normal product surface.
- If verification or diagnostics are needed, they belong behind an explicit dedicated affordance rather than in routine browsing and discovery UI.
- Media packages should use a consistent canonical structure so the same release is understandable in discovery, profile, and library flows.
- Upload and library flows should favor canonical, consumer-friendly media paths so downloaded packages land where people expect to find them later.
- Library navigation should act like a familiar explorer: folders drill down in place, and leaf media opens directly rather than detouring through folder popups.

The networking and peer-to-peer transport are still simplified in parts of the app. The live browser shell now runs through the runtime-backed app service, but it still relies on:

- a local bootstrap DHT node per app-service instance
- invite-carried loopback/LAN/manual device hints rather than full NAT traversal or relay support
- local/dev transport assumptions rather than hardened real-world reachability between ordinary home devices

This keeps the identity and authorship architecture clean while the invite-first transport and reachability model are still being built out.

For manual host advertisement, set `YOLK_ADVERTISE_HOSTS` to a comma-separated list of reachable hosts or IPs before starting the server. Those hosts are signed into follow invites alongside the local device's detected LAN addresses.

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

- download into the local library
- mark as intended to seed

Follow means:

- trust this person enough to let their network influence discovery
- expand the graph that search and discover can traverse from your account

Rendezvous currently means:

- import a follow invite
- persist the shared device hints in the local peerbook
- restart the local runtime against those hints so the other device can act as the first reachable peer

### 5. Packages

Packages are the primary publishing surface. They can reference:

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

The end-to-end harness starts `server.mjs`, opens the real app bundle in headless Edge through `playwright-core`, drives the actual DOM, and compares the rendered output against the curated expected snapshot. This is the baseline "full run of the program" check for onboarding, discovery, follows, downloads, structured uploads, collections, and feed rendering.

For deterministic browser regression coverage, the browser sanity harness explicitly runs with `seedDemo: true`. The live app server default is now the invite-first, no-demo path.

`tests/network.test.mjs` is the new non-UI proof layer for the actual transport. It launches multiple local peers against a bootstrap DHT node and verifies:

- mutable DHT account heads resolve the latest signed profile
- immutable media payloads move over a real torrent swarm
- Keep means download + continue seeding
- isolated app-service instances can rendezvous through invite-carried device hints without sharing one bootstrap node

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
  Expands the header Search drawer inline from the nav, searches the reachable network graph for a user, then opens the matching profile through the runtime-backed account lookup.
- `followed_posts_visible_in_feed`
  The followed network resolves into a post-only Discover queue and surfaces media packages from both directly followed and transitively discovered accounts.
- `download_media_flows_into_library`
  Downloading a media item creates the signed keep record and places the media in the local library under its canonical media folder.
- `download_feed_post_flows_into_library`
  Downloading a media package from Discover fills the same heart-download control and pulls the whole package into the library under the expected folder path.
- `remove_downloaded_collection_removes_library_package`
  Removing a downloaded collection from the library confirms the action, un-fills the control, and removes the package from the library folder where it appeared.
- `open_feed_post_opens_profile`
  Opening a Discover post resolves the package overlay through the live feed payload.
- `structured_upload_places_package_in_library`
  The upload flow builds a typed media package through the drag/drop composer, preserves the edited row order and titles, and lands back on a folder-first library root.
- `library_clicks_through_canonical_folders`
  The library opens as a click-through folder browser, and drilling into canonical folders reaches the actual media at the leaf level rather than a popup package card.
- `full_program_journey`
  Runs the main desktop journey end-to-end: create account, discover, follow, resolve profile, download, upload, and confirm feed/library/profile outputs from the live DOM.

## Notes For The Next Build

- add device-key delegation on top of the root account key
- replace the current invite-hint approach with stronger home-device reachability, NAT traversal, or relay strategy where needed
- expose profile editing and richer upload/profile views on top of the runtime-backed shell
- expand collection layout rules without breaking signed authorship boundaries
