---
phase: 01-location-submission-entry
plan: 01
subsystem: api
tags: [express, ejs, hmac, crypto, node-test, supertest, qr]

# Dependency graph
requires: []
provides:
  - "GET /report — signed-QR locked-state render, three-state EJS contract ({mode, locations, locked, message})"
  - "src/services/qrSignature.js — signLocationId/verifyLocationSignature (HMAC-SHA256, constant-time compare)"
  - "src/services/locationStore.js — getAll/findById, BOM-safe JSON read"
  - "config/locations.json — 5-record seed registry"
  - "test/helpers/signedUrl.js — signedReportUrl() test helper, deterministic QR_SIGNING_SECRET seeding"
affects: [01-02-dropdown-error-states, 01-03-stylesheet, 01-04-qr-generation-script, 01-05-note-field-client-js, 01-06-validate-endpoint]

# Actuals (#2632)
actuals:
  tokens: 3737
  tasks: 3
  commits: 4

# Tech tracking
tech-stack:
  added: [ejs@^6.0.1, qrcode@^1.5.4, supertest@^7.2.2 (devDep)]
  patterns:
    - "HMAC-SHA256 signed QR URL (crypto built-in), verified constant-time, never compared with === "
    - "Server-side rendering via EJS — single template, three-state render contract, auto-escaped interpolation only"
    - "Call-time (not module-load-time) secret read in qrSignature.js so require() order never matters for tests"
    - "Single generic Thai error message for every QR-failure reason; specific reason logged server-side only"

key-files:
  created:
    - config/locations.json
    - src/services/qrSignature.js
    - src/services/locationStore.js
    - src/routes/report.js
    - views/report.ejs
    - test/helpers/signedUrl.js
    - test/report.test.js
  modified:
    - package.json
    - .env.example
    - index.js

key-decisions:
  - "QR payload format locked to HMAC-SHA256-signed URL (Task 2 checkpoint:decision, option `signed-url`) — proves the URL was minted by the system, not hand-typed from a leaked location_id; zero new dependency (Node's built-in crypto)."
  - "QR_SIGNING_SECRET read at call time inside qrSignature.js rather than at module load — deliberate divergence from 01-RESEARCH.md's Pattern 1 reference implementation, to make require() order irrelevant for tests while keeping the missing-secret failure loud and named."
  - "Locked-branch-only EJS template this task; dropdown/error branches left as explicitly marked empty regions for plan 01-02."

patterns-established:
  - "Pattern: signature length-guard (exactly 32 hex chars) BEFORE any Buffer.from(...,'hex') decode, and buffer-length-guard BEFORE crypto.timingSafeEqual — both required because Buffer.from silently truncates malformed hex and timingSafeEqual throws RangeError on length mismatch."
  - "Pattern: registry reads happen at request time with no caching, matching wasteImageClassifier.js's existing config-read convention; BOM stripped before JSON.parse."

requirements-completed: [SUBM-01, SUBM-02]

coverage:
  - id: D1
    description: "A signed QR URL (GET /report?location_id=<id>&sig=<valid>) renders the report form with that location's name confirmed and locked, in one HTTP response, no login."
    requirement: SUBM-01
    verification:
      - kind: e2e
        ref: "test/report.test.js#GET /report with a valid signed QR renders the locked location"
        status: pass
      - kind: e2e
        ref: "manual: curl http://localhost:3000/report?location_id=LIB&sig=<valid> against a live `node index.js` boot — HTTP 200, body contains หอสมุด and ยืนยันจาก QR"
        status: pass
    human_judgment: false
  - id: D2
    description: "The rendered locked form contains no free-text address input of any kind."
    requirement: SUBM-01
    verification:
      - kind: unit
        ref: "test/report.test.js#the locked response offers no free-text address entry"
        status: pass
    human_judgment: false
  - id: D3
    description: "A QR whose location_id doesn't match its signature (tampered/reused signature) is rejected with the single SPEC error message, not a per-reason message."
    requirement: SUBM-02
    verification:
      - kind: e2e
        ref: "test/report.test.js#GET /report with a signature minted for a different location is rejected"
        status: pass
      - kind: unit
        ref: "test/report.test.js#verifyLocationSignature rejects a signature minted for a different id"
        status: pass
    human_judgment: false
  - id: D4
    description: "Signature verification never throws on malformed/garbage input (wrong length, non-hex, undefined, null)."
    requirement: SUBM-02
    verification:
      - kind: unit
        ref: "test/report.test.js#verifyLocationSignature never throws on malformed input"
        status: pass
    human_judgment: false
  - id: D5
    description: "locationStore resolves ids with exact string equality (no case-fold/trim) and survives a BOM-prefixed registry file."
    requirement: SUBM-02
    verification:
      - kind: unit
        ref: "test/report.test.js#locationStore.findById uses exact string equality, no case-folding or trimming"
        status: pass
      - kind: unit
        ref: "test/report.test.js#locationStore.getAll survives a BOM-prefixed registry file"
        status: pass
    human_judgment: false
  - id: D6
    description: "Visual/UX quality of the rendered locked state against 01-UI-SPEC.md's Color/Typography/Copywriting contract (badge treatment, accent border, font stack) — no stylesheet exists yet (lands in plan 01-03), so this can only be judged once CSS is wired."
    verification: []
    human_judgment: true
    rationale: "public/css/report.css does not exist until plan 01-03; the markup/DOM contract is verified programmatically here, but visual fidelity against the UI-SPEC needs a human look once the stylesheet lands."

duration: ~25min (Task 3 active execution; excludes checkpoint wait time for Task 2's human decision)
completed: 2026-08-20
status: complete
---

# Phase 1 Plan 1: Signed-QR Tracer Summary

**HMAC-SHA256-signed QR URL (`GET /report?location_id=X&sig=Y`) end-to-end through Express → crypto verification → JSON registry read → EJS-rendered locked form, covered by 9 passing `node --test` cases.**

## Performance

- **Duration:** ~25 min (Task 3 active execution only; Task 2 was a checkpoint:decision pause for a human answer, not counted as active work)
- **Started:** 2026-08-19T21:26:15+07:00 (Task 1 commit)
- **Completed:** 2026-08-20T00:42:51+07:00 (Task 3 commit)
- **Tasks:** 3/3
- **Files modified:** 10 (7 created, 3 modified)

## Accomplishments
- Locked `QR_SIGNING_SECRET`-signed URL as the QR payload format (Task 2 decision, `signed-url` option) — the plan's written default, no revision needed.
- Built `src/services/qrSignature.js`: HMAC-SHA256 sign/verify with a length guard before hex decode and a buffer-length guard before `crypto.timingSafeEqual`, never a `===` comparison.
- Built `src/services/locationStore.js`: BOM-safe, request-time read of `config/locations.json`; exact `===` match in `findById`.
- Built `src/routes/report.js`: `GET /report` locked branch — verifies signature and registry membership, renders the confirmed location, single generic Thai error message for every other case.
- Built `views/report.ejs`: single EJS template implementing the `locked` branch fully (badge, lock icon, location name, "ไม่ใช่จุดนี้" link, "ถัดไป" CTA), auto-escaped interpolation only, `dropdown`/`error` branches left as marked stubs for plan 01-02.
- Wired `index.js`: EJS view engine, `public/` static mount, boot-time `QR_SIGNING_SECRET` assertion, `app.listen` guarded behind `require.main === module` so tests import the app without binding port 3000.
- `test/report.test.js` (9 cases) + `test/helpers/signedUrl.js`: full TDD RED→GREEN cycle, then re-verified live against a real `node index.js` boot via curl.

## Task Commits

Each task was committed atomically:

1. **Task 1: Install deps, wire test script, seed location registry** - `dbdb997` (feat)
2. **Task 2: Decision gate — QR payload format** - recorded inline below (checkpoint:decision, no code commit; resumed with `signed-url`)
3. **Task 3: End-to-end tracer (TDD)** - `60dd124` (test — RED), `b396758` (feat — GREEN)

**Plan metadata:** (this commit, `docs(01-01): complete signed-QR tracer plan`)

_Note: Task 3 is `tdd="true"`, hence two commits — RED (failing test) then GREEN (implementation)._

## Files Created/Modified
- `config/locations.json` - 5-record seed registry (A/B/DORM-1/LIB/CAFE, Thai placeholder names, per D-01/D-02/D-03/D-04)
- `src/services/qrSignature.js` - HMAC-SHA256 sign/verify, exports `signLocationId`, `verifyLocationSignature`
- `src/services/locationStore.js` - BOM-safe registry read, exports `getAll`, `findById`
- `src/routes/report.js` - `GET /report` locked branch + single-message error branch
- `views/report.ejs` - three-state render contract, locked branch fully implemented
- `test/helpers/signedUrl.js` - `signedReportUrl()` helper, deterministic test-secret seeding
- `test/report.test.js` - 9 `node:test` + `supertest` cases
- `package.json` / `package-lock.json` - added `ejs`, `qrcode`; `supertest` devDependency; `scripts.test = "node --test"`
- `.env.example` - declared `QR_SIGNING_SECRET=`
- `index.js` - EJS view engine, static mount, boot-time secret assertion, test-safe `app.listen` guard, `reportRouter` mounted

## Decisions Made
- **QR payload format: HMAC-SHA256-signed URL** (Task 2, option `signed-url`). Rationale: proves the URL was minted by the system rather than hand-typed from a leaked/guessed `location_id`, closing the impersonation gap SPEC's "un-forgeable QR" language and `.claude/CLAUDE.md` both call for. Zero new dependency. This is the plan's written default — Task 3 proceeded exactly as authored, `qrSignature.js` and the `sig` query parameter were not dropped.
- **Call-time secret read**, not module-load-time, in `qrSignature.js` — a considered divergence from 01-RESEARCH.md Pattern 1's reference implementation (which reads the secret at module load). Makes `require()` order irrelevant for tests (`test/helpers/signedUrl.js` seeds the env var before the app is required) while still failing loudly with a named error the moment a signing/verifying call is actually attempted with no secret set.
- **`res.status(400).send(message)` for the error branch**, not `res.render(...)`, since this task only owns the locked branch and plan 01-02 develops the error branch into a full rendered state (matches the plan's own instruction: "plan 01-02 develops that branch into a full rendered error state").

## Deviations from Plan

None - plan executed exactly as written. Task 2's decision (`signed-url`) was the plan's own documented default, so Task 3 required no revision.

## Issues Encountered

None - RED (9 tests failing on missing modules) → GREEN (9/9 passing) on the first implementation pass; no debugging iterations needed. Live boot + curl against `GET /report?location_id=LIB&sig=<valid>` confirmed 200 with the location and badge rendered, matching the automated test assertions.

## User Setup Required

None - no external service configuration required. `QR_SIGNING_SECRET` was already generated into the local, gitignored `.env` by Task 1; no action needed from the user for this plan.

## Known Stubs

| File | Location | Reason |
|------|----------|--------|
| `views/report.ejs` | `<% } else if (mode === 'dropdown') { %>` / `<% } else if (mode === 'error') { %>` branches (HTML comments, no markup) | Intentional per this task's own `<action>` instructions — this task implements only the `locked` branch; plan 01-02 fills the `dropdown` and `error` render branches. Not reachable in this plan (`src/routes/report.js` never sets `mode: 'dropdown'` or `mode: 'error'` yet), so no user-facing gap exists until 01-02 lands. |

## Next Phase Readiness

- The `{mode, locations, locked, message}` EJS render contract and the full DOM/class-name contract (`.location-block`, `.location-locked`, `.location-dropdown`, `.cta`, etc.) are in place and unchanged from the plan's frontmatter table — plans 01-02 (dropdown/error states), 01-03 (stylesheet), 01-05 (note field + "ไม่ใช่จุดนี้" client JS), and 01-06 (validate endpoint) can build directly against them.
- `views/report.ejs`'s `dropdown` and `error` branches are explicitly marked stub regions (HTML comments) ready for plan 01-02 to fill in — no restructuring needed, only insertion.
- No blockers. `src/routes/classify.js`, `src/services/wasteImageClassifier.js`, and `src/services/imageType.js` (Phase 2 concerns) are confirmed untouched.
- **Known stub (intentional, tracked for later plans):** `views/report.ejs`'s `dropdown` and `error` render branches are empty placeholder comments — by design, per this task's own instructions ("leaves the other two branches as explicitly-marked empty regions for plan 01-02 to fill"). Not a defect; plan 01-02 is the designated follow-up.

---
*Phase: 01-location-submission-entry*
*Completed: 2026-08-20*

## Self-Check: PASSED

All 8 created/modified files confirmed present on disk; all 3 task commit hashes (`dbdb997`, `60dd124`, `b396758`) confirmed present in `git log --oneline --all`.
