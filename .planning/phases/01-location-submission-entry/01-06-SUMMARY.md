---
phase: 01-location-submission-entry
plan: 06
subsystem: web-backend
tags: [express, json-body, hmac, thai-text, node-test, supertest, xss-defense]

# Dependency graph
requires:
  - phase: 01-05
    provides: "public/js/report.js guarded-lookup script pattern; views/report.ejs note field and #btn-not-this toggle; #btn-next CTA button already rendered unconditionally"
provides:
  - "POST /api/waste-reports/validate — independent server-side re-verification of SUBM-02 (QR signature + registry membership) and SUBM-03 (note length), returning a verdict only, persisting nothing"
  - "public/js/report.js CTA submit handler — loading state, inline required-field error, and a failure banner that never discards the user's selection or note"
affects: [01-07-fcp-responsive-verification]

# Actuals (#2632)
actuals:
  tokens: 5357
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "express.json({ limit: '64kb' }) mounted once in index.js ahead of both routers — an explicit small ceiling, not the framework default, so an oversized body is rejected by the parser before any handler work runs"
    - "POST /api/waste-reports/validate re-runs verifyLocationSignature/findById on the submitted values independently of any prior GET — never trusts that an earlier request proved anything about this one"
    - "note length re-checked with .length (UTF-16 code units), matching the client's own maxlength measure — same rule established in 01-05 for the live counter"
    - "CTA submit reads the currently-visible DOM state (locked block's data-location-id/data-sig attributes, or the select's value) rather than the server-rendered mode, so it stays correct after the ไม่ใช่จุดนี้ toggle flips locked to dropdown client-side"
    - "All client-written message text uses textContent, never innerHTML, so a server-supplied error string can never be parsed as markup"
    - "CTA re-enable/relabel happens in a single finally branch covering every path (success, 400, network rejection, 5xx) so no failure path can leave the button permanently disabled"

key-files:
  created: []
  modified:
    - index.js
    - src/routes/report.js
    - views/report.ejs
    - public/js/report.js
    - test/report.test.js

key-decisions:
  - "The locked-mode GET /report response now also passes lockedSig (the exact sig that was just verified for that request) into the template, rendered as a data-sig attribute on .location-locked — the CTA reads location_id/sig from these data attributes instead of re-parsing window.location, per the plan's explicit instruction."
  - "The 01-05 test 'report.js contains no fetch, XMLHttpRequest or dynamic import' was rescoped to check only the ไม่ใช่จุดนี้ toggle handler's own click-handler body, not the whole file — D2's guarantee ('the toggle performs zero network requests') is about that specific control, and this plan legitimately adds a fetch() call elsewhere in the same file for the CTA's validate POST. A second test still bans XMLHttpRequest/dynamic import file-wide."
  - "The validate endpoint's success verdict returns exactly { valid, location_id, name } — no lat/lng, matching the GET /api/locations projection (T-01-10)."

requirements-completed: [SUBM-02, SUBM-03]

coverage:
  - id: D1
    description: "POST /api/waste-reports/validate re-verifies the QR signature and registry membership from the values actually submitted, never trusting a prior GET."
    requirement: SUBM-02
    verification:
      - kind: unit
        ref: "test/report.test.js#POST /api/waste-reports/validate with a valid signed submission returns 200 valid"
        status: pass
      - kind: unit
        ref: "test/report.test.js#POST /api/waste-reports/validate with a signature minted for a different location is rejected"
        status: pass
      - kind: static
        ref: "node -e source assertion: verifyLocationSignature appears >= 2 times in src/routes/report.js (GET path + POST path)"
        status: pass
      - kind: e2e
        ref: "manual: node index.js + curl POST /api/waste-reports/validate {location_id:LIB} -> 200 {valid:true,location_id:LIB,name:หอสมุด}"
        status: pass
    human_judgment: false
  - id: D2
    description: "A submission with an unregistered location_id, or a QR-path location_id whose signature doesn't verify, is rejected with the same single generic Thai message the GET path uses."
    requirement: SUBM-02
    verification:
      - kind: unit
        ref: "test/report.test.js#POST /api/waste-reports/validate with an unregistered location_id and no sig is rejected"
        status: pass
      - kind: unit
        ref: "test/report.test.js#POST /api/waste-reports/validate with a signature minted for a different location is rejected"
        status: pass
    human_judgment: false
  - id: D3
    description: "A note longer than 500 UTF-16 code units is rejected server-side; a 500-code-unit Thai note is accepted."
    requirement: SUBM-03
    verification:
      - kind: unit
        ref: "test/report.test.js#POST /api/waste-reports/validate accepts a 500-code-unit Thai note"
        status: pass
      - kind: unit
        ref: "test/report.test.js#POST /api/waste-reports/validate rejects a 501-code-unit Thai note"
        status: pass
      - kind: static
        ref: "node -e source assertion: src/routes/report.js contains no Buffer.byteLength"
        status: pass
    human_judgment: false
  - id: D4
    description: "An absent or empty note is accepted; note is optional and never blocks the request."
    requirement: SUBM-03
    verification:
      - kind: unit
        ref: "test/report.test.js#POST /api/waste-reports/validate accepts an absent note"
        status: pass
      - kind: unit
        ref: "test/report.test.js#POST /api/waste-reports/validate accepts an empty-string note"
        status: pass
    human_judgment: false
  - id: D5
    description: "The endpoint persists nothing — no file written, no report stored, no id minted."
    requirement: SUBM-02
    verification:
      - kind: unit
        ref: "test/report.test.js#POST /api/waste-reports/validate persists nothing to disk"
        status: pass
      - kind: static
        ref: "node -e source assertion: src/routes/report.js contains none of waste-reports.json, writeFile, appendFile, randomUUID"
        status: pass
    human_judgment: false
  - id: D6
    description: "While the validate request is in flight, the ถัดไป button is disabled and reads กำลังตรวจสอบ..."
    requirement: SUBM-02
    verification:
      - kind: unit
        ref: "test/report.test.js#public/js/report.js contains the loading, failure and required-field copy"
        status: pass
      - kind: e2e
        ref: "manual: curl-verified endpoint response shape the CTA drives against; the disable/relabel/finally logic itself needs a live browser to observe click-time DOM mutation (see human-check in plan verification block)"
        status: backstop
    human_judgment: true
  - id: D7
    description: "Attempting to proceed with the dropdown placeholder still selected shows the inline message กรุณาเลือกจุดที่แจ้ง below the select and sends no request."
    requirement: SUBM-03
    verification:
      - kind: unit
        ref: "test/report.test.js#the dropdown-mode response contains an empty, hidden inline-error container adjacent to the select"
        status: pass
      - kind: unit
        ref: "test/report.test.js#public/js/report.js contains the loading, failure and required-field copy"
        status: pass
    human_judgment: true
  - id: D8
    description: "A network or server failure on the validate request shows the failure banner while preserving the selected location and typed note, and re-enables the CTA."
    requirement: SUBM-03
    verification:
      - kind: unit
        ref: "test/report.test.js#public/js/report.js never clears the select or note value on any path"
        status: pass
      - kind: unit
        ref: "test/report.test.js#public/js/report.js re-enables the CTA in a finally branch"
        status: pass
      - kind: e2e
        ref: "manual browser + DevTools offline-mode check (plan's <human-check> block) — not run this session, flagged as backstop per plan instructions (both tasks are type=auto, human-check is descriptive UAT guidance, not a checkpoint task)"
        status: backstop
    human_judgment: true
  - id: prohibition-1
    description: "MUST NOT discard, clear, or reset content the user has already entered (location selection, note text) when a validation error or request failure occurs."
    requirement: SUBM-03
    verification:
      - kind: unit
        ref: "test/report.test.js#public/js/report.js never clears the select or note value on any path"
        status: pass
      - kind: static
        ref: "node -e source assertion: no (select|note)*.value = '' assignment anywhere in public/js/report.js"
        status: pass
    human_judgment: false
---

# Phase 1 Plan 6: Server-Side Validate Endpoint and CTA Wiring Summary

**`POST /api/waste-reports/validate` independently re-checks QR signature, registry membership and note length against the values actually submitted (never trusting a prior `GET`), and the `ถัดไป` CTA now drives a real round trip to it with a disabled loading state, an inline required-field message, and a failure banner that never costs the user their typed input.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-08-20
- **Completed:** 2026-08-20
- **Tasks:** 2/2
- **Files modified:** 5 (index.js, src/routes/report.js, views/report.ejs, public/js/report.js, test/report.test.js)

## Accomplishments

- Mounted `express.json({ limit: '64kb' })` in `index.js`, ahead of both routers, so an oversized JSON body is rejected by the parser itself before any handler work runs.
- Added `POST /api/waste-reports/validate` to `src/routes/report.js`: validates `location_id` presence and registry membership, re-runs `verifyLocationSignature` on any submitted `sig` (never trusting the earlier `GET`), and re-checks `note` length in UTF-16 code units. Every failure path returns the exact same Thai message the client already shows for that case. The success verdict returns `{ valid: true, location_id, name }` only — no `lat`/`lng`, no persistence, no id.
- Extended `test/report.test.js` with all 10 `<behavior>` cases from Task 1, driving the endpoint through `supertest`, including a "persists nothing to disk" test that snapshots `fs.readdirSync` on the repo root before/after four different validate calls.
- Added `#validate-banner` (above the CTA) and `#location-inline-error` (below the select, inside the dropdown block) as empty, hidden containers to `views/report.ejs`. Both render in every mode that ships the dropdown block, matching the existing "ship all markup, toggle visibility" pattern from 01-02/01-05.
- Passed the exact `sig` that was just verified for a locked-mode `GET /report` request into the template as `lockedSig`, rendered as `data-location-id`/`data-sig` attributes on `.location-locked` — the CTA reads these instead of re-parsing `window.location`.
- Wired the `#btn-next` click handler in `public/js/report.js`: reads the currently *visible* DOM state (locked block if not hidden, else the select) rather than the server-rendered `mode`, so it stays correct after the `ไม่ใช่จุดนี้` toggle flips locked → dropdown client-side; shows the inline required-field message and returns early with no request when nothing is selected; disables the button and sets the `กำลังตรวจสอบ...` label while the fetch is in flight; shows the server's `error` string on a 400, or the generic network-failure banner on a rejected promise / 5xx; and always restores the button in a single `finally` branch. Every message write uses `textContent`. Neither the select's value nor the note's value is ever touched on an error path.
- Live-verified against a real `node index.js` boot: `curl` confirmed both hidden containers render in the initial HTML, a valid dropdown-path POST returns `{"valid":true,"location_id":"LIB","name":"หอสมุด"}`, and a 501-character Thai note POST returns the exact 400 error message. No `waste-reports.json` or any other new file appeared in the repo after the run.
- `node --test test/report.test.js`: 51/51 passing (up from 31 at the start of this plan).

## Task Commits

Each task was committed atomically:

1. **Task 1: POST /api/waste-reports/validate — independent server-side re-verification** - `90dc87a` (feat)
2. **Task 2: CTA wiring — loading, inline error, and a failure banner that keeps the user's work** - `c5fc5ec` (feat)

## Files Created/Modified

- `index.js` - mounted `express.json({ limit: '64kb' })` ahead of both routers
- `src/routes/report.js` - added `POST /api/waste-reports/validate`; locked-mode `GET /report` now also passes `lockedSig` to the template
- `views/report.ejs` - added `#validate-banner` and `#location-inline-error` hidden containers; `.location-locked` now carries `data-location-id`/`data-sig`
- `public/js/report.js` - added the `#btn-next` submit handler (required-field check, loading state, fetch, error/failure banners, `finally` re-enable)
- `test/report.test.js` - grew from 31 to 51 `node:test` cases; one 01-05 test rescoped (see Decisions)

## Decisions Made

- **`lockedSig` threaded through the template rather than re-deriving it client-side** — the server already verified this exact `sig` value for this exact request; reusing it (instead of, say, re-signing client-side or parsing the URL) is both simpler and matches the plan's explicit instruction to avoid re-parsing `window.location`.
- **Rescoped the 01-05 "no fetch" test to the toggle handler only** — D2 from 01-05 SUMMARY.md ("the ไม่ใช่จุดนี้ control performs zero network requests") was originally enforced with a file-wide ban on `fetch(`. This plan legitimately adds a `fetch()` call elsewhere in the same file for the CTA's validate POST, so the old assertion would now fail for a reason unrelated to what it was actually protecting. The test was narrowed to check only the `btnNotThis.addEventListener` handler body's source text, preserving the original guarantee exactly, and a second test still bans `XMLHttpRequest`/dynamic `import(` file-wide (neither is legitimately needed anywhere in this file). This is a Rule 1 fix (existing test's assertion no longer matches its own stated intent given new, in-scope behavior) — not a new capability.
- **CTA reads live DOM visibility, not the server-rendered `mode`** — after the `ไม่ใช่จุดนี้` toggle runs, `body[data-mode]` is updated client-side (01-05), but re-reading that attribute duplicates state already implied by which block is hidden. Checking `locationLocked.classList.contains('is-hidden')` directly is the single source of truth and needs no synchronization with the toggle handler.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test now over-broad given legitimate new behavior] Rescoped the 01-05 fetch-ban test**
- **Found during:** Task 2, after wiring the CTA's `fetch()` call
- **Issue:** `test/report.test.js`'s existing "report.js contains no fetch, XMLHttpRequest or dynamic import" test (from 01-05) banned any `fetch(` call anywhere in `public/js/report.js`. This plan's Task 2 explicitly requires calling `fetch()` to POST to the validate endpoint, so the old assertion would fail as written even though nothing about D2's actual guarantee (the toggle control performs zero network requests) had changed.
- **Fix:** Split the test in two: one scoped to the `btnNotThis.addEventListener` handler's own body (still bans `fetch`/`XMLHttpRequest`/`import(` there), and one file-wide test that continues to ban `XMLHttpRequest`/dynamic `import(` (neither is needed anywhere in this file).
- **Files modified:** `test/report.test.js`
- **Commit:** `c5fc5ec`

No other deviations — both tasks otherwise executed exactly as written.

## Issues Encountered

None. Both tasks passed `node --test` and their source-assertion verify scripts on the first implementation pass; a live `node index.js` boot + `curl` round trip confirmed the endpoint and markup behave as specified with no persisted side effects.

## User Setup Required

None — no external service configuration required. `QR_SIGNING_SECRET` was already required and set from prior plans.

## Known Stubs

None. Both the validate endpoint and the CTA handler are fully wired: real signature/registry re-verification, real note-length re-check, real fetch-driven loading/error/failure states, no placeholder logic.

## Threat Flags

None beyond what this plan's own `<threat_model>` already covers (T-01-19 through T-01-22, T-01-04, T-01-10, T-01-05) — every mitigation listed there was implemented exactly as specified: `verifyLocationSignature` re-run independently on the POST path (source-asserted ≥2 occurrences), UTF-16 code-unit note length re-check with `Buffer.byteLength` banned by source assertion, `textContent`-only message writes with `innerHTML` banned by source assertion, `express.json({ limit: '64kb' })`, and a success payload excluding `lat`/`lng`.

## Next Phase Readiness

- SUBM-02 and SUBM-03 now have genuine server-side enforcement independent of any prior render — a curl request bypassing the browser entirely gets exactly the same verdicts a real client would.
- The Walking Skeleton's "one real UI interaction wired to the API" contract is satisfied: the CTA performs a real `fetch` round trip to a real endpoint with real validation logic on both sides.
- `POST /api/waste-reports/validate` is a stable, narrow JSON contract Phase 3 can extend into a persisting submit endpoint, or continue using as a cheap pre-check ahead of Phase 2's more expensive multipart photo upload.
- The plan's `<human-check>` block (manual browser + DevTools offline-mode verification of the loading/disabled state and the failure-banner preserve-input behavior) was not run this session — both tasks are `type="auto"` and the note in the execution prompt confirmed this is descriptive UAT guidance, not a blocking checkpoint. Flagged as `backstop` in the coverage table above (D6, D8) for later human/UAT review, consistent with 01-UI-SPEC.md's own `backstop` classification for this exact interaction.
- No blockers for Phase 1's remaining plan (01-07, FCP/responsive verification).

---
*Phase: 01-location-submission-entry*
*Completed: 2026-08-20*
