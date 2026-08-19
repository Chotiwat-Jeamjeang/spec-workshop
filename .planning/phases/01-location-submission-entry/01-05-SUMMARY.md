---
phase: 01-location-submission-entry
plan: 05
subsystem: web-frontend
tags: [ejs, vanilla-js, aria, thai-text, node-test, supertest]

# Dependency graph
requires:
  - phase: 01-02
    provides: "GET /report three-state render contract (locked/dropdown/error), dropdown markup already rendered (hidden via is-hidden) in locked mode"
provides:
  - "public/js/report.js — vanilla, network-free client script: locked-to-dropdown toggle (#btn-not-this) and the live note-length counter"
  - "views/report.ejs — #note textarea, #note-counter live region, and the deferred /js/report.js script element"
affects: [01-06-validate-endpoint, 01-07-fcp-responsive-verification]

# Actuals (#2632)
actuals:
  tokens: 2081
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single guarded-lookup vanilla JS file (public/js/report.js) served for all three render modes; every getElementById/querySelector result is null-checked before use so the same script is inert on modes lacking a given control"
    - "Note-length counter measured via note.value.length (UTF-16 code units), never Buffer.byteLength/TextEncoder, matching the browser's own maxlength semantics — RESEARCH.md Pitfall #3"
    - "Counter DOM writes use textContent only, never innerHTML, so nothing the user types is ever parsed as markup (T-01-16)"
    - "Counter's initial value is server-rendered in views/report.ejs ('0 / 500 ตัวอักษร'), not computed on script load, so the first paint is already correct"

key-files:
  created:
    - public/js/report.js
  modified:
    - views/report.ejs
    - test/report.test.js

key-decisions:
  - "Note field renders unconditionally (outside the mode-specific if branches), matching the existing unconditional #btn-next CTA — the plan's own <behavior> block ('every rendered mode that shows the form') is satisfied literally without introducing a new mode-gating rule the CTA didn't already have."
  - "btn-not-this stays exclusively inside the locked branch (D-08 mis-scan recovery, not a general-editable field) — confirmed by test that dropdown and error modes never render it."

patterns-established:
  - "Pattern: one client script per page, loaded on every mode, made safe purely through per-control existence checks rather than mode branching in JS — keeps public/js/report.js decoupled from server-side render-mode logic."

requirements-completed: [SUBM-01, SUBM-03]

coverage:
  - id: D1
    description: "A person who scanned the wrong or a mis-read QR can press ไม่ใช่จุดนี้ and pick the correct location themselves, without reloading the page (D-08)."
    requirement: SUBM-01
    verification:
      - kind: unit
        ref: "test/report.test.js#the locked-state response contains the btn-not-this control"
        status: pass
      - kind: unit
        ref: "test/report.test.js#report.js contains no fetch, XMLHttpRequest or dynamic import"
        status: pass
      - kind: e2e
        ref: "manual: curl http://localhost:3000/report and /js/report.js against a live node index.js boot — both served correctly"
        status: pass
    human_judgment: false
  - id: D2
    description: "The ไม่ใช่จุดนี้ control performs zero network requests."
    requirement: SUBM-01
    verification:
      - kind: unit
        ref: "test/report.test.js#report.js contains no fetch, XMLHttpRequest or dynamic import"
        status: pass
    human_judgment: false
  - id: D3
    description: "The ไม่ใช่จุดนี้ control appears only in the locked state."
    requirement: SUBM-01
    verification:
      - kind: unit
        ref: "test/report.test.js#the dropdown-state response does not contain btn-not-this"
        status: pass
      - kind: unit
        ref: "test/report.test.js#the error-state response does not contain btn-not-this"
        status: pass
    human_judgment: false
  - id: D4
    description: "A person can add an optional note of up to 500 characters, and the browser physically prevents typing past that limit."
    requirement: SUBM-03
    verification:
      - kind: unit
        ref: "test/report.test.js#the locked-state response contains the optional note field"
        status: pass
      - kind: unit
        ref: "test/report.test.js#the dropdown-state response contains the optional note field"
        status: pass
    human_judgment: false
  - id: D5
    description: "The note limit is counted in UTF-16 code units, so a Thai note gets the full 500 characters, not roughly 166."
    requirement: SUBM-03
    verification:
      - kind: unit
        ref: "test/report.test.js#a Thai sample string reports its .length, not a byte-derived count"
        status: pass
      - kind: unit
        ref: "test/report.test.js#report.js measures note length with .length, never Buffer.byteLength or TextEncoder"
        status: pass
    human_judgment: false
  - id: D6
    description: "On first render with nothing entered, the note textarea is empty, the counter reads 0 / 500 ตัวอักษร, and no error is shown."
    requirement: SUBM-03
    verification:
      - kind: unit
        ref: "test/report.test.js#the note counter is a polite live region with the correct initial text"
        status: pass
      - kind: e2e
        ref: "manual: curl http://localhost:3000/report against a live boot — body contains '0 / 500 ตัวอักษร'"
        status: pass
    human_judgment: false
  - id: D7
    description: "The live character counter is announced to assistive technology through a polite live region as the user types."
    requirement: SUBM-03
    verification:
      - kind: unit
        ref: "test/report.test.js#the note counter is a polite live region with the correct initial text"
        status: pass
      - kind: unit
        ref: "test/report.test.js#the note textarea is described by the counter and labelled correctly"
        status: pass
    human_judgment: false
  - id: D8
    description: "Visual/UX quality of the toggle interaction and note-field treatment against 01-UI-SPEC.md (focus rings, Accent-colour link, spacing) — programmatically verified DOM contract only; visual fidelity needs a human look."
    verification: []
    human_judgment: true
    rationale: "public/css/report.css already carries the .location-not-this, .note-field, .note-input, .note-counter rules from plan 01-03 (no new CSS added by this plan); markup/behaviour is verified programmatically here, but overall visual polish is judged at phase-level UI review."
---

# Phase 1 Plan 5: Mis-Scan Recovery Control and Optional Note Field Summary

**A network-free `ไม่ใช่จุดนี้` toggle that switches the locked location display back to the dropdown picker, plus an optional 500-character note field with a live, UTF-16-correct counter for Thai text — both driven by one guarded vanilla-JS file.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-08-20 (session start, after reading required context)
- **Completed:** 2026-08-20 (Task 2 commit)
- **Tasks:** 2/2
- **Files modified:** 3 (1 created: `public/js/report.js`)

## Accomplishments

- Created `public/js/report.js`: a single, guarded-lookup vanilla script served for all three render modes. Every `getElementById`/`querySelector` result is null-checked, so the script is a safe no-op on modes where a given control (`#btn-not-this`, `#note`) doesn't exist.
- Wired the `ไม่ใช่จุดนี้` click handler: reveals the already-rendered (previously hidden) dropdown markup, hides the locked display and the button itself, moves focus to `#location-select`, and flips `body[data-mode]` to `dropdown` — with zero `fetch`/`XMLHttpRequest`/dynamic `import` calls, since 01-02 already ships the dropdown options hidden in every locked-mode response.
- Added a deferred `<script src="/js/report.js" defer>` element to `views/report.ejs`, served by the `express.static` mount already wired in `index.js` — no new server code needed.
- Added the optional note field: `label[for=note]` + `textarea#note` (`maxlength="500"`, no `required`, `aria-describedby="note-counter"`) + `div#note-counter` (`aria-live="polite"`), server-rendered with the correct initial text `0 / 500 ตัวอักษร` so there's no flash of an empty/wrong counter before the script runs.
- Wired the counter's `input` listener to `note.value.length` — the same UTF-16 code-unit measure the browser's own `maxlength` uses — and asserted in a dedicated test that a 200-code-unit Thai sample reports `200 / 500` while its UTF-8 byte length is strictly larger, documenting the exact trap RESEARCH.md Pitfall #3 warns about.
- Extended `test/report.test.js` from 20 to 31 cases, covering both tasks' `<behavior>` blocks.
- Verified live against a real `node index.js` boot: `GET /report` (dropdown mode) rendered the note textarea with `maxlength="500"`, the initial counter text, and `/js/report.js` served correctly with the expected file header.

## Task Commits

Each task was committed atomically:

1. **Task 1: The ไม่ใช่จุดนี้ mis-scan recovery control** - `0629542` (feat)
2. **Task 2: Optional note field with a live, Thai-correct character counter** - `1705999` (feat)

## Files Created/Modified

- `public/js/report.js` - NEW: guarded-lookup click handler for the location toggle, and an `input` listener for the note counter
- `views/report.ejs` - added the deferred `/js/report.js` script element, and the unconditional note-field block (label, textarea, live counter)
- `test/report.test.js` - grew from 20 to 31 `node:test` cases

## Decisions Made

- **Note field renders unconditionally, outside the mode-specific `if` branches** — matching the existing unconditional `#btn-next` CTA button, which already renders in all three modes. The plan's `<behavior>` block ("every rendered mode that shows the form contains a textarea...") is satisfied literally without introducing a new mode-gating convention the CTA didn't already establish.
- **`btn-not-this` remains locked-branch-only** — confirmed by new tests that neither the dropdown nor error response bodies contain it, preserving D-08's framing as a mis-scan recovery path, not a general "always editable" location field.
- **Counter DOM write uses `textContent`, never `innerHTML`** — direct implementation of threat register mitigation T-01-16 (the counter writes only a computed number and fixed Thai copy, never user input, and never through a markup-parsing sink).

## Deviations from Plan

None — plan executed exactly as written; no bugs, missing functionality, or blockers were encountered that required Rule 1-4 deviations.

## Issues Encountered

None — implementation, extended test suite (31/31 passing), and live-boot verification all passed on the first pass for both tasks.

## User Setup Required

None — no external service configuration required; this plan only extended existing templates/scripts/tests from plans 01-01 through 01-03.

## Known Stubs

None. Both `#btn-not-this` and the note field are fully wired: real DOM manipulation for the toggle, real live-counter behavior for the note field, no placeholder data paths.

## Threat Flags

None — all new surface (note content reflected into the counter, the locked/dropdown toggle) was already covered by this plan's own `<threat_model>` (T-01-16, T-01-17, T-01-03, T-01-18), and each mitigation was implemented as specified (textContent-only counter writes, dropdown options sourced from the server registry, static Thai copy with EJS auto-escaping, native `maxlength` plus a deferred server-side re-check in plan 01-06).

## Next Phase Readiness

- SUBM-01's mis-scan recovery path (D-08) is complete: a wrong/mis-read QR scan is recoverable in one click, zero network calls, focus correctly moved for keyboard/screen-reader users.
- SUBM-03 is complete: the optional note field is present in every mode that renders the form, physically capped at 500 characters by the browser, and its live counter is Thai-correct (UTF-16 code units) and accessible (`aria-live="polite"`).
- `public/js/report.js` is now the single client script location for plan 01-06 (validate endpoint) to extend if any client-side submit wiring is needed — the guarded-lookup pattern established here should be reused rather than a second script file introduced.
- No blockers.

---
*Phase: 01-location-submission-entry*
*Completed: 2026-08-20*

## Self-Check: PASSED

All 3 modified/created files confirmed present on disk; both task commit hashes (`0629542`, `1705999`) confirmed present in `git log --oneline --all`.
