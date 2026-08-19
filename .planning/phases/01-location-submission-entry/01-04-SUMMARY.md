---
phase: 01-location-submission-entry
plan: 04
subsystem: infra
tags: [qrcode, node-test, hmac, ops-cli]

# Dependency graph
requires:
  - phase: 01-location-submission-entry (plan 01)
    provides: "src/services/qrSignature.js (signLocationId/verifyLocationSignature), src/services/locationStore.js (getAll), config/locations.json seed registry, test/helpers/signedUrl.js"
provides:
  - "scripts/generate-qr.js — ops CLI that mints one HMAC-signed-URL QR PNG per registered location into gitignored qr-output/"
  - "QR_BASE_URL env var — configurable base URL for minted QR links, defaults to http://localhost:3000"
  - "test/qrScript.test.js — round-trip proof that every minted URL verifies for its own location and cross-validates for no other"
affects: [01-location-submission-entry (UAT of SUBM-01's QR-scan entry path)]

# Actuals (#2632)
actuals:
  tokens: 1225
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Ops-time CLI script (no Express router, no HTTP surface) for QR generation, per SPEC's admin-UI-out-of-scope framing"
    - "Script delegates registry reads to locationStore.getAll() rather than re-reading config/locations.json directly, keeping the BOM-strip and path resolution in one place"

key-files:
  created:
    - scripts/generate-qr.js
    - test/qrScript.test.js
  modified:
    - .gitignore
    - .env.example

key-decisions:
  - "QR generation stays a manual dev/ops CLI (node scripts/generate-qr.js) with zero HTTP surface — enforced by a source-level assertion in the task's automated verify step, not just documentation."
  - "Round-trip test (Task 2) reproduces the script's exact URL construction rule inline rather than requiring/shelling out to scripts/generate-qr.js, keeping the test filesystem-side-effect-free per the task's own instruction."

patterns-established:
  - "Pattern: errorCorrectionLevel 'H' + width 400 + margin 2 for all campus-signage QR PNGs — chosen for outdoor/high-wear durability (~30% damage recovery), should be reused if any future phase mints more QR codes."

requirements-completed: [SUBM-01]

coverage:
  - id: D1
    description: "Running node scripts/generate-qr.js writes one scannable PNG per registered location into qr-output/, named after its location_id."
    requirement: SUBM-01
    verification:
      - kind: integration
        ref: "manual: node scripts/generate-qr.js against the live 5-record registry, then a node -e script asserting qr-output/{A,B,DORM-1,LIB,CAFE}.png all exist, are >100 bytes, and begin with the PNG magic bytes"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every URL encoded into a generated QR verifies against verifyLocationSignature for its own location_id and fails for every other location_id."
    requirement: SUBM-01
    verification:
      - kind: unit
        ref: "test/qrScript.test.js#every minted URL parses and verifies for its own location"
        status: pass
      - kind: unit
        ref: "test/qrScript.test.js#no minted signature cross-validates another location"
        status: pass
    human_judgment: false
  - id: D3
    description: "QR generation is an ops-time CLI action only — no HTTP route exposes it, publicly or otherwise."
    requirement: SUBM-01
    verification:
      - kind: unit
        ref: "manual: node -e source-assertion script confirming scripts/generate-qr.js contains no express/router/app.get|post|use tokens"
        status: pass
    human_judgment: false
  - id: D4
    description: "Adding a location to config/locations.json and re-running the script mints a QR for the new id without invalidating any previously printed QR, because signing is deterministic per location_id."
    requirement: SUBM-01
    verification:
      - kind: unit
        ref: "test/qrScript.test.js#signLocationId is deterministic — same id yields the same signature on repeated calls"
        status: pass
    human_judgment: false
  - id: D5
    description: "Generated QR images and the qr-output directory are never committed to the repository."
    requirement: SUBM-01
    verification:
      - kind: integration
        ref: "manual: git status --porcelain shows no qr-output/ entries after node scripts/generate-qr.js runs; .gitignore contains qr-output/ alongside the three pre-existing entries"
        status: pass
    human_judgment: false
  - id: D6
    description: "The QR base URL is configurable through QR_BASE_URL and defaults to http://localhost:3000 for local UAT."
    requirement: SUBM-01
    verification:
      - kind: unit
        ref: "manual inspection: scripts/generate-qr.js reads process.env.QR_BASE_URL with fallback 'http://localhost:3000'; .env.example declares QR_BASE_URL="
        status: pass
    human_judgment: false
  - id: D7
    description: "Physical QR scan UAT — printed/displayed QR opens the report form with the correct location locked, confirmed by a human with a phone camera (LIB and DORM-1)."
    human_judgment: true
    rationale: "Requires a real phone camera scanning a rendered PNG against a live dev server — cannot be automated in this execution session; deferred to end-of-phase human UAT per the plan's <human-check> verification block."

duration: ~10min
completed: 2026-08-20
status: complete
---

# Phase 1 Plan 4: QR Generation CLI Summary

**Ops CLI (`scripts/generate-qr.js`) mints one HMAC-signed-URL QR PNG per registered location via `qrcode`'s `toFile`, with a 4-assertion round-trip test proving every minted URL verifies for its own location and cross-validates for none.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-08-20T01:09:33+07:00 (Task 1 commit)
- **Completed:** 2026-08-20T01:10:20+07:00 (Task 2 commit)
- **Tasks:** 2/2
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments
- Built `scripts/generate-qr.js`: reads `config/locations.json` through `locationStore.getAll()`, signs each `location_id` with `signLocationId`, and writes `errorCorrectionLevel: 'H'` PNGs (400px, margin 2) to gitignored `qr-output/` — verified to produce all 5 seed-location PNGs, each a valid PNG >100 bytes.
- Confirmed zero HTTP surface: a source-level assertion (part of the task's own automated verify step) fails the task if `express`, a router, or `app.get/post/use` appears anywhere in the script.
- Added `test/qrScript.test.js` (4 `node:test` cases): every minted URL round-trips through the `URL`/`searchParams` API and verifies for its own location; every ordered pair of distinct locations fails cross-validation; signing is deterministic across repeated calls; every `sig` is exactly 32 lowercase hex characters.
- `.gitignore` gained `qr-output/`; `.env.example` gained `QR_BASE_URL=` (optional, defaults to `http://localhost:3000`).
- Full suite (`node --test`, 25 cases across `test/report.test.js` and `test/qrScript.test.js`) green.

## Task Commits

Each task was committed atomically:

1. **Task 1: QR generation CLI over the registered locations** - `d175d52` (feat)
2. **Task 2: Round-trip assertion — every minted URL is exactly what the server accepts** - `ec15651` (test)

**Plan metadata:** (this commit, `docs(01-04): complete QR generation script plan`)

_Note: Task 2 carries `tdd="true"` but produced a single commit — see Deviations below for why RED/GREEN degenerated to one step._

## Files Created/Modified
- `scripts/generate-qr.js` - ops CLI: reads registry via `locationStore.getAll()`, signs each `location_id`, writes signed-URL QR PNGs to `qr-output/`
- `test/qrScript.test.js` - 4 `node:test` cases proving the mint-then-verify round trip against the real registry
- `.gitignore` - added `qr-output/`
- `.env.example` - added `QR_BASE_URL=` (optional, documented default)

## Decisions Made
- **QR generation stays a CLI, never a route** — enforced mechanically (source assertion in `<verify>`), not just by convention, closing the T-01-15 elevation-of-privilege threat from the plan's threat model.
- **Round-trip test reproduces URL construction inline** rather than shelling out to `scripts/generate-qr.js` or writing PNGs — keeps `test/qrScript.test.js` filesystem-side-effect-free and fast, per the task's explicit instruction, while still exercising the identical encode/decode path a phone's camera app performs.

## Deviations from Plan

**1. [Task-level TDD degenerated to a single commit, not RED→GREEN]**
- **Found during:** Task 2
- **Context:** Task 2 is marked `tdd="true"`, but its `<behavior>` block asserts properties of `signLocationId`/`verifyLocationSignature`/`locationStore.getAll()` — all built and correct in plan 01-01. Task 2's own `<files>` list contains only `test/qrScript.test.js`; no production file is named for a GREEN-phase implementation.
- **Outcome:** The test passed on first run (`node --test test/qrScript.test.js` → 4/4 green immediately). This is expected, not a RED-phase failure to investigate: the task exists to prove an already-correct contract (the one `scripts/generate-qr.js` relies on), not to drive new production code into existence. Committed as a single `test(...)` commit rather than a test→feat pair.
- **Files modified:** `test/qrScript.test.js` only.
- **Verification:** Full suite (`node --test`, 25/25) still green afterward; no regression introduced.
- **Committed in:** `ec15651`

---

**Total deviations:** 1 (process note, not a code fix) — no Rule 1-4 auto-fixes were needed; the plan's own written scope for Task 2 already anticipated no new production code.
**Impact on plan:** None on functionality. Documented for traceability only.

## Issues Encountered

None - both tasks passed their automated `<verify>` blocks on the first run.

## User Setup Required

None - `QR_SIGNING_SECRET` (required precondition, produced in plan 01-01) was already present in the local `.env`; `QR_BASE_URL` is optional and needs no action for local UAT.

## Known Stubs

None.

## Next Phase Readiness

- 5 scannable QR PNGs now exist locally in gitignored `qr-output/` (one per seed location: A, B, DORM-1, LIB, CAFE), each encoding a signed URL that `GET /report` (built in plan 01-01/01-02) already accepts.
- The plan's `<human-check>` verification block (physically scanning `qr-output/LIB.png` and `qr-output/DORM-1.png` with a phone camera against a live `npm start`) is deferred to end-of-phase human UAT per `human_verify_mode: end-of-phase` in `.planning/config.json` — flagged as coverage item D7, `human_judgment: true`.
- No blockers for the remaining Phase 1 plans (01-05 note field/client JS, 01-06 validate endpoint, 01-07 if present) — this plan only adds an ops-time artifact and does not touch `src/routes/report.js`, `views/report.ejs`, or any runtime code path.

---
*Phase: 01-location-submission-entry*
*Completed: 2026-08-20*

## Self-Check: PASSED

All 4 created/modified files confirmed present on disk; both task commit hashes (`d175d52`, `ec15651`) confirmed present in `git log --oneline --all`.
