---
phase: 2
slug: photo-upload-face-blur-ai-classification
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-20
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (built-in) + `supertest@^7.2.2` — both already installed and established in Phase 1 |
| **Config file** | none — same as Phase 1 |
| **Quick run command** | `node --test test/classify.test.js` |
| **Full suite command** | `node --test` (discovers all `*.test.js` under `test/`) |
| **Estimated runtime** | ~2-5 seconds (mocked/fixture-based, no live Claude API calls in the default run) |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/classify.test.js`
- **After every plan wave:** Run `node --test` (full suite, including Phase 1's existing tests)
- **Before `/gsd:verify-work`:** Full suite green, plus the manual UAT pass for small/partial/background face photos
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

| Req ID | Behavior | Test Type | Automated Command | File Exists | Status |
|--------|----------|-----------|-------------------|-------------|--------|
| PHOTO-01 | Rejects a file whose magic bytes don't match an allowed image type, even with a spoofed `.jpg` extension/`Content-Type` | unit/integration | `node --test test/classify.test.js` (supertest: POST a text file renamed `.jpg`, assert 400) | ❌ W0 | ⬜ pending |
| PHOTO-01 | Rejects a file over 5MB | integration | same file (oversized buffer) | ❌ W0 | ⬜ pending |
| PHOTO-01 | Accepts each of .jpg/.jpeg/.png/.webp | integration | same file, table-driven case per format | ❌ W0 | ⬜ pending |
| PHOTO-02 | The persisted file never byte-matches the raw uploaded buffer when a face was present in a known test fixture | integration | `node --test test/classify.test.js`, using a fixture image with a detectable face | ❌ W0 — needs a face test fixture (does not exist yet) | ⬜ pending |
| PHOTO-02 | The raw uploaded buffer is never written to disk under any code path | unit (source-level assertion) | `node --test test/classify.test.js` | ❌ W0 | ⬜ pending |
| AI-01 | Response includes `wasteType` immediately, synchronously with the classify response | integration | same file | ❌ W0 | ⬜ pending |
| AI-02 | `deriveUrgency()`'s three-tier threshold behavior against `config/ai-thresholds.json`'s actual values | unit — pure function | `node --test test/classify.test.js` | ❌ W0 (function exists, `src/services/wasteImageClassifier.js:37-45`, never unit-tested) | ⬜ pending |
| AI-02 (new) | `aggregateUrgency()` returns max severity across classified photos, ignoring unclassified ones; returns `unclassified` only when all inputs are unclassified | unit — pure function | `node --test test/classify.test.js` | ❌ W0 (new function, Pattern 4) | ⬜ pending |
| AI-03 | A classify response with `wasteType: 'unclassified'` still returns HTTP 200 (does not block) | integration — automated via a mocked/stubbed classify function; the "real AI genuinely can't classify" case is manual-only (non-deterministic against the live model) | `node --test test/classify.test.js` | ❌ W0 | ⬜ pending |
| PHOTO-02 / AI-03 | A genuine Anthropic API/network failure (mocked SDK rejection) returns a non-2xx status, distinct from an `unclassified` 200 | integration | `node --test test/classify.test.js`, mocking `client.messages.create` to reject | ❌ W0 — regression test for the D-08 fix | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/classify.test.js` — covers PHOTO-01/PHOTO-02/AI-01/AI-02/AI-03 per the table above, using mocked Anthropic responses for deterministic cases
- [ ] A test fixture image containing a detectable face (synthetic or rights-cleared) — does not exist in the repo, needed for PHOTO-02's positive-detection test
- [ ] `src/services/faceBlur.js` — new module, does not exist yet
- [ ] `npm install sharp@0.35.3` — the only new dependency this phase needs
- [ ] `uploads/` directory creation (runtime-created via `fs.mkdir(..., {recursive: true})`, not committed) + `.gitignore` entry

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|--------------------|
| Face-blur reliability on small/partial/background faces in real photos | PHOTO-02 | Face-detection reliability against real-world photo variety cannot be benchmarked deterministically in this session — flagged in RESEARCH.md as the weakest-confidence, highest-consequence open question | Manually photograph or gather a few real waste-bin photos with a person partially/fully visible at different distances; upload each and confirm the face is blurred in the persisted output before phase sign-off |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
