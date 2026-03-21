# AGENTS.md

Purpose: the canonical operating prompt for this repo. Keep shared process, quality rules, and reinforcement patterns here so humans and agents work from the same baseline.

## Principles

- Root `AGENTS.md` is the default source of truth for repo-wide process.
- Prefer a monolithic core by default: one main source file per app or service until there is a clear reason to split.
- Keep a functional core and a thin imperative shell. Pure logic should be easy to test without UI, network, filesystem, or time.
- No side effects on import. Top-level code should declare data and functions, not perform work.
- Determinism matters. Inject time, randomness, storage, network, and environment dependencies.
- Small, safe diffs beat broad rewrites.
- Visible behavior changes must update code, tests, fixtures, and docs together.

## Product UX Guardrails

- Build the default UI from the perspective of a person who wants fast, low-friction access to media.
- Library consumption comes first. Discovery exists to help people bring more media into their libraries, not to foreground system mechanics.
- Do not expose implementation-detail data in normal user surfaces unless the feature explicitly calls for it.
- Internal identifiers, trust/debug fields, transport counters, account/network totals, raw refs, and similar scaffolding must stay out of the default UI.
- If verification or diagnostics are needed later, put them behind an explicit dedicated affordance. Do not leak them into routine browsing, search, library, or discovery flows.
- User-facing collection surfaces should stay visually consistent across discovery, library, and profile views unless there is a strong product reason to differentiate them.

## Monolithic Default

When starting a new feature, bias toward one well-structured core file instead of premature module sprawl.

Recommended section order inside the main file:

1. Table of contents / file overview
2. Config and constants
3. Types, guards, and invariants
4. State model
5. Pure helpers
6. Domain logic
7. IO adapters
8. Wiring / entrypoints
9. Test exports

Rules:

- Add clear section anchors.
- Keep comments intentional and local.
- Document non-obvious data flow and invariants.
- If the code later splits, preserve a flattenable mental model so an agent can still reason about the whole system quickly.

## Layered Reinforcement

Do not rely on one explanation channel.

For meaningful changes, restate intent through at least three of these layers:

- section headers or table-of-contents updates
- concise code comments near the behavior
- targeted test names
- sanity fixture case names
- README behavior index entries
- `AGENTS.md` updates when process or standards changed

The goal is repeated signalling of intent from different angles, not verbosity for its own sake.

## Default Repo Layout

Use this layout unless the project needs something else:

- `AGENTS.md` - repo-wide operating rules
- `README.md` - user-facing overview plus behavior/test workflow
- `src/` - main implementation, monolithic by default
- `tests/` - targeted unit and integration coverage
- `tests/sanity/` - curated real-flow fixture inputs and expected outputs

If you add subdirectory-specific `AGENTS.md` files later, they may refine local rules but must not silently contradict this file.

## Workflow

1. Plan the change and define user-visible acceptance criteria.
2. Identify the smallest realistic patch.
3. If behavior changes, update the README Behavior Index before or alongside the code.
4. Add or update focused tests for the exact behavior.
5. Add or update sanity fixtures that exercise the real flow, not just internal helpers.
6. Run the full test suite after every change, not only before merge.
7. Commit code, docs, and fixtures together.

## Testing Doctrine

Mandatory rules:

- Every behavior change needs regression coverage.
- Minor edits are not exempt. Wording, casing, spacing, formatting, and control-flow fixes can still change behavior.
- A user-reported bug means both a product defect and a missing test.
- Do not weaken tests just to make the suite pass.
- Prefer deterministic tests with explicit seeds or stubbed randomness.

Maintain two layers:

1. Targeted tests for pure helpers, reducers, parsers, and edge cases.
2. Sanity regression that drives the actual program flow and compares results to curated fixtures.

The curated sanity fixture pair is the oracle for end-to-end intent:

- `tests/sanity/yolk_sanity_input.json`
- `tests/sanity/yolk_sanity_expected.json`

When behavior changes:

1. Update the README Behavior Index.
2. Add or revise the input fixture case.
3. Hand-author the expected output fixture.
4. Update targeted tests.
5. Run the full suite.
6. Commit all of the above together.

## Bug Protocol

1. Reproduce the issue with a failing targeted test or sanity case.
2. Fix the smallest root cause.
3. Generalize the missed condition into lasting coverage.
4. If the miss exposed a process gap, update this file or the README.

## Review Checklist

- Scope is clear.
- Monolithic core is still navigable.
- IO remains isolated from pure logic where practical.
- The default UI stays media-first and avoids implementation-detail clutter.
- Targeted tests were added or updated.
- Sanity fixtures and README Behavior Index were updated for behavior changes.
- Full suite was run after the change.
- Comments and structure still explain intent cleanly.

## 50% Rule

For substantive work, roughly half of the effort should go to reliability and clarity:

- tests
- fixtures
- docs
- comments
- invariants
- simplification

This repo treats those as product work, not optional cleanup.
