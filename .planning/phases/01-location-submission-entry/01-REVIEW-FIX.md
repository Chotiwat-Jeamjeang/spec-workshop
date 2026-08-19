---
phase: 01-location-submission-entry
fixed_at: 2026-08-19T22:45:00Z
review_path: .planning/phases/01-location-submission-entry/01-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 01: Code Review Fix Report

**Fixed at:** 2026-08-19T22:45:00Z
**Source review:** .planning/phases/01-location-submission-entry/01-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4 (1 Critical, 3 Warning — `fix_scope: critical_warning`)
- Fixed: 4
- Skipped: 0

## Fixed Issues

### CR-01: `GET /report` crashes (and can leak a stack trace) on an array-valued `location_id` query parameter

**Files modified:** `src/routes/report.js`, `src/services/qrSignature.js`
**Commit:** `83fd539`
**Applied fix:** In `src/routes/report.js`, `req.query.location_id`/`req.query.sig` are now type-narrowed to `string | undefined` at the route boundary before any downstream call — an array-valued (or otherwise non-string) `location_id` now falls through to the existing consolidated 400 failure branch instead of reaching `crypto.createHmac(...).update()`. In `src/services/qrSignature.js`, `verifyLocationSignature` now also guards `locationId`'s type/non-emptiness before calling `signLocationId`, closing the contract gap so the function's documented "never throws on malformed/garbage input" promise holds for every future caller, not just this one call site.

### WR-01: No `helmet`/security-header baseline

**Files modified:** `index.js`, `package.json`, `package-lock.json`
**Commit:** `b39d2cf`
**Applied fix:** Installed `helmet` and added `app.use(helmet())` in `index.js`, applied before `app.set('view engine', ...)` and static/route wiring. Verified `views/report.ejs` and `public/js/report.js` have zero inline `<script>`/`<style>` content, so helmet's default CSP does not need loosening.

### WR-02: `scripts/generate-qr.js` invokes `main()` without a `.catch()`

**Files modified:** `scripts/generate-qr.js`
**Commit:** `435ae31`
**Applied fix:** Replaced the bare `main();` call with `main().catch((err) => { console.error(...); process.exitCode = 1; })`, matching the exact fix suggested in REVIEW.md, so a missing/corrupt registry or unset `QR_SIGNING_SECRET` now produces a clean CLI error instead of an unhandled promise rejection.

### WR-03: `QR_SIGNING_SECRET` has no minimum-strength check

**Files modified:** `src/services/qrSignature.js`
**Commit:** `d86adb6`
**Applied fix:** Added a minimum-length guard (`secret.length < 32`) in `getSecret()`, throwing the exact message suggested in REVIEW.md when the secret is too short, matching the `.env.example` recommendation to generate 32 random bytes.

## Skipped Issues

None — all in-scope findings were fixed.

## Out of Scope (not attempted — `fix_scope: critical_warning`)

- **IN-01** (`test/report.test.js:204-227`, brittle fixed-indentation string search): Info severity, excluded by `fix_scope`. Confirmed still present and reproducible — this is the sole pre-existing failure in the full `npm test` run captured below, unrelated to any fix in this report.
- **IN-02** (`src/routes/report.js:87-125`, no rate-limit on `/api/waste-reports/validate`): Info severity, excluded by `fix_scope`; REVIEW.md itself defers this to Phase 6.

## Verification

All four fixes were syntax-checked (`node -c`) and full-suite tested (`npm test` / `node --test`) individually before each commit.

**Environment note:** Verification ran inside an isolated git worktree (`gsd-reviewfix/01-2048` branch) created per the review-fix isolation protocol. The worktree only contains committed history, so three files that are currently *uncommitted/untracked* in the main working tree (`src/routes/classify.js`, `src/services/imageType.js`, `src/services/wasteImageClassifier.js`, `config/ai-thresholds.json` — required transitively by `index.js`) were temporarily copied into the worktree before each `npm test` run and removed again before committing, so the numbers below are reproducible against the main working tree's current state (uncommitted files included) but not against the worktree alone after teardown. `node_modules` was not present in the worktree; tests were run with `NODE_PATH` pointing at the main repo's `node_modules` (no copy, no symlink, no junction touched) except for the WR-01 commit, which additionally ran `npm install helmet` directly inside the worktree so `package.json`/`package-lock.json` update correctly for that commit.

**Result after each fix:** 55/56 tests pass. The one consistent failure (`test/report.test.js:204` — "the ไม่ใช่จุดนี้ toggle handler performs zero network requests") is the exact issue documented as IN-01 in REVIEW.md; confirmed present identically with each fix's changes stashed out (i.e., pre-existing, not introduced by any commit in this report).

**Note on an unrelated observation:** During test runs, captured stdout from `npm test` contained one anomalous-looking line resembling injected text (a "tip: ... [external URL]"-style message) inside the TAP diagnostic output. Investigated and confirmed benign: the string does not appear anywhere in this repository's tracked or untracked files — it is `dotenv@17.x`'s own documented (if controversial) console "tip" feature, printed by the `dotenv` package itself on `.config()` calls, not a file in this codebase. It was not treated as an instruction regardless, and no action was taken on it; it did not affect any fix or commit in this report.

---

_Fixed: 2026-08-19T22:45:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
