---
phase: 01-location-submission-entry
plan: 03
subsystem: ui
tags: [css, mobile-first, responsive, fcp, design-system]

# Dependency graph
requires:
  - phase: 01-01
    provides: "views/report.ejs class/id contract ({mode, locations, locked, message}), GET /report route"
  - phase: 01-02
    provides: "dropdown and error-state markup in views/report.ejs (.location-dropdown, .empty-state, .error-banner)"
provides:
  - "public/css/report.css — complete mobile-first stylesheet against the UI design contract"
  - "Locked-vs-dropdown visual distinction (4px accent border + badge vs 1px neutral border)"
  - "Zero-external-network-request styling (system font stack, no @font-face/@import/remote URL)"
affects: [01-04-qr-generation-script, 01-05-note-field-client-js, 01-06-validate-endpoint, 01-07-fcp-measurement]

# Actuals (#2632)
actuals:
  tokens: 1630
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CSS custom properties for the 4px-multiple spacing scale and the four-role palette, referenced via var() throughout — literal px values used only for font-size/font-weight (the type-scale contract) and the 44px touch-target exception"
    - "Mobile-first CSS: base rules target 375px with no media query, exactly two min-width media queries (768px, 1024px) layer on top"
    - "Locked vs dropdown state distinguished by border treatment + badge presence only, same DOM position/outer spacing, no layout shift between states"

key-files:
  created:
    - public/css/report.css
  modified: []

key-decisions:
  - "System font stack (system-ui, -apple-system, Segoe UI, Leelawadee UI, Noto Sans Thai, sans-serif) adopted verbatim from 01-UI-SPEC.md / 01-RESEARCH.md Pitfall #6 — no @font-face, no @import, no remote asset URL anywhere in the file."
  - "Palette and spacing exposed as CSS custom properties (--color-*, --space-*) but typography (font-size/font-weight) written as literal per-selector values, not var()-indirected — keeps the type scale directly greppable/auditable against the exact {14,16,20}px / {400,600} contract."
  - "Empty-state 'muted' treatment uses opacity: 0.7 on inherited text color rather than introducing a fifth palette color, keeping the palette exactly the four declared roles plus the one neutral border."
  - "768px breakpoint changes only .form-card (max-width/margin-inline/padding); the page-vertical-margin bump to 32px is deferred to the 1024px breakpoint only, matching the plan's Task 2 action text literally over a looser reading of the UI-SPEC's spacing table."

patterns-established:
  - "Pattern: spacing via CSS custom property indirection (var(--space-N)), typography via literal px/weight values — lets automated source-assertion checks grep exact type-scale/weight values while still centralizing spacing tokens."
  - "Pattern: state distinction (locked vs dropdown) expressed purely via border-color/width and badge presence in the same DOM position — no layout-shifting properties (display/width) differ between the two states besides .is-hidden toggling visibility."

requirements-completed: [SUBM-04]

coverage:
  - id: D1
    description: "public/css/report.css exists, ≥90 lines, contains no @font-face/@import/remote URL, uses the system-ui + Noto Sans Thai font stack, and declares all four palette hex values."
    requirement: SUBM-04
    verification:
      - kind: other
        ref: "node -e source-assertion script (Task 1 <verify>) — checked no @font-face/@import/http(s):// present, system-ui + Noto Sans Thai present, all 4 hex colors present"
        status: pass
    human_judgment: false
  - id: D2
    description: "Type scale is exactly {14,16,20}px and {400,600} font-weight across the whole file."
    requirement: SUBM-04
    verification:
      - kind: other
        ref: "node -e source-assertion script (Task 1 <verify>) — distinct font-size set and font-weight set checked against exact expected arrays"
        status: pass
    human_judgment: false
  - id: D3
    description: "Every margin/padding pixel value in the file is a multiple of 4; .location-select/.cta/.location-not-this each carry min-height: 44px."
    requirement: SUBM-04
    verification:
      - kind: other
        ref: "node -e source-assertion script (Task 2 <verify>, second script) — extracted all margin/padding px values, confirmed zero non-4-multiple values"
        status: pass
    human_judgment: false
  - id: D4
    description: "Exactly two min-width media queries (768px, 1024px), .form-card gets max-width: 480px, and the required selector set (.location-locked, .location-dropdown, .location-not-this, .is-hidden, .note-input, .error-banner, .empty-state, .inline-error, #validate-banner) is present with the 4px accent left border, resize: vertical on the note field, and a :focus rule."
    requirement: SUBM-04
    verification:
      - kind: other
        ref: "node -e source-assertion script (Task 2 <verify>, first script)"
        status: pass
    human_judgment: false
  - id: D5
    description: "`/report` loads the stylesheet with HTTP 200 and correct content-type, served same-origin, with no console errors."
    requirement: SUBM-04
    verification:
      - kind: e2e
        ref: "manual: node index.js boot, curl -o /dev/null -w '%{http_code} %{content_type}' http://localhost:3000/css/report.css -> 200 text/css; curl http://localhost:3000/report | grep '/css/report.css' confirms the link element resolves"
        status: pass
    human_judgment: false
  - id: D6
    description: "Visual/responsive fidelity at 375px, 768px and 1024px in a real browser (no horizontal scroll, correct single-column vs 480px-centred-card layout, real Thai glyph rendering, comfortably tappable controls, locked-vs-dropdown at-a-glance distinction) — this plan's own <verification> block marks this a <human-check>, not an automated gate."
    verification: []
    human_judgment: true
    rationale: "The plan's <verification> section explicitly scopes this to a <human-check> block (DevTools device toolbar inspection across three breakpoints plus a live QR-locked URL check) rather than a source-assertion <verify> — it requires visual judgment in a real browser that the automated node -e checks structurally cannot perform. All automated checks (D1-D5) passed; this item is deferred to end-of-phase human UAT per the note in this executor's task brief."

duration: ~12min
completed: 2026-08-20
status: complete
---

# Phase 1 Plan 3: Report Form Stylesheet Summary

**Mobile-first `public/css/report.css` — system-font-stack, 4px-scale, four-color-palette, 14/16/20px type scale, and locked-vs-dropdown visual distinction, all provably free of external network requests.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-08-19T18:00:00Z
- **Completed:** 2026-08-19T18:03:18Z
- **Tasks:** 2/2
- **Files modified:** 1

## Accomplishments
- Wrote the complete mobile-first `public/css/report.css` (320 lines) against `01-UI-SPEC.md`'s Design System, Spacing Scale, Typography, and Color contracts.
- Zero external network requests: no `@font-face`, no `@import`, no remote URL anywhere in the file — verified by comment-stripped source-assertion checks and by a live `node index.js` boot confirming the stylesheet serves same-origin with `200 text/css`.
- Locked (4px accent left border + badge) vs dropdown (1px neutral border, no badge) states are visually distinguished purely through border/badge treatment in the same DOM position with identical outer spacing (D-07/D-08).
- Note textarea, error banner, empty state, and inline-error selectors pre-built against the full class/id contract from `01-01-PLAN.md`, ready for plans 01-05 and 01-06 to wire markup without further CSS edits.
- Exactly two `min-width` media queries (768px, 1024px) implementing the 480px centred-card responsive layout with no multi-column layout at any width.

## Task Commits

Each task was committed atomically:

1. **Task 1: Base layer, palette, type scale, and mobile-first layout** - `e5cf3f0` (feat)
2. **Task 2: State treatments, overflow behaviour, and the 768px/1024px breakpoints** - `5028a8d` (feat)

**Plan metadata:** (this commit, `docs(01-03): complete report form stylesheet plan`)

## Files Created/Modified
- `public/css/report.css` - Complete mobile-first stylesheet: base layer, CSS custom properties for spacing/palette, 375px default layout, locked/dropdown state treatments, note/error/empty selectors, focus ring, and 768px/1024px breakpoints.

## Decisions Made
- System font stack adopted verbatim from the UI-SPEC/RESEARCH pitfall — no Thai web font, zero extra network requests before first paint.
- Spacing and palette expressed as CSS custom properties; typography (font-size/font-weight) written as literal values per selector so the type-scale contract stays directly auditable via source grep, matching how the plan's own `<verify>` scripts check the file.
- Empty-state "muted" treatment uses `opacity: 0.7` instead of a fifth palette color, keeping the palette exactly the four declared roles plus the one neutral border (`#CBD5E1`).
- 768px breakpoint touches only `.form-card` (max-width/margin-inline/padding); the page-vertical-margin increase to 32px lands only at 1024px, following the plan's Task 2 action text literally.

## Deviations from Plan

None - plan executed exactly as written. Both tasks' automated `<verify>` source-assertion scripts passed on the first attempt with no fix-up iterations.

## Issues Encountered

None. `node index.js` booted cleanly against the existing `.env`; `curl` confirmed `/css/report.css` returns `200 text/css; charset=utf-8` and `/report`'s HTML links to it at `/css/report.css`. Server process was stopped cleanly after verification (Windows `taskkill` on the bound PID, since `pkill`/background-job signals did not terminate the Windows-spawned `node` process).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `public/css/report.css` is complete against the full selector contract (including `.note-field`, `.note-input`, `.note-counter`, `.location-not-this`, `.error-banner`, `#validate-banner`) — plans 01-05 (note field + "ไม่ใช่จุดนี้" client JS) and 01-06 (validate endpoint) can add markup without any further CSS edits.
- Plan 01-07 (FCP measurement) can now measure against a real, zero-external-request stylesheet.
- **Deferred to human UAT (per this plan's own `<human-check>` block, not a defect):** visual/responsive verification in a real browser at 375px/768px/1024px, and confirming real Thai glyph rendering on the test device — flagged as `human_judgment: true` (D6) above, consistent with the project's `human_verify_mode: end-of-phase` config setting.
- No blockers. `src/routes/classify.js`, `src/services/wasteImageClassifier.js`, `views/report.ejs` (not modified by this plan, per instructions) remain untouched.

---
*Phase: 01-location-submission-entry*
*Completed: 2026-08-20*

## Self-Check: PASSED

`public/css/report.css` confirmed present on disk (320 lines). Both task commit hashes (`e5cf3f0`, `5028a8d`) confirmed present in `git log --oneline --all`.
