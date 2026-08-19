---
phase: 1
slug: location-submission-entry
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-19
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (built-in) + `supertest@^7.2.2` |
| **Config file** | none — `node:test` needs no config file; test command is a glob passed to `node --test` |
| **Quick run command** | `node --test test/report.test.js` |
| **Full suite command** | `node --test` (discovers all `*.test.js` under `test/` by default) |
| **Estimated runtime** | ~5 seconds (no browser involved) |

`[VERIFIED: direct Node v24.18.0 execution, this session]` — a trivial `node:test` file was written and executed against this exact toolchain and passed, confirming the built-in runner works with zero additional setup on this project's Node version.

---

## Sampling Rate

- **After every task commit:** Run `node --test test/report.test.js`
- **After every plan wave:** Run `node --test` (full suite)
- **Before `/gsd:verify-work`:** Full suite must be green, plus the two manual-only SUBM-04 checks below
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

| Req ID | Behavior | Test Type | Automated Command | File Exists | Status |
|--------|----------|-----------|-------------------|-------------|--------|
| SUBM-01 | `GET /report` (no params) renders dropdown with all 5 seed locations, no free-text field present | unit/integration | `node --test test/report.test.js` (supertest: assert response contains `<select` and all 5 location names, and does NOT contain a free-text address `<input>`) | ❌ W0 | ⬜ pending |
| SUBM-01 | `GET /report?location_id=X&sig=<valid>` renders locked state with correct location name | integration | `node --test test/report.test.js` (supertest, using a real signed URL generated via `qrSignature.signLocationId`) | ❌ W0 | ⬜ pending |
| SUBM-02 | `GET /report?location_id=<unregistered>&sig=<anything>` returns HTTP 400 with the exact SPEC error message | integration | `node --test test/report.test.js` (assert status 400, body contains "ไม่พบจุดนี้ในระบบ") | ❌ W0 | ⬜ pending |
| SUBM-02 | `GET /report?location_id=<registered>&sig=<tampered>` (valid id, forged signature) also returns 400 | integration | `node --test test/report.test.js` (additional case, same file) | ❌ W0 | ⬜ pending |
| SUBM-03 | Rendered `<textarea>` has `maxlength="500"` | integration (HTML string-match, no browser needed) | `node --test test/report.test.js` | ❌ W0 | ⬜ pending |
| SUBM-03 | (if a server-side validate endpoint exists) a 501-character note is rejected using `.length` not byte-length (Thai test string required — see Thai byte-length pitfall) | integration | `node --test test/report.test.js` | ❌ W0 | ⬜ pending |
| SUBM-04 | FCP ≤2s measured against a throttled "4G" profile | **manual-only** — no browser paint-timing engine inside `node:test` | `npx lighthouse http://localhost:3000/report --only-categories=performance --output=json` | N/A | ⬜ pending |
| SUBM-04 | Correct rendering at 375px/768px/1024px | **manual-only** — visual/layout correctness needs a real or headless browser, no infra yet | Browser DevTools device toolbar at the three widths | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/report.test.js` — stubs covering SUBM-01/02/03 per the table above
- [ ] Shared test setup helper that signs a valid `sig` for a given test `location_id`, reusing `src/services/qrSignature.js`
- [ ] `npm install --save-dev supertest@^7.2.2` (`node:test` itself is built-in, no install needed)
- [ ] No `test/` directory exists yet in this repo — this is a from-scratch Wave 0, not an extension of existing tests

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|--------------------|
| First Contentful Paint ≤2s on simulated 4G | SUBM-04 | No browser paint-timing engine inside `node:test`; Lighthouse is a scripted CLI check, not part of the automated test suite (flagged `SUS`/too-new by the package-legitimacy gate — very likely a false positive for a 14-year-old Google-org package, but still routed through `checkpoint:human-verify` per protocol) | Run `npx lighthouse http://localhost:3000/report --only-categories=performance --output=json` (default throttling simulates 4G + 4x CPU slowdown) and confirm FCP ≤2000ms |
| Correct responsive rendering at 375px/768px/1024px | SUBM-04 | Visual/layout correctness is not meaningfully unit-testable without a real or headless browser and visual assertions; this project has no such infrastructure yet | Open the form in Chrome DevTools device toolbar (or resize the window) at 375px, 768px, and 1024px; confirm no horizontal overflow and all controls remain usable |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
