---
phase: 01-location-submission-entry
plan: 07
subsystem: web-frontend
tags: [lighthouse, fcp, performance, responsive, css, cdp, headless-browser]

# Dependency graph
requires:
  - phase: 01-03
    provides: "public/css/report.css zero-external-request stylesheet; views/report.ejs three-state template"
  - phase: 01-06
    provides: "public/js/report.js CTA validate wiring; #validate-banner error banner element"
provides:
  - ".planning/phases/01-location-submission-entry/01-FCP-REPORT.md — recorded, reproducible FCP and responsive-correctness evidence for SUBM-04"
  - "public/css/report.css .is-hidden { display: none !important; } — a utility hide class that now reliably wins over any component rule, including ID selectors"
  - "package.json \"start\": \"node index.js\" script"
affects: []

# Actuals (#2632)
actuals:
  tokens: 3100
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "npx lighthouse invoked ephemerally with CHROME_PATH pointed at an installed Chromium-based browser (Edge, since Chrome itself is not installed on this machine) — no lighthouse devDependency added, package.json byte-diffed before/after to prove it"
    - "Lighthouse's --ignore-status-code flag used for the one render state (error, HTTP 400) whose non-2xx top-level navigation status would otherwise abort gathering entirely (ERRORED_DOCUMENT_REQUEST) — does not change what is measured, only stops Lighthouse from refusing to measure it"
    - "Ad hoc Chrome DevTools Protocol driver (Node's built-in WebSocket + fetch, zero new dependency) used to set Emulation.setDeviceMetricsOverride per width, read scrollWidth/clientWidth/innerWidth and the .form-card bounding box, and capture a screenshot per state/width combination — script was ephemeral and deleted after use, not committed"
    - ".is-hidden must be display:none !important, since any future component rule using an ID selector (like #validate-banner) will otherwise outrank a plain class-based hide rule regardless of source order"

key-files:
  created:
    - .planning/phases/01-location-submission-entry/01-FCP-REPORT.md
  modified:
    - package.json
    - public/css/report.css

key-decisions:
  - "Used Microsoft Edge (Chromium-based, CHROME_PATH env var) instead of Google Chrome for all Lighthouse runs, since Chrome is not installed on this machine — Lighthouse documents CHROME_PATH as accepting any Chromium >=66 binary, and Edge shares Chrome's Blink rendering/paint engine, so the FCP numbers are equivalent to a genuine Chrome run. Recorded explicitly in the report rather than silently substituted."
  - "Added a 'start': 'node index.js' script to package.json (Rule 3 blocking-issue auto-fix) — the plan's action explicitly instructs starting the app with 'npm start', and no such script existed yet."
  - "Error-state Lighthouse run required --ignore-status-code because Lighthouse hard-codes a refusal to score any top-level navigation with an HTTP status >=400 (ERRORED_DOCUMENT_REQUEST), and the error state deliberately returns 400 per SUBM-02. This is standard, documented Lighthouse CLI behavior, not an environment workaround."
  - "Found and fixed a real CSS specificity bug during responsive verification: #validate-banner rendered as a visible empty red-bordered box on every page load despite carrying the is-hidden class, because the ID selector in '.error-banner, #validate-banner' (specificity 1,0,0) always outranks .is-hidden's class selector (0,1,0) regardless of source order. Fixed by making .is-hidden use !important — a deliberate, documented exception, since this is exactly the class of bug a utility hide class exists to prevent."

requirements-completed: [SUBM-04]

coverage:
  - id: "SUBM-04 FCP"
    description: "First Contentful Paint is at most 2000ms under Lighthouse's default simulated-4G throttling profile, measured and recorded reproducibly for all three render states."
    requirement: SUBM-04
    verification:
      - kind: manual-scripted
        ref: "01-FCP-REPORT.md — First Contentful Paint (Task 2) table: dropdown 765.22ms, locked 761.98ms, error 958.31ms, all PASS"
        status: pass
  - id: "SUBM-04 responsive"
    description: "The form renders correctly with no horizontal overflow at 375px, 768px and 1024px, in all three render states."
    requirement: SUBM-04
    verification:
      - kind: automated
        ref: "public/css/report.css source assertions — exactly two min-width media queries (768px/1024px), 480px card ceiling, 44px minimum control height"
        status: pass
      - kind: manual-scripted
        ref: "01-FCP-REPORT.md — Per-state, per-width results (post-fix): 9/9 pass, scrollWidth === clientWidth === innerWidth at every combination, all 9 screenshots visually inspected"
        status: pass
  - id: "single-origin"
    description: "The page loads with zero third-party origins in the network waterfall."
    requirement: SUBM-04
    verification:
      - kind: manual-scripted
        ref: "01-FCP-REPORT.md — origins-in-waterfall column, all three states report exactly {\"http://localhost:3000\"}"
        status: pass
  - id: "no-lighthouse-dependency"
    description: "Lighthouse is never added to the project's dependency tree."
    requirement: SUBM-04
    verification:
      - kind: automated
        ref: "node -e \"...'lighthouse' in all...\" — false, and package.json byte-diffed before/after every npx invocation"
        status: pass

open-questions: []
---

# Phase 1 Plan 07: FCP & Responsive Verification Summary

Measured and recorded the two manual-only halves of SUBM-04 — First Contentful Paint under a simulated 4G profile, and responsive correctness at 375px/768px/1024px — for all three render states of `GET /report` (dropdown, locked, error), and fixed a real CSS visibility bug discovered along the way.

## What Was Built

**Task 1 (checkpoint, prior session):** Human verified `lighthouse` is the genuine Google-maintained package before its first invocation. Approved.

**Task 2 — First Contentful Paint measurement:** Started the app (`npm start`, after adding the missing `start` script), polled readiness with a Node `fetch` loop, generated a signed locked-state URL via `scripts/generate-qr.js`, and ran `npx lighthouse` against all three render states with `CHROME_PATH` pointed at the installed Microsoft Edge (Chrome itself is not installed on this machine — Edge is Chromium-based and shares the same Blink engine, so the measurement is equivalent). Used Lighthouse's default `simulate` throttling (150ms RTT, ~1.6Mbps throughput, 4x CPU slowdown, mobile form factor) exactly as instructed, with no custom throttling config. All three states passed the 2000ms budget with wide margin: dropdown 765.22ms, locked 761.98ms, error 958.31ms (the error state needed `--ignore-status-code` since Lighthouse otherwise refuses to score a non-2xx top-level navigation). Confirmed every state's network waterfall contains exactly one origin (`http://localhost:3000`), and confirmed `package.json` was byte-identical before and after all three `npx lighthouse` runs apart from the intentional `start`-script addition — no `lighthouse` dependency was left behind.

**Task 3 — Responsive correctness at 375px/768px/1024px:** Ran the stylesheet source assertions (two `min-width` media queries at 768px/1024px, 480px card ceiling, 44px minimum control height) — all pass. Built a small ephemeral Chrome DevTools Protocol driver using only Node's built-in `WebSocket` and `fetch` (no new npm dependency) to drive the same headless Edge instance, setting device-metrics overrides per width and capturing both numeric layout metrics (`scrollWidth`/`clientWidth`/`innerWidth`/`.form-card` bounding box) and a screenshot for all 9 state×width combinations. While capturing the first screenshot, discovered `#validate-banner` was rendering as a visible, empty, red-bordered box on every page load despite carrying the `is-hidden` class — a genuine CSS specificity bug (an ID selector in `.error-banner, #validate-banner` outranks `.is-hidden`'s class selector regardless of source order). Fixed by making `.is-hidden` use `display: none !important`, re-verified `node --test` (56/56 unchanged) and the stylesheet source assertions, then re-captured all 9 screenshots and visually confirmed every one: no horizontal overflow anywhere, correct 343px full-width card at 375px and 480px centred card at 768px/1024px, correct Thai glyph rendering, no phantom banner.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Added missing `start` npm script**
- **Found during:** Task 2, first attempt to run `npm start`
- **Issue:** `package.json` had no `"start"` script; `npm start` failed immediately with `npm error Missing script: "start"`, blocking any measurement
- **Fix:** Added `"start": "node index.js"` to `package.json`'s `scripts` block, matching the existing `main`/`require.main === module` entry point
- **Files modified:** `package.json`
- **Commit:** `e0674f6`

**2. [Rule 1 - Bug] Fixed `#validate-banner`/`#location-inline-error` visible despite `is-hidden`**
- **Found during:** Task 3, while capturing the first responsive screenshot
- **Issue:** `public/css/report.css` declared `.error-banner, #validate-banner { display: flex; ... }`. The `#validate-banner` ID selector (specificity `1,0,0`) always outranks `.is-hidden`'s class selector (`display: none`, specificity `0,1,0`) regardless of source order, so the banner rendered as a visible empty red-bordered box on every page load in every state. `#location-inline-error` had the same underlying cause (tied class-specificity resolved by source order) but produced no visible artifact since it has no border/background.
- **Fix:** `public/css/report.css`'s `.is-hidden` rule now uses `display: none !important;`, with a code comment explaining the deliberate exception
- **Files modified:** `public/css/report.css`
- **Commit:** `b719316`

### Environment substitutions (documented, not silent)

- **Chrome unavailable, Edge used instead:** No Google Chrome install exists on this machine; Microsoft Edge (Chromium-based, `CHROME_PATH` env var) was used for every `npx lighthouse` and CDP-driven screenshot capture. Recorded explicitly in `01-FCP-REPORT.md`'s "Environment note" section rather than silently substituted or fabricated.
- **`--ignore-status-code` added for the error-state Lighthouse run only:** Standard, documented Lighthouse CLI flag; needed because Lighthouse refuses to gather metrics for any top-level navigation returning HTTP >=400, and the error state deliberately returns 400 per SUBM-02.

## Auth Gates

None encountered.

## Known Stubs

None. The FCP report is a real measurement record backed by three genuine Lighthouse JSON reports and nine genuine CDP-driven screenshots; no placeholder or fabricated figures were recorded.

## Threat Flags

None. This plan's threat register items (T-01-SC package-legitimacy gate, T-01-12 origin-count check, T-01-23 artifact-outside-repo) were all satisfied exactly as designed — no new surface introduced.

## Self-Check: PASSED

- `E:/Coolindy/smart-waste-reports/.planning/phases/01-location-submission-entry/01-FCP-REPORT.md` — FOUND
- `E:/Coolindy/smart-waste-reports/package.json` (`start` script) — FOUND
- `E:/Coolindy/smart-waste-reports/public/css/report.css` (`.is-hidden { display: none !important; }`) — FOUND
- Commit `e0674f6` — FOUND in `git log`
- Commit `b719316` — FOUND in `git log`
- `node --test` — 56/56 passing
- `package.json` — no `lighthouse` entry in `dependencies` or `devDependencies`
- No Lighthouse JSON or screenshot artifacts left in the repository (all written to and deleted from the OS temp directory)
