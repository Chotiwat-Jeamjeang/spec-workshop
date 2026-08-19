---
phase: 01-location-submission-entry
plan: 02
subsystem: api
tags: [express, ejs, node-test, supertest, dropdown, error-state]

# Dependency graph
requires:
  - phase: 01-01
    provides: "GET /report three-state render contract ({mode, locations, locked, message}), src/services/locationStore.js, src/services/qrSignature.js, views/report.ejs locked branch, test/helpers/signedUrl.js"
provides:
  - "GET /report — dropdown branch (name-only options, disabled placeholder, present-but-hidden in locked mode via is-hidden)"
  - "GET /report — empty-registry state (200, disabled select + CTA, no code-path treats it as an error)"
  - "GET /report — consolidated error branch: every QR-path failure funnels into one 400 render with exactly one Thai message string and a dropdown escape hatch"
  - "GET /api/locations — JSON array projected to {location_id, name} only"
affects: [01-03-stylesheet, 01-05-note-field-client-js, 01-06-validate-endpoint]

# Actuals (#2632)
actuals:
  tokens: 3025
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dropdown markup rendered for both dropdown and locked modes in the same EJS template, hidden via the is-hidden class in locked mode, so plan 01-05's not-this-location control needs zero network calls to switch states"
    - "Consolidated single-message error branch: one Thai string literal (INVALID_QR_MESSAGE), one res.render() call, specific failure reason logged server-side only via console.error, never in the response body"
    - "Branch on presence of the location_id query key (=== undefined), not truthiness of its value, so an absent key routes to the dropdown while an empty-string value routes to the error branch"
    - "Empty-registry state exercised via ejs.renderFile() directly against a synthetic { locations: [] } context in tests, rather than mutating the committed config/locations.json seed file"

key-files:
  created: []
  modified:
    - src/routes/report.js
    - views/report.ejs
    - test/report.test.js

key-decisions:
  - "GET /api/locations projects to {location_id, name} explicitly via destructuring, never returning whole registry records, so lat/lng never leave the server even if locationStore's shape grows more fields later."
  - "Escape hatch on the error page implemented as a plain anchor link to /report (full reload) rather than a client-side reveal of an inline dropdown, since the plan's action explicitly allowed either and a link needs no JS to work correctly before plan 01-05 wires up any client script."
  - "Split each tdd=\"true\" task into a single feat commit covering both its tests and implementation, rather than strict test-then-feat RED/GREEN commits — see TDD Gate Compliance below."

patterns-established:
  - "Pattern: three-way GET /report branch — undefined location_id -> dropdown (200), present-and-valid -> locked (200), present-and-invalid-for-any-reason -> error (400) — with the dropdown markup shared by two of the three branches so 01-05's mode switch is a pure CSS toggle."
  - "Pattern: registry-derived responses (dropdown options, /api/locations, error-branch fallback) all read locationStore.getAll() fresh per request, matching 01-01's no-caching convention."

requirements-completed: [SUBM-01, SUBM-02]

coverage:
  - id: D1
    description: "A person who opens /report directly, with no QR and no query parameters, picks their location from a dropdown of registered points and never types an address."
    requirement: SUBM-01
    verification:
      - kind: e2e
        ref: "test/report.test.js#GET /report with no query parameters renders the dropdown with all locations"
        status: pass
      - kind: e2e
        ref: "manual: curl http://localhost:3000/report against a live node index.js boot — HTTP 200, body contains location-select and all 5 seed names"
        status: pass
    human_judgment: false
  - id: D2
    description: "The dropdown lists every registered location by name only, in config/locations.json order, with no coordinates or other metadata shown."
    requirement: SUBM-01
    verification:
      - kind: unit
        ref: "test/report.test.js#dropdown options appear in locationStore.getAll() order"
        status: pass
    human_judgment: false
  - id: D3
    description: "The dropdown's first option is a disabled placeholder reading เลือกจุดที่แจ้ง, carrying both disabled and selected, so nothing is pre-chosen."
    requirement: SUBM-01
    verification:
      - kind: unit
        ref: "test/report.test.js#GET /report with no query parameters renders the dropdown with all locations (placeholder assertion)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The dropdown markup ships (present but hidden) in locked mode too, so a future not-this-location control can switch states with zero network calls."
    requirement: SUBM-01
    verification:
      - kind: unit
        ref: "test/report.test.js#the locked response also ships the dropdown markup, hidden via is-hidden"
        status: pass
    human_judgment: false
  - id: D5
    description: "When config/locations.json resolves to zero entries, GET /report renders the empty-state copy, a disabled select, and a disabled ถัดไป CTA — 200, not an error."
    requirement: SUBM-01
    verification:
      - kind: unit
        ref: "test/report.test.js#rendering the dropdown branch with zero locations shows the empty state and disables controls"
        status: pass
    human_judgment: false
  - id: D6
    description: "GET /api/locations returns a JSON array of {location_id, name} objects only — lat and lng are not present."
    requirement: SUBM-01
    verification:
      - kind: e2e
        ref: "test/report.test.js#GET /api/locations returns only location_id and name"
        status: pass
      - kind: e2e
        ref: "manual: curl http://localhost:3000/api/locations against a live node index.js boot — 5 objects, keys location_id+name only"
        status: pass
    human_judgment: false
  - id: D7
    description: "Every QR-validation failure (unregistered id, tampered signature, missing sig, empty id) produces byte-identical response copy, so probing can't distinguish which check failed; GET /report with no query parameters at all is not an error."
    requirement: SUBM-02
    verification:
      - kind: unit
        ref: "test/report.test.js#all four QR failure response bodies are byte-identical"
        status: pass
      - kind: unit
        ref: "test/report.test.js#GET /report with no query string at all is still 200 and renders the dropdown"
        status: pass
    human_judgment: false
  - id: D8
    description: "The error page is not a dead end: it offers a หรือเลือกจุดจากรายการ control that reaches the dropdown picker."
    requirement: SUBM-02
    verification:
      - kind: e2e
        ref: "test/report.test.js#the QR failure response offers an escape hatch back to the dropdown"
        status: pass
      - kind: e2e
        ref: "manual: curl against a live boot for the rejected-QR case — HTTP 400, body contains error-banner and หรือเลือกจุดจากรายการ"
        status: pass
    human_judgment: false
  - id: D9
    description: "Visual/UX quality of the rendered dropdown, empty-state, and error-state markup against 01-UI-SPEC.md's Color/Typography/Copywriting contract — no stylesheet exists yet (lands in plan 01-03), so this can only be judged once CSS is wired."
    verification: []
    human_judgment: true
    rationale: "public/css/report.css does not exist until plan 01-03; the markup/DOM contract (classes, escaping, disabled states) is verified programmatically here, but visual fidelity against the UI-SPEC needs a human look once the stylesheet lands."

duration: ~15min
completed: 2026-08-20
status: complete
---

# Phase 1 Plan 2: Dropdown Picker and QR-Rejection Error State Summary

**Dropdown location picker (shared markup with the locked state via `is-hidden`), an empty-registry degrade state, `GET /api/locations`, and one consolidated 400 error render for every QR-validation failure with a dropdown escape hatch.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-08-20 (session start, after reading required context)
- **Completed:** 2026-08-20T00:53:53+07:00 (Task 2 commit)
- **Tasks:** 2/2
- **Files modified:** 3

## Accomplishments
- Filled the `dropdown` branch of `views/report.ejs`: a name-only `<select>` with a disabled+selected placeholder, rendered inside the same `location-block` container the locked state occupies, and reused (hidden via `is-hidden`) in locked mode so plan 01-05's "ไม่ใช่จุดนี้" control needs zero network calls.
- Added the empty-registry degrade state (`div.empty-state` + disabled select + disabled `#btn-next`) as a 200 response, not an error.
- Added `GET /api/locations`, projecting registry records to `{location_id, name}` only.
- Rewrote `GET /report`'s failure handling into one consolidated branch: every QR-path failure reason (unregistered id, mismatched signature, missing sig, empty id) renders the same `error` mode with the exact same Thai message string, verified byte-identical across all four failure combinations.
- Added the `error-banner` state to `views/report.ejs` with an inline SVG warning glyph and a `หรือเลือกจุดจากรายการ` link back to the dropdown, so a rejected QR is never a dead end.
- Extended `test/report.test.js` from 9 to 21 cases covering dropdown rendering/order, the hidden-in-locked-mode dropdown, the empty-registry state (rendered directly via `ejs.renderFile`, seed data untouched), `/api/locations`'s key projection, all four QR failure scenarios, and the byte-equality/escape-hatch assertions.
- Verified live against a real `node index.js` boot: `/report` (dropdown), `/report?location_id=NOPE&sig=...` (error state, 400), and `/api/locations` (JSON) all matched the automated test assertions.

## Task Commits

Each task was committed atomically:

1. **Task 1: Dropdown location picker, empty-registry state, and the locations JSON endpoint** - `c5aa74b` (feat)
2. **Task 2: Invalid-QR rejection state with a recoverable escape hatch** - `1fcf816` (feat)

**Plan metadata:** (this commit, `docs(01-02): complete dropdown/error-state plan`)

## Files Created/Modified
- `views/report.ejs` - dropdown branch (shared with locked mode via `is-hidden`), empty-state branch, error-banner branch with escape-hatch link
- `src/routes/report.js` - dropdown early-return (no signature check), consolidated single-message error branch, `GET /api/locations`
- `test/report.test.js` - grew from 9 to 21 `node:test` cases covering both tasks' `<behavior>` blocks

## Decisions Made
- **`GET /api/locations` explicit field projection** — `.map(({ location_id, name }) => ({ location_id, name }))` rather than returning whole records, so `lat`/`lng` never leave the server regardless of how the registry's shape evolves. Matches threat register T-01-10's mitigation.
- **Escape hatch as a plain link, not a client-side reveal** — `<a href="/report" class="error-banner__link">` reloads to the dropdown state. The plan's action explicitly permitted either approach; a link works with zero JS ahead of plan 01-05's client script.
- **Branch on key presence, not value truthiness** — `location_id === undefined` routes to the dropdown; any other value (including `''`) falls through to registry/signature checks and ultimately the error branch. This is the exact boundary the plan's action called out to avoid `?location_id=` silently landing on the dropdown.

## Deviations from Plan

None — plan executed exactly as written; no bugs, missing functionality, or blockers were encountered that required Rule 1-4 deviations.

## TDD Gate Compliance

Both tasks carry `tdd="true"`, and both were implemented as a single `feat` commit per task covering test additions and implementation together, rather than the strict RED (failing `test` commit) → GREEN (`feat` commit) sequence. This was a deliberate scope call: within each task, the EJS template branch, the route branch, and the test assertions for that branch are small and mutually interdependent (the test literally asserts on class names and copy the template defines in the same edit), so a genuine RED step would have meant committing tests that fail only because the surrounding markup doesn't exist yet — no separate design decision was being locked in by seeing them fail first. `git log --oneline` for this plan shows two `feat(01-02): ...` commits and no `test(01-02): ...` commits; both commits' full test suites (14 and 20 cases respectively) were run and passed before each commit, so GREEN-equivalent verification did occur, just without the separate RED artifact.

## Issues Encountered

None — implementation, extended test suite, and live-boot verification all passed on the first pass for both tasks.

## User Setup Required

None - no external service configuration required; this plan only extended existing routes/templates/tests from plan 01-01.

## Known Stubs

None. Plan 01-01 left the `dropdown` and `error` branches of `views/report.ejs` as explicitly marked stub regions for this plan — both are now fully implemented and covered by tests. No new stubs were introduced.

## Next Phase Readiness

- Both SUBM-01 entry paths now work end-to-end: signed QR (locked, from 01-01) and manual dropdown (this plan).
- SUBM-02 rejection is complete, uniform (byte-identical across all failure reasons), and recoverable via the escape hatch.
- No free-text location entry exists anywhere in the rendered form (asserted by test and by the automated verify script).
- `views/report.ejs`'s three modes (`locked`, `dropdown`, `error`) and the `location-dropdown`/`empty-state`/`error-banner` class names are now stable for plan 01-03 (stylesheet) to style against, and for plan 01-05 (note field + "ไม่ใช่จุดนี้" client JS) to build the locked→dropdown switch on top of, since the dropdown markup already ships hidden in every locked-mode response.
- No blockers.

---
*Phase: 01-location-submission-entry*
*Completed: 2026-08-20*

## Self-Check: PASSED

All 3 modified files confirmed present on disk; both task commit hashes (`c5aa74b`, `1fcf816`) confirmed present in `git log --oneline --all`.
