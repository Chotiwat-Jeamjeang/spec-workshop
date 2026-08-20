# Phase 2: Photo Upload, Face-Blur & AI Classification - Research

**Researched:** 2026-08-20
**Domain:** Multipart photo upload security (magic-byte validation), Claude vision structured outputs (classification + bounding-box localization in one call), `sharp`-based face-blur/EXIF pipeline, multi-photo urgency aggregation
**Confidence:** MEDIUM-HIGH (the coordinate-mapping mechanics and image-resize/token-cost rules below are `[CITED]` directly from Anthropic's own live documentation, fetched and quoted this session — not recalled from training data, which would have been stale on several specifics, most importantly the pixel-vs-normalized coordinate recommendation. `sharp`'s blur/composite/metadata APIs are similarly `[CITED]` from its official docs. The genuinely open area, flagged honestly throughout, is real-world face-detection **recall** from a general-purpose vision model — Anthropic's own docs state spatial reasoning is "approximate" and must be spot-checked, and this session has no way to benchmark that against real photos.)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Photo attach flow**
- **D-01:** Photo attachment lives on the same single-page form as the location and note fields from Phase 1 — no separate step or wizard page. The existing "ถัดไป" button and page structure stay a single page.
- **D-02:** The form shows one fixed photo slot plus a "+ เพิ่มรูป" (add photo) control that reveals another slot, one at a time, up to a maximum of 3 — not three empty slots shown upfront.
- **D-03:** Each attached photo can be removed or replaced (an X/change control on that slot) before submit — not "remove only, re-add from scratch."
- **D-04:** The "ถัดไป" button (which already calls `POST /api/waste-reports/validate` per Phase 1) must be blocked from proceeding until at least 1 photo is attached — enforced both client-side (immediate feedback) and server-side (so it cannot be bypassed via curl/devtools), matching SPEC's edge case "ไม่ได้แนบรูปภาพ → ปฏิเสธการ submit."

**Upload/classify UX timing**
- **D-05:** Each photo is sent for AI classification immediately after the user selects the file for that slot — not batched and not deferred until a separate "check" button. This directly satisfies AI-01's "แสดงผลทันทีหลังอัปโหลด."
- **D-06:** While a photo's classification request is in flight, that slot shows the selected image thumbnail immediately with a spinner/overlay on top of it — not just a text-only "loading" state with no image visible.
- **D-07:** The AI's classification result (waste type + urgency) is display-only to the reporter in this phase — the reporter cannot edit or override it here. Correcting AI output is staff's job in the Phase 4 officer queue, consistent with PROJECT.md's AI Ethics constraint ("การตัดสินใจสุดท้ายเป็นหน้าที่เจ้าหน้าที่เสมอ").
- **D-08:** A genuine request failure (network error, server 5xx — NOT the AI returning "can't classify") shows an inline error with a "ลองใหม่" (retry) control at that specific photo slot. This is a distinct UX path from AI-03's `unclassified` outcome — a failed *request* is not silently treated as `unclassified`.

### Claude's Discretion

- **Face-blur implementation approach** — not selected for discussion. `.claude/CLAUDE.md` already carries a strong recommendation (extend the existing Claude Vision classify call to also return face bounding boxes, then blur with `sharp`, rather than a self-hosted face-detection model). Research/planning should confirm this approach and work out the details: blur strength/method, and the hard requirement that an un-blurred original is never written to disk or persisted anywhere (PROJECT.md AI Ethics: "ไม่เก็บข้อมูลส่วนบุคคลที่ไม่จำเป็น"). **→ This document confirms the approach (see Architecture Patterns → Pattern 1 and Pattern 2) and resolves blur strength/method (see Pattern 3): pixelation is the primary recommendation, not gaussian blur.**
- **Multi-photo urgency aggregation** — not selected for discussion. SPEC and REQUIREMENTS describe classification/urgency per photo but do not address how 2-3 photos' independent `coverage_percentage` values should combine into a single report-level urgency (e.g., max across photos, since the existing `deriveUrgency()` in `wasteImageClassifier.js` currently operates on one `coverage_percentage` value). Left to planning, grounded in the existing single-photo threshold logic. **→ See Architecture Patterns → Pattern 4 for the recommended `aggregateUrgency()` design.**

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.

### Phase Boundary (from CONTEXT.md, verbatim)

> This phase delivers safe photo attachment (1-3 images, real magic-byte MIME check, ≤5MB each) integrated directly into the existing Phase 1 report form, automatic face-blur applied to any face detected before a file is ever persisted, and immediate AI waste-type/urgency classification shown to the reporter per photo — reusing the existing proof-of-concept (`src/services/wasteImageClassifier.js`, `POST /api/waste-reports/classify`, `config/ai-thresholds.json`) rather than rebuilding it.
>
> **Out of scope for this phase** (belongs to later phases): actually persisting the report to `waste-reports.json` (Phase 3 — this phase does not write any report record, only classifies photos and shows results); the officer queue and any UI that lets staff edit/correct AI results (Phase 4); LINE notifications (Phase 5); rate limiting and dedup detection (Phase 6).

This boundary directly shapes Open Question #1 below (does the *blurred image file* get written in Phase 2, or does Phase 2 stay memory-only and defer all disk writes to Phase 3?). CONTEXT.md's boundary text says "no *report record*" is written — it does not say "no image file" is written, and the phrase "face-blur applied ... before a file is ever persisted" only makes sense if *some* file-persistence happens in this phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PHOTO-01 | ผู้ใช้งานแนบรูปภาพขยะได้ 1-3 รูปต่อรายการ (.jpg/.jpeg/.png/.webp เท่านั้น, ≤5MB ต่อไฟล์) โดยตรวจสอบ MIME type จริงจากไฟล์ | Architecture Patterns (Pattern 5: reuse existing per-slot classify endpoint), Don't Hand-Roll (reuse `imageType.js`, do NOT add `file-type`), Code Examples (per-slot multer config) |
| PHOTO-02 | ระบบทำ face-blur อัตโนมัติก่อนบันทึกไฟล์ หากภาพที่อัปโหลดมีใบหน้าบุคคลติดมา | Architecture Patterns (Pattern 1: bbox-from-same-call, Pattern 2: rotate-then-canonicalize, Pattern 3: pixelation blur), Common Pitfalls (#1 EXIF/coordinate-space mismatch, #2 bbox reliability), Security Domain |
| AI-01 | AI จำแนกประเภทขยะจากภาพและแสดงผลทันทีหลังอัปโหลด | Architecture Patterns (Pattern 1: extended classify call, unchanged response shape), Code Examples (extended `RESULT_SCHEMA`) |
| AI-02 | AI ประเมินระดับความเร่งด่วนจาก `coverage_percentage` เทียบกับ threshold ใน config ที่ admin ปรับได้ | Unchanged from existing `deriveUrgency()` — `[VERIFIED: src/services/wasteImageClassifier.js:37-45]`; Pattern 4 (multi-photo aggregation, new) |
| AI-03 | หาก AI จำแนกไม่ได้ ให้บันทึกเป็น `unclassified` ไม่บล็อกการ submit | Common Pitfalls (#3: existing code conflates "AI said unclassified" with "the API call itself failed" — a real gap relative to D-08 that this phase must fix, not just reuse) |
</phase_requirements>

## Summary

Phase 2's central technical question — "can Claude return reliable face bounding boxes in the same call as classification?" — has a well-documented, non-obvious answer as of this session's live fetch of Anthropic's vision docs: **yes, mechanically**, via structured JSON-schema output asking for **absolute pixel coordinates** (not normalized 0-1 or 0-1000, which the docs explicitly warn against: *"Claude does not work well when you ask for normalized coordinates... Always ask for pixel coordinates"*), but with a **critical, easy-to-get-wrong mechanic**: the pixel coordinates Claude returns are relative to *the image Claude actually saw after its own internal resize* — not your original upload. `claude-opus-5` is a "high-resolution tier" model (2576px long edge / 4784 visual-token budget); a typical modern phone photo (e.g. 4032×3024) will still be resized by Anthropic's API before analysis. Anthropic's own documented "most reliable approach" is to pre-resize the image *yourself*, using their published sizing algorithm, so the image you send **is** the image Claude sees and the returned coordinates need zero conversion. This document ports that exact algorithm to TypeScript/JavaScript (already provided by Anthropic in their docs) for use as a pre-processing step with `sharp` before the classify call.

The second load-bearing mechanic, not mentioned anywhere in CONTEXT.md or CLAUDE.md but discovered this session: Claude's API **does not read image EXIF metadata at all** (`[CITED: platform.claude.com/docs/en/build-with-claude/vision` FAQ, fetched this session]`). Most phone cameras store JPEGs in sensor-native pixel orientation and rely on an EXIF `Orientation` tag for correct display — meaning a portrait photo can be stored as landscape pixels. If that raw buffer is sent to Claude, it perceives the *wrong* orientation, and any face bounding box it returns is in that wrong orientation's coordinate space. If the app then separately auto-rotates the image for storage (a reasonable thing to do), the bounding box would land in the wrong place entirely on the rotated result — faces blurred at the wrong coordinates is the exact failure this phase's core requirement (PHOTO-02) must prevent. **The fix is one architectural rule: canonicalize the image once — `sharp(buffer).rotate()` (auto-orients from EXIF) then resize to the Claude-safe dimensions — and use that *exact* resulting buffer for both the classify call and the final blur/persist step.** This guarantees the bbox coordinate space and the stored-file pixel space are identical, with no scale-factor math anywhere in the pipeline, and it happens to also satisfy the project's own "keep files small" goal for free.

The third finding worth flagging up front: this session's live-executed WebSearch on face-anonymization research converged on a specific, actionable recommendation that differs from the "obvious" default — **light-to-moderate Gaussian blur is a documented, reversible-in-research-settings weak protection** (deblurring/deconvolution attacks against 5-10px blur are published), while **pixelation with sufficiently large blocks destroys the underlying pixel data irreversibly**. For a project whose explicit AI Ethics constraint is "do not retain unnecessary personal data," pixelation is the more defensible default, and `sharp` can do it with one already-verified API (`resize()` with `kernel: 'nearest'`, downscale then upscale) — no new capability needed beyond what `blur()`/`composite()` already require.

Finally, this session's direct read of `src/services/wasteImageClassifier.js` surfaced a genuine bug relative to this phase's own locked decision D-08: the existing proof-of-concept's `catch` block swallows *every* error — including genuine Anthropic API/network failures — into the same 200-response shape as a legitimate "AI couldn't classify" result. D-08 explicitly requires these to be distinguishable ("a failed *request* is not silently treated as `unclassified`"). This is not something Phase 2 can leave as "reuse as-is" — the try/catch boundary must be restructured so an API-call-level failure surfaces as a genuine error (5xx) the frontend's "ลองใหม่" control can react to, while a response-shape-level failure (refusal, unparseable JSON, no waste in frame) still resolves to `unclassified` with a 200.

**Primary recommendation:** Extend `wasteImageClassifier.js`'s existing structured-output schema with a `faces` array (pixel-coordinate bounding boxes, per Anthropic's documented format), pre-canonicalize every uploaded image with `sharp(buffer).rotate()` + the Anthropic-provided resize algorithm *before* both the classify call and any persistence, pixelate (not blur) each returned face region with generous padding via `sharp`'s `extract`/`resize(kernel:'nearest')`/`composite` pipeline, and persist only the resulting buffer — the original buffer is never passed to any disk-write call. Reuse the existing per-photo `POST /api/waste-reports/classify`-style endpoint pattern verbatim for the multipart/MIME-check/size-limit plumbing (already correct), reuse `imageType.js` as-is (do not add the `file-type` npm package — it duplicates working, in-repo code and adds unnecessary ESM-interop friction), and fix the error-swallowing gap in `classifyWasteImage`'s catch block to satisfy D-08.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Photo file selection & thumbnail preview | Browser/Client | — | `URL.createObjectURL(file)` for the immediate local thumbnail (D-06) is pure client-side rendering of the user's own device file — no network round-trip, and critically, this local preview is **not** a server-side persistence event, so it does not conflict with "never persist an un-blurred original." |
| MIME-type / size validation | API/Backend | Browser/Client (fast-fail via `accept` attr + client-side size check) | The server check is the only one that matters for security (client checks are UX-only, trivially bypassed) — magic-byte detection must happen server-side on the buffered bytes, per the existing `imageType.js` pattern. |
| Image canonicalization (EXIF auto-orient + Claude-safe resize) | API/Backend | — | Must happen once, server-side, before *either* consumer (the Claude call or the persisted file) sees the buffer — this is what keeps bbox coordinates and stored-pixel coordinates in the same space. Cannot live client-side: no reliable, dependency-free EXIF/resize primitive exists in a browser without a JS image library, and the constraint here is explicitly zero client-side framework/library weight. |
| AI classification + face bounding-box detection | API/Backend (calls out to Claude API) | — | The Anthropic API key lives only server-side; this is also where the canonicalized buffer already lives. |
| Face-blur (pixelation) application | API/Backend | — | Must run before the file ever touches disk — cannot be deferred to the client (defeats the entire privacy purpose) or to a later phase (Phase 3 only handles the JSON *record*, not image bytes). |
| Persisted image file write | API/Backend | — | Writes the post-blur buffer only, under a `crypto.randomUUID()` filename, to a project-root `uploads/` directory outside `public/`'s static-serve scope. |
| Per-photo classification result display (waste type, urgency, spinner, retry) | Browser/Client | API/Backend (supplies the JSON the client renders) | Pure DOM state driven by the fetch response for that slot — matches the existing guarded-lookup/`textContent`-only pattern from Phase 1's `report.js`. |
| Multi-photo urgency aggregation | API/Backend | — | A pure function operating on already-computed per-photo results; belongs beside `deriveUrgency()` in `wasteImageClassifier.js`, not duplicated client-side (the client only ever needs to *display* per-photo results per D-06/D-07 — see Open Question #2). |

## Project Constraints (from CLAUDE.md)

Extracted from `.claude/CLAUDE.md` (this project's `claude_md_path` per `.planning/config.json`), filtered to what's actionable for Phase 2:

- **Face-blur approach is pre-endorsed, not open:** *"Extend the existing Claude Vision call to also return face bounding boxes, then blur with `sharp`... over a self-hosted face detector."* This research confirms the approach is sound (see Architecture Patterns) but adds a documented caveat CLAUDE.md itself flagged as unverified: the self-hosted-vs-Claude-vision tradeoff table explicitly says *"Confidence on this comparison is LOW — verify... since it wasn't independently cross-checked."* This session's fetch of Anthropic's own docs (`vision.md` → Limitations: *"Claude's coordinate and localization outputs are approximate"*) is the closest available confirmation that the tradeoff CLAUDE.md flagged as a risk is real, not hypothetical — see Common Pitfall #2 and the Assumptions Log.
- **`sharp`** — CLAUDE.md's stack table already recommends `sharp@0.35.3` for exactly this job (resize, EXIF strip, face-blur region), version re-confirmed live this session (`npm view sharp version` → `0.35.3`, `[VERIFIED: npm registry, this session]`).
- **`file-type` is CLAUDE.md's general-purpose recommendation, but does NOT apply to this phase**, because `02-CONTEXT.md`'s `code_context` section explicitly names `src/services/imageType.js` — which already exists, already does magic-byte detection for exactly jpeg/png/webp, and is explicitly marked "reuse as-is." Installing `file-type` on top of that would be pure duplication plus new ESM-interop complexity CLAUDE.md itself flags (`file-type@22` is ESM-only, requires `await import()` in this `"type": "commonjs"` project). See Standard Stack → Alternatives Considered.
- **What NOT to use (relevant subset):** no database; no frontend framework/bundler; `crypto.randomUUID()` (built-in) for any new id generation, never the `uuid` package — directly applicable to naming persisted image files.
- **Testing convention:** `node:test` (built-in) + `supertest` — already established in Phase 1 (`test/report.test.js`), zero new framework needed.
- **Multer is already wired up correctly** for this exact job: `.claude/CLAUDE.md`'s own note says *"treat this as the first, not the only, validation layer"* — `src/routes/classify.js`'s existing `multer({storage: memoryStorage(), limits: {fileSize: 5MB}})` config is the correct base to extend, not replace.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `sharp` | `0.35.3` | Image canonicalization (EXIF auto-orient + resize), face-region pixelation, final buffer output | `[VERIFIED: npm registry, this session — npm view sharp version → 0.35.3, engines.node >=20.9.0]`. `[CITED: sharp.pixelplumbing.com/api-operation, api-output, api-resize, api-composite — all fetched this session]` for the exact `blur()`/`rotate()`/`resize()`/`composite()` signatures used below. Already the project's own pre-approved choice (CLAUDE.md); no new evaluation needed, only mechanics. |
| Node built-in `crypto.randomUUID()` | built-in | Filename for each persisted post-blur image | Already an approved, zero-dependency pattern in this project (used for QR/report ids elsewhere per CLAUDE.md's "What NOT to Use" table). Guarantees unique filenames with no lock/atomic-write machinery needed for the image-file writes themselves (see Architecture Patterns → Pattern 6). |
| Existing `src/services/imageType.js` | in-repo | Magic-byte MIME detection (jpeg/png/webp) | `[VERIFIED: src/services/imageType.js:1-38, read this session]` — already implements exactly PHOTO-01's requirement, already the pattern `classify.js` uses. Zero new dependency. |
| Existing `src/services/wasteImageClassifier.js` | in-repo, extended | Claude vision call — extend `RESULT_SCHEMA` with a `faces` array, extend `classifyWasteImage`'s return shape | `[VERIFIED: src/services/wasteImageClassifier.js:1-105, read this session]` — this is the file CONTEXT.md's Phase Boundary says to build on, not duplicate. |

### Supporting

*(None — this phase needs no new npm package beyond `sharp`. See Alternatives Considered below for the packages CLAUDE.md's general stack research suggested that do **not** apply here.)*

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Reusing in-repo `imageType.js` for magic-byte MIME detection | `file-type@22.0.2` (CLAUDE.md's general recommendation) | `file-type` is ESM-only (`[VERIFIED: npm view file-type engines/type, this session → engines.node ">=22", type "module"]`) and requires `await import()` interop in this CommonJS project for zero functional gain — `imageType.js` already covers the exact 3 formats PHOTO-01 needs and is proven working in `classify.js` today. Installing `file-type` anyway would be pure duplication. Only reconsider if a 4th format needs supporting later. |
| Pixelation (nearest-neighbor downscale/upscale via `sharp`) as the primary face-blur method | Gaussian blur (`sharp().blur(sigma)`) | `[CITED: WebSearch synthesis of multiple sources, this session — Fantômas (arXiv 2210.10651 / PETS 2024), Gallio.pro "Blur or Pixelate" and "is face blurring irreversible", IEEE "Real-Time Face Anonymization Using Gaussian Blur and Pixelation"]` — light-to-moderate Gaussian blur (5-10px) has documented reversal via deblurring/deconvolution in research settings; even 20px+ blur is "much harder but still theoretically reversible." Pixelation with sufficiently large blocks destroys the underlying pixel data with no equivalent reversal path. Gaussian blur remains an acceptable *fallback* if product wants a softer visual look, but must use a large sigma (≥15-20) scaled to the face-box size — a "light" default blur is explicitly the weak option the research warns against. `[MEDIUM confidence — WebSearch-aggregated across independent sources, not a single formal spec, but convergent]`. |
| Extending the existing Claude Vision call for face bounding boxes (CONTEXT.md's pre-endorsed direction) | Self-hosted `@vladmandic/face-api` + `@tensorflow/tfjs-node` | Unchanged from CLAUDE.md's own analysis, still valid: materially heavier install (native `tfjs-node` addon, fragile on Windows) for a project whose whole image is already round-tripping to Claude anyway. `[LOW confidence per CLAUDE.md's own flag — not independently re-verified this session]`. The one new consideration this session surfaces: Anthropic's vision docs explicitly caveat spatial-reasoning accuracy (`[CITED: vision.md → Limitations]`), which is a real argument *for* eventually adding a dedicated detector as defense-in-depth if false-negative face detection proves to be a problem in UAT — flagged as Open Question #3, not decided here. |
| Pre-resizing the image with `sharp` to Claude's exact resolution before the classify call | Sending the raw upload and rescaling returned coordinates afterward | `[CITED: platform.claude.com/docs/en/build-with-claude/vision-coordinates, fetched this session]` — Anthropic's own docs call pre-resizing "the most reliable approach" ("the image you have is exactly the image Claude sees and the coordinates... need no conversion"). Rescaling-after is offered as a fallback for cases where you can't control the upload path, which doesn't apply here (we own the whole pipeline). Pre-resizing also directly serves the project's "keep stored files small" goal — the same resize is used for both purposes. |

**Installation:**
```bash
npm install sharp@0.35.3
```

**Version verification (this session, `npm view sharp version|engines`):**

| Package | Latest version | `engines.node` |
|---|---|---|
| `sharp` | 0.35.3 | `>=20.9.0` |

`[VERIFIED: npm registry, verified live this session — 2026-08-20]`. Project's installed Node (`v24.18.0`, `[VERIFIED: node --version, this session]`) comfortably exceeds this floor.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `sharp` | npm | published this cycle under an actively-maintained major line (`lovell/sharp`) | 74,835,496/week | `github.com/lovell/sharp` | **OK** | Approved |

`[VERIFIED: gsd-tools query package-legitimacy check --ecosystem npm sharp, run live this session]` — verdict `OK`, no `reasons` flagged, `postinstall: null`, `deprecated: false`.

**Packages removed due to `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** none — `sharp` is the only new package this phase introduces, and it cleared the gate cleanly. (For contrast: the same legitimacy check run this session against `file-type` returned `[SUS: too-new]` — one more reason, on top of the duplication argument above, not to add it.)

## Architecture Patterns

### System Architecture Diagram

```
BROWSER (per photo slot, D-05/D-06)
  User selects a file for a slot
        |
        v
  Local thumbnail shown immediately via URL.createObjectURL(file)
  (client-only preview — never persisted, never sent anywhere yet)
        |
        v
  fetch POST to per-slot classify endpoint, multipart/form-data
  spinner overlay shown on top of the thumbnail (D-06) while awaiting response
========================= EXPRESS APP =========================
        |
        v
  multer.memoryStorage() -- buffers the upload, enforces 5MB limit
  (existing pattern, src/routes/classify.js -- reused)
        |
        v
  imageType.detectImageType(buffer)  -- magic-byte check (PHOTO-01)
  [reject: 400, distinct message -- NOT a "ลองใหม่" case]
        |
        v (jpeg/png/webp confirmed)
  sharp(buffer).rotate()             -- EXIF auto-orient, tag removed
    .resize(...Anthropic-safe-size)  -- pre-resize to Claude's exact
                                          resolution tier (Pattern 2)
        |
        v   <-- THIS canonicalized buffer is used for BOTH branches below
        |
        +-----------------------------------------+
        v                                          v
  classifyWasteImage(canonicalBuffer, mediaType)   (buffer held in memory,
  [src/services/wasteImageClassifier.js, EXTENDED]  not yet written anywhere)
    -- Claude API call, structured output:
       { waste_type, coverage_percentage,
         no_waste_detected, faces: [{x1,y1,x2,y2}, ...] }
    -- pixel coordinates, relative to canonicalBuffer's exact dimensions
        |
   API/network failure           successful response
   (Anthropic SDK throws)        (incl. AI-side "can't classify")
        |                              |
        v                              v
   propagate as a genuine        wasteType/urgency resolved as today;
   error -- 5xx to client        faces[] (possibly empty) available
   (D-08 "ลองใหม่" path,               |
    Pitfall #3 fix)                    v
                              for each face: pad bbox +15-20%,
                              clamp to image bounds, pixelate
                              region in-place on canonicalBuffer
                              (sharp extract/resize-nearest/composite,
                               Pattern 3)
                                        |
                                        v
                              write ONLY this post-blur buffer to
                              uploads/<crypto.randomUUID()>.jpg
                              (raw canonicalBuffer/original upload
                               is NEVER passed to any disk-write call)
                                        |
                                        v
                              200 JSON response to client:
                              { wasteType, urgency, coveragePercentage,
                                noWasteDetected, imageId }
========================================================================
        |
        v
BROWSER -- slot updates from spinner to result badge (waste type + urgency,
  display-only per D-07); on 5xx, slot shows inline "ลองใหม่" retry (D-08);
  on 200-with-unclassified, slot shows unclassified badge, submit still
  allowed to proceed (AI-03) -- these two are visually and structurally
  distinct paths, not the same code path (Pitfall #3)
```

A reader can trace one photo slot's full path — selection, local preview, per-slot upload, magic-byte validation, canonicalization, the *single* Claude call that yields both classification and face locations, the blur-before-persist boundary, and the three distinct response outcomes (validation reject / genuine failure / classification result) — matching D-05 through D-08 exactly.

### Recommended Project Structure

```
uploads/                          # NEW — top-level, sibling to public/, config/
                                   #   NOT under public/ (never blanket-statically served
                                   #   the same way public/css, public/js are)
                                   #   gitignored, same pattern as qr-output/ (Phase 1)

src/
├── routes/
│   ├── classify.js               # existing (Phase 2 proof-of-concept) -- EXTEND, don't replace:
│   │                              #   add the canonicalize -> classify -> blur -> persist steps
│   │                              #   around the existing multer + detectImageType call
│   └── report.js                 # existing (Phase 1) -- unchanged this phase
├── services/
│   ├── wasteImageClassifier.js   # existing -- EXTEND: RESULT_SCHEMA gains `faces`,
│   │                              #   classifyWasteImage return shape gains `faces`,
│   │                              #   catch block restructured (Pitfall #3),
│   │                              #   NEW: aggregateUrgency() (Pattern 4)
│   ├── imageType.js               # existing -- unchanged, reused as-is
│   └── faceBlur.js                # NEW -- sharp canonicalize + pixelate pipeline (Pattern 2/3)
```

This extends rather than replaces the structure Phase 1's own research (`01-RESEARCH.md`) and the project's existing layout already established (`src/routes/`, `src/services/` separation).

### Pattern 1: Extend the existing structured-output schema with a `faces` array, in the same call

**What:** Add a `faces` field to the existing `RESULT_SCHEMA` (`[VERIFIED: src/services/wasteImageClassifier.js:12-30]`) — an array of pixel-coordinate bounding boxes — so one Claude API call returns both the waste classification *and* every detected face's location. This is exactly the approach CONTEXT.md's Claude's Discretion section asked this research to confirm.

**Why one call, not two:** The existing call already pays for image-token cost once; asking for both outputs in the same structured-output schema costs a handful of extra output tokens, not a second image-token charge. Splitting into two calls (one for classification, one for face detection) would double the per-photo latency and cost for no benefit — nothing about face detection requires a separate call.

**Coordinate format — pixel, not normalized (`[CITED: platform.claude.com/docs/en/build-with-claude/vision-coordinates`, fetched this session]`):**
> "Claude works best with absolute pixel coordinates. Ask for them explicitly in your prompt... Claude does not work well when you ask for normalized coordinates, for example: 'Return bounding box coordinates between 0 and 1000.' Always ask for pixel coordinates and normalize in your own code if you need to."

This directly overrides what a developer might assume from experience with other vision APIs (some of which *do* recommend a 0-1000 normalized grid) — for Claude specifically, pixel coordinates are the documented, better-performing choice.

**Extended schema (verbatim field-naming style matches the existing schema's `snake_case` convention, `[VERIFIED: src/services/wasteImageClassifier.js:14-30]`):**
```javascript
// src/services/wasteImageClassifier.js -- RESULT_SCHEMA, extended
const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    waste_type: {
      anyOf: [{ type: 'string', enum: WASTE_TYPES }, { type: 'null' }],
      description: 'ประเภทขยะที่พบในภาพ หรือ null หากไม่สามารถระบุได้',
    },
    coverage_percentage: {
      anyOf: [{ type: 'number' }, { type: 'null' }],
      description: 'สัดส่วนพื้นที่ถัง/บริเวณในภาพที่ถูกขยะปกคลุม เป็นตัวเลข 0-100 หรือ null หากประเมินไม่ได้',
    },
    no_waste_detected: {
      type: 'boolean',
      description: 'true หากไม่พบขยะในภาพเลย',
    },
    // NEW for Phase 2 (PHOTO-02):
    faces: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          x1: { type: 'number', description: 'left edge, pixel x-coordinate' },
          y1: { type: 'number', description: 'top edge, pixel y-coordinate' },
          x2: { type: 'number', description: 'right edge, pixel x-coordinate' },
          y2: { type: 'number', description: 'bottom edge, pixel y-coordinate' },
        },
        required: ['x1', 'y1', 'x2', 'y2'],
        additionalProperties: false,
      },
      description:
        'Bounding box of each human face visible in the image, as pixel coordinates ' +
        '(top-left origin, x increasing right, y increasing down) in the image as provided. ' +
        'Return one entry per face, or an empty array if no faces are visible. ' +
        'This is used only to blur faces for privacy before the image is stored — never for identification.',
    },
  },
  required: ['waste_type', 'coverage_percentage', 'no_waste_detected', 'faces'],
  additionalProperties: false,
};
```
`minimum`/`maximum` numeric constraints on `x1`/`y1`/`x2`/`y2` are **deliberately omitted** — Claude's structured-outputs JSON Schema support does not include numeric range constraints (`[CITED: shared/tool-use-concepts.md → Structured Outputs → JSON Schema Limitations, from the claude-api skill loaded this session]` — "Not supported: Numerical constraints (`minimum`, `maximum`, `multipleOf`)"). Clamp values in application code instead, exactly as the existing code already does for `coverage_percentage` (`[VERIFIED: src/services/wasteImageClassifier.js:91-92]` — `Math.min(100, Math.max(0, parsed.coverage_percentage))`). The same clamp-in-app-code pattern must be applied to each face box's coordinates before they're used with `sharp`.

**The "detect faces, don't identify them" framing in the prompt/schema description is deliberate**, not incidental copy: Anthropic's Acceptable Use Policy prohibits using Claude to *name* people in images (`[CITED: vision.md → Limitations]` — "Claude cannot be used to name people in images and refuses to do so"). This phase only needs face *location*, never identity, and the prompt should say so explicitly to avoid any ambiguity that could trigger an unrelated safety refusal.

### Pattern 2: Canonicalize once — rotate, then resize to Claude's exact resolution — before either consumer sees the buffer

**What:** Before the buffer goes anywhere else, run it through a single `sharp` pipeline that (a) auto-orients from EXIF and (b) resizes to the exact dimensions Anthropic's API will itself resize to. Use *that* output buffer for the Claude API call, and *that same* buffer (post-blur) as the file that gets persisted.

**Why this specific order matters (`[CITED: platform.claude.com/docs/en/build-with-claude/vision` FAQ]`):**
> "Does Claude read image metadata? No, Claude does not parse or receive any metadata from images passed to it."

Most phone JPEGs store pixels in sensor-native orientation and rely on the EXIF `Orientation` tag for correct display — a portrait photo can be landscape pixels + `Orientation: 6`. Since Claude never reads that tag, it perceives the un-rotated pixel grid. If face bounding boxes come back in that un-rotated space, and the app *separately* rotates the image for storage/EXIF-stripping (a reasonable thing to want to do regardless), the bounding boxes and the final image are now in two different coordinate spaces — a 90° rotation maps `(x, y)` to a completely different location, so blur would land on the wrong region of the photo. **Rotating first, and sending Claude the already-rotated buffer, eliminates this failure mode structurally** rather than requiring rotation-aware coordinate math.

**`sharp`'s `rotate()` behavior (`[CITED: sharp.pixelplumbing.com/api-operation`, fetched this session]`):**
> "For backwards compatibility, if no angle is provided, `.autoOrient()` will be called." / `autoOrient()`: "Auto-orient based on the EXIF Orientation tag, then remove the tag."

Calling `.rotate()` with no arguments is exactly the auto-orient-and-strip-the-tag behavior needed — one call does both the visual correction and (for that one tag) the metadata removal.

**Anthropic's own documented resize algorithm (`[CITED: platform.claude.com/docs/en/build-with-claude/vision-coordinates` → "Resize your image before uploading", fetched this session — TypeScript reference implementation reproduced verbatim from that page]`):**
```typescript
// src/services/faceBlur.js (or a small shared util) -- ported from Anthropic's
// own published reference implementation, unmodified logic.
/** Visual tokens consumed by an image: one token per 28x28 pixel patch. */
function countImageTokens(width, height) {
  return Math.ceil(width / 28) * Math.ceil(height / 28);
}

/** Round half to even, matching the live API's tie-breaking rule. */
function roundTiesToEven(value) {
  const floor = Math.floor(value);
  if (value - floor !== 0.5) return Math.round(value);
  return floor % 2 === 0 ? floor : floor + 1;
}

/**
 * The size Claude resizes an image to before padding.
 * claude-opus-5 is a high-resolution-tier model: maxEdge=2576, maxTokens=4784.
 * Images that already fit within the limits are returned unchanged.
 */
function resizedSize(width, height, maxEdge = 2576, maxTokens = 4784) {
  const fits = (w, h) =>
    Math.ceil(w / 28) * 28 <= maxEdge &&
    Math.ceil(h / 28) * 28 <= maxEdge &&
    countImageTokens(w, h) <= maxTokens;

  if (fits(width, height)) return [width, height];
  if (height > width) {
    const [resizedH, resizedW] = resizedSize(height, width, maxEdge, maxTokens);
    return [resizedW, resizedH];
  }

  const aspectRatio = width / height;
  let lo = 1;
  let hi = width;
  while (lo + 1 < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (fits(mid, Math.max(roundTiesToEven(mid / aspectRatio), 1))) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return [lo, Math.max(roundTiesToEven(lo / aspectRatio), 1)];
}

module.exports = { resizedSize };
```
**Important nuance verified this session:** capping only the long edge at 2576px is *not* sufficient on its own — Anthropic's docs give a worked example where an A4 scan (1075×1520, both sides under 2576px) still gets resized because it exceeds the **visual-token** budget (`⌈w/28⌉ × ⌈h/28⌉`), not the edge limit. Use the full `resizedSize()` algorithm above, not a naive "just cap the long edge" shortcut, or coordinates will silently mismatch for some real-world photo aspect ratios.

**Full canonicalization call:**
```javascript
const { width, height } = await sharp(buffer).rotate().metadata(); // after rotate, dims are the *display* dims
const [targetW, targetH] = resizedSize(width, height); // 2576 / 4784 for claude-opus-5
const canonicalBuffer = await sharp(buffer)
  .rotate()                      // EXIF auto-orient, tag removed
  .resize(targetW, targetH, { fit: 'inside', withoutEnlargement: true })
  .toBuffer();                   // metadata stripped by default -- see Pattern 3's EXIF note
```
`[CITED: sharp.pixelplumbing.com/api-output`, fetched this session]`: *"By default all metadata will be removed, which includes EXIF-based orientation."* — confirms no separate "strip EXIF" step is needed; simply never call `withMetadata()`/`keepMetadata()`/`keepExif()` anywhere in this pipeline.

### Pattern 3: Pixelate the face region — extract, downscale-then-upscale with nearest-neighbor, composite back, with padding

**What:** For each face bounding box, pad it outward, clamp to image bounds, then replace that region with a blocky mosaic (not a smooth blur) before compositing it back onto the canonical buffer.

**Why pad the box:** Anthropic's own docs state spatial reasoning is approximate (`[CITED: vision.md → Limitations]` — "Claude's coordinate and localization outputs are approximate... verify outputs before relying on them"). A tightly-fit box risks leaving a sliver of hairline/ear/jaw unblurred at the edge. Padding outward by ~15-20% on each side is cheap insurance against this specific failure mode, at the cost of blurring slightly more of the surrounding photo — an acceptable tradeoff for a privacy-critical feature.

**Why pixelation over blur, and the exact `sharp` calls (`[CITED: sharp.pixelplumbing.com/api-resize` and `api-composite`, fetched this session]`):**
- `resize()`'s `kernel` option accepts `nearest` ("nearest neighbour interpolation") — downscaling to a small size then upscaling back with `kernel: 'nearest'` produces the blocky mosaic effect used for pixelation.
- `composite()` takes `images[].input` (a Buffer), `images[].left`, `images[].top` for exact pixel-offset placement — `"If both top and left options are provided, they take precedence over gravity."`

```javascript
const FACE_PAD_RATIO = 0.18;      // pad each box 18% outward on every side
const PIXELATE_BLOCKS = 12;       // downscale target: ~12 blocks across the shorter dimension

async function pixelateFace(canonicalBuffer, box, imgWidth, imgHeight) {
  const padX = (box.x2 - box.x1) * FACE_PAD_RATIO;
  const padY = (box.y2 - box.y1) * FACE_PAD_RATIO;

  // Clamp to image bounds -- never trust raw model output for extract() geometry.
  const left = Math.max(0, Math.floor(box.x1 - padX));
  const top = Math.max(0, Math.floor(box.y1 - padY));
  const right = Math.min(imgWidth, Math.ceil(box.x2 + padX));
  const bottom = Math.min(imgHeight, Math.ceil(box.y2 + padY));
  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0) return null; // degenerate box -- skip, don't throw

  const blockW = Math.max(1, Math.round(width / PIXELATE_BLOCKS));
  const blockH = Math.max(1, Math.round(height / PIXELATE_BLOCKS));

  const pixelated = await sharp(canonicalBuffer)
    .extract({ left, top, width, height })
    .resize(blockW, blockH, { kernel: 'nearest' })   // downscale -- destroys detail
    .resize(width, height, { kernel: 'nearest' })    // upscale back -- blocky, not smoothed
    .toBuffer();

  return { input: pixelated, left, top };
}

// Apply all face regions in one composite() call:
const overlays = (await Promise.all(
  faces.map((box) => pixelateFace(canonicalBuffer, box, targetW, targetH))
)).filter(Boolean);

const finalBuffer = overlays.length
  ? await sharp(canonicalBuffer).composite(overlays).toBuffer()
  : canonicalBuffer; // no faces detected -- persist the canonical buffer unchanged
```

**The hard requirement, restated as a code-level rule:** `canonicalBuffer` (pre-blur) is held only in memory for the duration of this request and is **never** passed to `sharp(...).toFile()`, `fs.writeFile`, or any other disk-write call. Only `finalBuffer` (post-composite, or the canonical buffer when zero faces were found) is ever written. A code-review/test check worth adding: grep the implementation for every disk-write call site and confirm none of them reference `canonicalBuffer`, `buffer` (the raw multer upload), or any variable derived from them before compositing.

### Pattern 4: Multi-photo urgency aggregation — max severity across classified photos

**What:** A pure function, colocated with `deriveUrgency()`, that reduces 1-3 photos' independent classification results to a single report-level urgency, using the same rank order the SPEC already defines.

**Recommended design (`[ASSUMED — synthesis of CONTEXT.md's discretion note + the existing verified enum values; not itself sourced from an external authority, since none applies to an app-specific aggregation rule]`):**
```javascript
// src/services/wasteImageClassifier.js -- new export, beside deriveUrgency
const URGENCY_RANK = { 'เร่งด่วน': 3, 'ควรดำเนินการ': 2, 'ไม่เร่งด่วน': 1 };

/**
 * Combines per-photo classification results into one report-level urgency.
 * Rule: take the MAX severity among photos that were successfully classified;
 * an unclassified photo never suppresses a genuine urgent finding from
 * another photo. If every photo is unclassified, the aggregate is
 * unclassified too (AI-03: still does not block submit).
 * @param {Array<{urgency: string}>} results
 * @returns {string} one of the three urgency labels, or UNCLASSIFIED
 */
function aggregateUrgency(results) {
  const classified = results.filter((r) => r.urgency !== UNCLASSIFIED);
  if (classified.length === 0) return UNCLASSIFIED;
  return classified.reduce(
    (worst, r) => (URGENCY_RANK[r.urgency] > URGENCY_RANK[worst] ? r.urgency : worst),
    classified[0].urgency
  );
}

module.exports = { classifyWasteImage, WASTE_TYPES, UNCLASSIFIED, aggregateUrgency };
```
The three urgency label strings (`'เร่งด่วน'`, `'ควรดำเนินการ'`, `'ไม่เร่งด่วน'`) and `UNCLASSIFIED = 'unclassified'` are `[VERIFIED: src/services/wasteImageClassifier.js:7-8,42-44]` — quoted verbatim from `deriveUrgency()`'s existing return values, not reconstructed from memory.

**Scope note:** per Open Question #2, this phase's *UI* only needs to display per-photo results (D-06 shows each slot's own badge). `aggregateUrgency()` is recommended as a ready-to-use utility Phase 2 should implement and unit-test now — since CONTEXT.md explicitly assigns this decision to this phase — so Phase 3 can call it directly when constructing the persisted report record, without re-deciding the aggregation rule later.

### Pattern 5: Reuse the existing single-file classify endpoint pattern per photo slot — no `upload.array()`/`upload.fields()` needed

**What:** Because D-05 requires each photo to classify independently and immediately on selection (not batched), the *existing* `upload.single('image')` pattern in `src/routes/classify.js` (`[VERIFIED: src/routes/classify.js:8-11]`) is already the exactly-correct shape — each photo slot makes its own independent POST. No multi-file multer config (`upload.array()`/`upload.fields()`) is needed anywhere in this phase.

**What to extend, concretely:** the existing route's body (`[VERIFIED: src/routes/classify.js:15-27]`) currently does `detectImageType` → `classifyWasteImage` → `res.json(result)`. Extend this same handler with the canonicalize (Pattern 2) and blur (Pattern 3) steps between `classifyWasteImage` and the response, and change the response shape to include `imageId` (the persisted filename) alongside the existing `wasteType`/`urgency`/`coveragePercentage`/`noWasteDetected` fields — the client-side contract barely changes.

### Pattern 6: Persist the blurred file directly to a project-root `uploads/` directory — no file-lock needed for this write

**What:** Write `finalBuffer` to `uploads/<crypto.randomUUID()>.jpg` (or the format-appropriate extension) as soon as blur/composite completes, and return that generated id/filename to the client in the classify response.

**Why no `proper-lockfile`/`write-file-atomic` is needed here, unlike `waste-reports.json`'s Phase 3 requirement:** the SPEC's file-lock requirement is specifically about the single shared `waste-reports.json` file, where two concurrent submissions could race on the same read-modify-write cycle. Each image upload writes to a **uniquely-named** file (`crypto.randomUUID()` is designed to never collide) that no other request will ever touch — there is no shared mutable state to protect, so a plain `fs.promises.writeFile()` is safe with no additional machinery.

**Known, accepted tradeoff — orphaned uploads:** because this phase does not persist the report record (Phase 3's job — CONTEXT.md's Phase Boundary is explicit), a user who attaches photos, gets them classified and blurred (and thus written to `uploads/`), and then abandons the form without submitting leaves that file behind with nothing referencing it. This is a common, accepted pattern in "upload-then-attach" flows (the alternative — a staging directory + explicit promote-on-submit step + garbage-collection job — is real complexity this MVP-mode phase does not need to build). Flagged explicitly as a known limitation, not silently accepted; see Open Question #1 for the reasoning that led here, and consider a periodic sweep of `uploads/` files older than N hours with no matching report record as a lightweight future cleanup (not this phase's job to build).

**Static-serving scope:** `uploads/` should get its own narrow `express.static` mount (e.g. `app.use('/uploads', express.static(path.join(__dirname, 'uploads')))`), kept separate from the existing `public/` mount — matching the security posture Phase 1 already established for `public/` (narrow, explicit static-serve boundaries; `[VERIFIED: .planning/phases/01-location-submission-entry/01-SECURITY.md` — threat T-01-09, "mounted at path.join(__dirname, 'public') only"]`). Add `uploads/` to `.gitignore` (`[VERIFIED: .gitignore, read this session — currently `node_modules/`, `venv/`, `.env`, `qr-output/`]`), following the exact precedent Phase 1 set for `qr-output/`.

### Anti-Patterns to Avoid

- **Asking Claude for normalized (0-1 or 0-1000) face coordinates:** Anthropic's own docs explicitly say this underperforms pixel coordinates for this model family — do not carry over a convention from a different vision API.
- **Sending the raw, un-rotated upload to Claude and separately auto-rotating for storage:** puts the returned bounding boxes and the final stored image in two different coordinate spaces (Pattern 2's whole point is to avoid this).
- **Capping only the image's long edge at 2576px** as a substitute for the full `resizedSize()` token-budget-aware algorithm — Anthropic's own worked example (an A4 scan) proves the token limit can bind before the edge limit even when both sides are well under it.
- **Treating a genuinely failed Claude API request the same as an AI-returned "unclassified" result** — this is the existing proof-of-concept's actual current behavior (see Common Pitfall #3) and directly violates this phase's own locked decision D-08.
- **Calling `sharp(...).withMetadata()` anywhere in this pipeline** — reintroduces GPS/device EXIF data the project's AI Ethics constraint requires stripped; metadata is already stripped by `sharp`'s default behavior, so the safest action is to never call this method at all in the face-blur/canonicalization code path.
- **Installing `file-type` as a second, competing MIME-detection layer** — `imageType.js` already exists, already works, and CONTEXT.md names it for reuse; a second detector is pure duplication with new ESM-interop cost for zero functional gain.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Face detection / localization in a photo | A custom face-detection model or heuristic (skin-tone/Haar-cascade style detection) | Claude's vision API, via the extended structured-output schema (Pattern 1) | Face detection is a genuinely hard computer-vision problem; CONTEXT.md/CLAUDE.md already correctly steer away from building one, in favor of reusing the vision call the app is already making for classification. |
| Pixel-region blurring/pixelation | Manual pixel-array manipulation | `sharp`'s `extract`/`resize(kernel:'nearest')`/`composite` pipeline (Pattern 3) | `sharp` wraps libvips, a mature, fast, well-tested native image library — hand-rolling pixel iteration in JS would be slower and much more bug-prone (off-by-one region boundaries, color-space handling) for no benefit. |
| EXIF orientation correction | Manually reading the EXIF `Orientation` tag and applying the corresponding rotation/flip matrix | `sharp().rotate()` (no-arg form calls `autoOrient()`) | EXIF orientation has 8 possible values including mirrored variants — `sharp`'s built-in handling covers all of them correctly; a hand-rolled version is a classic source of "photo appears sideways/mirrored on some phones" bugs. |
| Coordinate-space rescaling between "the image Claude saw" and "my original image" | Ad-hoc scale-factor math scattered through the codebase | Pre-resize with Anthropic's own published `resizedSize()` algorithm (Pattern 2), so there is no rescaling to do at all | The official algorithm has specific tie-breaking (`round half to even`) and a two-constraint (edge AND token-budget) fit check that a naive reimplementation is likely to get subtly wrong — Anthropic ships working reference code in seven languages including TypeScript; use it verbatim. |

**Key insight:** every item above is either a well-solved problem with a stable library already in the project's approved stack (`sharp`), or a mechanic Anthropic itself ships a verified reference implementation for. The temptation in this phase is specifically around the *coordinate mapping* — it looks like "just some arithmetic," but Anthropic's own worked example (an A4 scan resized despite fitting the edge limit) shows the naive version is wrong in real cases, not just edge cases.

## Common Pitfalls

### Pitfall 1: Sending an un-rotated buffer to Claude, then rotating separately for storage — face blur lands on the wrong region

**What goes wrong:** A phone photo shot in portrait but stored as landscape pixels (EXIF `Orientation` tag doing the correction at display time) gets sent to Claude as-is. Claude — which never reads EXIF metadata — returns face bounding boxes in landscape-pixel-space. If the app separately calls `sharp(buffer).rotate()` when preparing the file for storage, the *stored* image is now genuinely rotated 90°, but the bounding boxes were computed against the un-rotated version — a 90° rotation maps every `(x, y)` to an unrelated location. The blur is applied in the wrong place; a real face can end up completely unblurred in the final stored file.

**Why it happens:** It's natural to think of "rotate for correct display" and "detect faces" as two independent, order-agnostic steps. They are not, because only one of the two systems (the local `sharp` pipeline) is orientation-aware; Claude is not.

**How to avoid:** Canonicalize with `sharp(buffer).rotate()` **first**, before the buffer is used for anything else, and use that exact resulting buffer for both the Claude call and the eventual persisted file (Pattern 2). There is then only one coordinate space in the entire pipeline.

**Warning signs:** Manual UAT testing with a phone photo shot in portrait orientation shows a face rotated 90°/upside-down in the final stored image, with the blur region visibly offset from the actual face position.

**Phase to address:** This phase — `src/services/faceBlur.js`'s canonicalization step.

---

### Pitfall 2: A single-pass, low-effort vision call is not a verified-reliable face detector — false negatives are a genuine privacy risk, not just an accuracy nuisance

**What goes wrong:** Treating the Claude vision call's `faces` output as ground truth. Anthropic's own documentation is explicit that this is not warranted: *"Claude's coordinate and localization outputs are approximate"* and *"Claude might hallucinate or make mistakes when interpreting low-quality, rotated, or very small images"* (`[CITED: vision.md → Limitations]`). A missed face (false negative) in this app is not a cosmetic bug — it means an unblurred, identifiable face gets persisted to disk, directly violating the project's AI Ethics constraint.

**Why it happens:** General-purpose vision-language models are not purpose-built face detectors; they can miss small, partially-occluded, side-profile, or background faces, especially in a photo whose main subject is a waste bin, not a person.

**How to avoid (defense-in-depth, not a single fix):**
1. Pad every detected box generously (18% recommended in Pattern 3) so a slightly-undersized detection still fully covers the face.
2. Do not run this at `effort: 'xhigh'`/`'max'` expecting materially better localization without validating that assumption — the existing code already runs at `effort: 'low'`, `thinking: 'disabled'`, which remains a *valid* configuration on `claude-opus-5` (`[CITED: shared/model-migration.md → Error Codes, from the claude-api skill loaded this session]` — disabling thinking is accepted at `effort: 'high'` or below, and `'low'` qualifies) — raising effort is not a prerequisite, but this phase's plan should include a UAT pass specifically testing photos with small/partial/background faces before treating this as solved.
3. Treat this as an explicitly flagged, not-fully-resolved risk in the plan (see Assumptions Log and Open Question #3) rather than presenting "extend the Claude call" as a closed question — CONTEXT.md itself only asked this research to *confirm the approach is sound*, and the honest confirmation is "sound as an MVP starting point, with a real, documented, non-zero false-negative risk that should be tracked."

**Warning signs:** UAT photos containing a partially-visible person (background, side profile, small in frame) come back with `faces: []` when a face is clearly present.

**Phase to address:** This phase implements the mitigations (padding, UAT pass); a follow-up phase should own the decision of whether a dedicated detector is eventually needed (Open Question #3).

---

### Pitfall 3: The existing proof-of-concept's error handling conflates "the API call itself failed" with "the AI legitimately couldn't classify" — a direct conflict with D-08

**What goes wrong:** `[VERIFIED: src/services/wasteImageClassifier.js:52-103, read this session]` — `classifyWasteImage`'s `try { ... } catch (err) { return { wasteType: UNCLASSIFIED, urgency: UNCLASSIFIED, coveragePercentage: null, noWasteDetected: false, error: err.message }; }` wraps the *entire* Anthropic API call. Any error the SDK throws — a network failure, a rate limit (429), a 5xx from Anthropic, a timeout — is caught here and converted into the exact same return shape as a legitimate "AI declined/couldn't parse the image" outcome. `src/routes/classify.js`'s route handler (`[VERIFIED: src/routes/classify.js:25-26]`) then does `res.json(result)` unconditionally — always a 200, regardless of which case occurred.

**Why it happens:** The proof-of-concept predates this phase's CONTEXT.md and its D-08 decision — at the time it was written, there was no requirement yet to distinguish these two outcomes, so a single broad `catch` was a reasonable simplification.

**How to avoid:** Split the try/catch boundary. Let the Anthropic API call itself (network/SDK-level failures) propagate as a genuine error the route handler turns into a 5xx response; keep the *response-shape* handling (refusal, missing text block, JSON parse failure of a well-formed HTTP response) resolving to `UNCLASSIFIED` with a 200, exactly as today. Concretely: move the `client.messages.create(...)` call outside a narrow try/catch (or catch it separately and `throw`/`next(err)` rather than return a sentinel), while keeping the "did the response parse into something usable" logic — which is a *content* judgment, not a *request* failure — resolving to `UNCLASSIFIED` as it does now.

**Warning signs:** A test that mocks the Anthropic SDK to reject (simulating a network failure) and asserts the endpoint returns a non-2xx status will fail against the current code, because it currently always returns 200.

**Phase to address:** This phase — directly required by locked decision D-08 ("a failed request is not silently treated as unclassified"). This is a fix to reused code, not new code, and should be called out explicitly as such in the plan so it isn't mistaken for scope creep.

---

### Pitfall 4: `sharp`'s `blur()` sigma parameter is not "0-100" or a simple pixel radius — get the mapping wrong and "strong blur" silently does very little

**What goes wrong:** `[CITED: sharp.pixelplumbing.com/api-operation`, fetched this session]` — `blur()`'s `sigma` parameter ranges `0.3` to `1000`, and *"sigma = 1 + radius / 2"* is the documented relationship to a more intuitive "radius" concept. A developer reaching for `blur()` and passing a small integer (e.g. `blur(5)`) gets a real but moderate blur — exactly the "5-10px" strength the anonymization research (Alternatives Considered, above) flags as having documented reversal attacks.

**Why it happens:** Many image libraries use "radius" as the blur parameter name; `sharp` uses "sigma," a related but not identical unit, and the mapping is easy to skip past.

**How to avoid:** This phase's Primary Recommendation is pixelation, not blur, specifically to sidestep needing to reason about "how large a sigma is large enough" — pixelation's safety property (destroyed pixel data) doesn't depend on tuning a continuous parameter the way blur's does. If blur is used as a fallback for a softer look, use a large, deliberately-chosen sigma (≥15-20) rather than a small "looks blurred enough visually" value, and treat the sigma-to-radius formula above as load-bearing when documenting the choice.

**Phase to address:** This phase, if the plan opts for the blur fallback in Pattern 3 instead of the primary pixelation recommendation.

## Code Examples

### Extended classify.js route handler (integrates Patterns 1-6)

```javascript
// src/routes/classify.js -- sketch of the extended handler
const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs/promises');
const sharp = require('sharp');
const { classifyWasteImage } = require('../services/wasteImageClassifier');
const { detectImageType } = require('../services/imageType');
const { canonicalize } = require('../services/faceBlur'); // Pattern 2
const { pixelateFaces } = require('../services/faceBlur'); // Pattern 3

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_SIZE_BYTES } });
const router = express.Router();

router.post('/api/waste-reports/classify', upload.single('image'), async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ error: 'กรุณาแนบรูปภาพ (field name: image)' });
  }

  const mediaType = detectImageType(req.file.buffer);
  if (!mediaType) {
    return res.status(400).json({ error: 'ชนิดไฟล์ไม่รองรับ อนุญาตเฉพาะ .jpg, .jpeg, .png, .webp เท่านั้น' });
  }

  try {
    const { buffer: canonicalBuffer, width, height } = await canonicalize(req.file.buffer);

    // classifyWasteImage now throws on genuine API/network failure (Pitfall #3 fix)
    // and resolves to UNCLASSIFIED (no throw) for response-shape issues, as before.
    const result = await classifyWasteImage(canonicalBuffer, mediaType);

    const finalBuffer = await pixelateFaces(canonicalBuffer, result.faces, width, height);
    const imageId = `${crypto.randomUUID()}.jpg`;
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
    await fs.writeFile(path.join(UPLOADS_DIR, imageId), finalBuffer);
    // canonicalBuffer / req.file.buffer are never written anywhere -- only finalBuffer is.

    res.json({ ...result, imageId });
  } catch (err) {
    next(err); // genuine failure -- let error middleware return 5xx (D-08 "ลองใหม่" path)
  }
});

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'ขนาดไฟล์เกิน 5MB' });
  }
  next(err);
});

module.exports = router;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Normalized (0-1000 grid) coordinates for vision-model object localization, a convention carried over from other providers' vision APIs | Absolute pixel coordinates, explicitly recommended by Anthropic for Claude | Documented as current guidance as of this session's fetch | Directly relevant here: a developer reaching for the "usual" normalized-grid pattern from memory/other-API experience would get materially worse localization on Claude per Anthropic's own docs. |
| Standard-tier vision resolution (1568px / 1568 tokens) as the assumed ceiling | High-resolution tier (2576px / 4784 tokens) automatic on Claude 4.7-and-later models, including `claude-opus-5`, no beta header | Rolled out with the 4.7 model generation | Materially improves face-detection viability on typical phone photos (which are usually well above 1568px on the long edge) — coordinates map more precisely at this tier, per Anthropic's own "coordinates map 1:1 to pixels" framing for this tier. |
| Manually computing a scale factor between original and API-resized image dimensions | Anthropic-published, language-ported `resizedSize()` reference algorithm, used to pre-resize so no scale-factor math is needed at all | Current guidance as of this session's fetch | Removes an entire class of "coordinates are slightly off" bugs that a hand-rolled scale-factor approach is prone to (the A4-scan worked example in the docs exists specifically to warn about this). |

**Deprecated/outdated:** none directly superseding a prior phase decision — this is new functionality, not a migration.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 18% bounding-box padding and a 12-block pixelation density are reasonable starting defaults | Architecture Patterns → Pattern 3 | Low-Medium — both are tunable constants with no other code depending on their exact values; wrong-in-practice values surface directly in UAT as "still see a sliver of face" (too little padding) or "pixelation too coarse/fine" (density), and are a one-line change to correct. |
| A2 | A single Claude vision call at `effort: 'low'`, `thinking: 'disabled'` is an acceptable configuration for face-detection reliability in an MVP, deferring a dedicated detector to a later decision | Common Pitfalls → Pitfall 2, Open Question #3 | **Medium-High** — this is the single highest-consequence assumption in this document. If false-negative face detection proves common in real photos, unblurred faces get persisted, directly violating the project's AI Ethics constraint. Mitigated by generous padding (A1) and an explicit UAT requirement, but not eliminated. Flagged, not silently assumed away. |
| A3 | `sharp` installs cleanly on this Windows x64 machine via its standard prebuilt-binary distribution, with no native compilation step required | Environment Availability | Low — `sharp`'s packaging has shipped prebuilt `win32-x64` binaries for many major versions; not independently verified by actually running `npm install` this session (out of scope for a research-only pass). If wrong, Wave 0's first task (install + smoke test) surfaces it immediately and cheaply. |
| A4 | `aggregateUrgency()`'s "max severity among classified photos, ignore unclassified photos" rule is the right report-level semantics | Architecture Patterns → Pattern 4 | Low-Medium — this is a genuinely under-specified area (CONTEXT.md explicitly left it to planning); the chosen rule is defensible and matches SPEC's "urgent items must be visually obvious" intent, but is this document's own synthesis, not sourced from an authority. Wrong only in the sense of possibly not matching a stakeholder's unstated intent — cheap to change later since it's a single pure function. |
| A5 | `sharp` supports direct CommonJS `require()` with no ESM-interop friction (unlike `file-type`) | Standard Stack | Low — consistent with CLAUDE.md's own stack table (which flags `file-type`'s ESM-only status explicitly but has no such caveat for `sharp`), and with this package's long-standing CJS-compatible packaging; not independently re-verified via a fresh install this session. |

## Open Questions

1. **Does Phase 2 itself write the blurred image file to disk, or does it stay fully memory-only and defer all disk writes to Phase 3?**
   - What we know: CONTEXT.md's Phase Boundary says this phase does not persist the *report record* (`waste-reports.json`) — Phase 3's job. It does NOT say image files aren't written. The phase's own success criterion #2 says face-blur happens "ก่อนบันทึกไฟล์จริงเสมอ" (before the real file is saved, always), which only has teeth if *this* phase is the one doing that save. CLAUDE.md's stack guidance for `sharp` groups resize/EXIF-strip/face-blur together as one job feeding directly into file storage.
   - What's unclear: whether the planner might instead prefer a fully memory-only classify pass in Phase 2 (returning only classification results, discarding all image bytes after responding) with the *actual* upload+blur+persist round-trip deferred to a real "submit" action Phase 3 introduces — which would mean re-uploading the same file bytes a second time at submit, and re-running classify+blur then.
   - Recommendation: this document's Primary Recommendation is the first option (persist the blurred file now, in Phase 2, referenced by a generated `imageId` the eventual Phase 3 report record can point to) — it avoids re-implementing the entire upload/classify/blur pipeline a second time in Phase 3, avoids re-paying the Claude API cost per photo a second time, and is the more natural reading of "blur before the file is ever persisted" as this phase's own action, not a future phase's. The accepted tradeoff (orphaned files from abandoned forms, see Pattern 6) is a known, common pattern in upload-then-attach flows and not, on its own, a reason to prefer the more complex two-round-trip alternative. Flagged as a genuine fork the planner should confirm explicitly, since CONTEXT.md's Claude's-Discretion section named the *blur mechanics* as open but did not explicitly name *this* timing question.

2. **Does this phase's UI need to show a single aggregated report-level urgency anywhere, or only per-photo results?**
   - What we know: D-06/D-07 describe per-slot display (each photo's own thumbnail + classification result). None of this phase's five success criteria mention a combined/report-level indicator being visible to the *reporter* — QUEUE-02's "แสดงเด่นชัดและเรียงลำดับบนสุด" (prominent display, sorted to top) is explicitly a Phase 4 *officer* requirement, not a Phase 2 reporter-facing one.
   - What's unclear: whether product wants the reporter to also see a "this report will be treated as [urgency]" summary somewhere on the single-page form once multiple photos are classified, even though no success criterion requires it.
   - Recommendation: implement `aggregateUrgency()` (Pattern 4) as a tested utility function this phase, but do not build reporter-facing UI for the aggregate unless the plan/UI-phase decides it's wanted — the phase's literal success criteria are satisfied by per-photo display alone, and adding UI for an unrequested aggregate view would be scope creep the plan should call out explicitly if added.

3. **Should a dedicated face-detection fallback (or a lower threshold / more conservative "when in doubt, blur it" bias) be added if UAT reveals real false-negative gaps in Claude's face detection?**
   - What we know: Pitfall #2 documents that this is a real, Anthropic-acknowledged limitation, not a hypothetical one. This document's mitigations (padding, explicit UAT requirement) reduce but do not eliminate the risk.
   - What's unclear: what an acceptable false-negative rate looks like for this project, and whether it's something that can even be meaningfully measured without a labeled test set of real photos containing faces in varied conditions (which does not currently exist in this repo).
   - Recommendation: not resolved here — this is explicitly a "confirm the approach is sound" research question per CONTEXT.md, and the honest answer is "sound to start with, with a known and documented gap." Recommend the plan include a dedicated UAT checklist item specifically testing photos with small, partial, and background faces before this feature ships, and treat any UAT failures here as a signal to revisit CLAUDE.md's already-flagged self-hosted-detector alternative rather than as a bug in this phase's implementation.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | ✓ | v24.18.0 | — `[VERIFIED: node --version, this session]` |
| npm | Package install | ✓ | 11.16.0 | — `[VERIFIED: npm --version, this session]` |
| `sharp` native bindings (libvips) | Face-blur/canonicalization pipeline | Not verified by an actual install this session (research-only pass) — platform confirmed `win32/x64` `[VERIFIED: node -e "console.log(process.platform, process.arch)", this session]`, and `sharp` has shipped prebuilt `win32-x64` binaries for many major versions `[ASSUMED — general packaging knowledge, not independently re-verified this session; see Assumptions Log A3]` | 0.35.3 (target) | If prebuilt binary install fails, `sharp`'s docs document a `--build-from-source` fallback requiring a C++ toolchain — treat as a Wave 0 blocking checkpoint if it comes to that, not a silent workaround. |
| `ANTHROPIC_API_KEY` | Extended `classifyWasteImage` call | Present in `.env.example` as an empty key name (`ANTHROPIC_API_KEY=`) `[VERIFIED: .env.example, read this session]` — actual key value not checked (out of scope; a secret) | — | None — this is the same existing dependency the proof-of-concept already requires; no new environment setup beyond what Phase 1/pre-roadmap already needed. |

**Missing dependencies with no fallback:** none identified for this phase specifically — `sharp`'s install is the only real unknown, and it has a documented (if less convenient) fallback path.
**Missing dependencies with fallback:** `sharp` native-binding install, if it doesn't resolve via the standard prebuilt path on this Windows machine.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `node:test` (built-in) + `supertest@^7.2.2` — both already installed and established in Phase 1 |
| Config file | none — same as Phase 1 |
| Quick run command | `node --test test/classify.test.js` (new file this phase) |
| Full suite command | `node --test` |

`[VERIFIED: package.json devDependencies, read this session — supertest already present; test/report.test.js and test/qrScript.test.js already exist and use this exact pattern]`. **Notable gap found this session:** there is currently **zero** test coverage for `src/routes/classify.js`, `src/services/wasteImageClassifier.js`, or `src/services/imageType.js` — the existing proof-of-concept predates this project's test infrastructure entirely. This is a from-scratch Wave 0 for this phase's core logic, not an extension of existing coverage.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PHOTO-01 | Rejects a file whose magic bytes don't match an allowed image type, even with a spoofed `.jpg` extension/`Content-Type` | unit/integration | `node --test test/classify.test.js` (supertest: POST a text file renamed `.jpg`, assert 400) | ❌ Wave 0 |
| PHOTO-01 | Rejects a file over 5MB | integration | same file (supertest, oversized buffer) | ❌ Wave 0 |
| PHOTO-01 | Accepts each of .jpg/.jpeg/.png/.webp | integration | same file, table-driven case per format | ❌ Wave 0 |
| PHOTO-02 | The persisted file at the returned `imageId` never byte-matches the raw uploaded buffer when a face was present in a known test fixture | integration | `node --test test/classify.test.js`, using a small fixture image with a synthetic/real detectable face | ❌ Wave 0 — **also needs a test fixture image with a face**, which does not exist in the repo today |
| PHOTO-02 | The raw uploaded buffer is never written to disk under any code path (grep-based or spy-based assertion, mirroring `01-*`'s source-assertion pattern) | unit (source-level assertion, no browser/server needed) | `node --test test/classify.test.js` | ❌ Wave 0 |
| AI-01 | Response includes `wasteType` immediately, synchronously with the classify response (no separate polling) | integration | same file | ❌ Wave 0 |
| AI-02 | `deriveUrgency()`'s three-tier threshold behavior against `config/ai-thresholds.json`'s actual values | unit — pure function, no network | `node --test test/classify.test.js` | ❌ Wave 0 (function exists, `[VERIFIED: src/services/wasteImageClassifier.js:37-45]`, but has never been unit-tested) |
| AI-02 (new) | `aggregateUrgency()` returns max severity across classified photos, ignoring unclassified ones; returns `unclassified` only when all inputs are unclassified | unit — pure function | `node --test test/classify.test.js` | ❌ Wave 0 (new function, Pattern 4) |
| AI-03 | A classify response with `wasteType: 'unclassified'` still returns HTTP 200 (does not block) | integration | same file — **manual-only for the "real AI genuinely can't classify" case** (non-deterministic against the live model); fully automatable by asserting the *response shape/status* when the classifier resolves to `UNCLASSIFIED` via a mocked/stubbed classify function | ❌ Wave 0 |
| PHOTO-02 / AI-03 (Pitfall #3) | A genuine Anthropic API/network failure (mocked SDK rejection) returns a non-2xx status, distinct from an `unclassified` 200 | integration | `node --test test/classify.test.js`, mocking `client.messages.create` to reject | ❌ Wave 0 — this is the regression test for the D-08 fix |

### Sampling Rate
- **Per task commit:** `node --test test/classify.test.js` (fast — mocked/fixture-based, no live Claude API calls in the default run)
- **Per wave merge:** `node --test` (full suite, including Phase 1's existing tests)
- **Phase gate:** Full suite green, plus the manual UAT pass from Open Question #3 (small/partial/background face photos) before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `test/classify.test.js` — covers PHOTO-01/PHOTO-02/AI-01/AI-02/AI-03 per the table above, using mocked Anthropic responses for the deterministic cases and (optionally, manually gated) live-API cases for genuine end-to-end confidence
- [ ] A test fixture image containing a detectable face (synthetic or a rights-cleared real photo) — does not exist in the repo; needed for PHOTO-02's positive-detection test
- [ ] `src/services/faceBlur.js` — new module (Patterns 2/3), currently does not exist
- [ ] Framework install: `npm install sharp@0.35.3` — the only new install this phase needs
- [ ] `uploads/` directory creation (runtime-created via `fs.mkdir(..., {recursive: true})`, not committed) + `.gitignore` entry

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Unchanged from Phase 1 — no login anywhere in this system by design. |
| V3 Session Management | No | No sessions created in this phase. |
| V4 Access Control | No | No privileged actions in this phase's scope. |
| V5 Validation, Sanitization and Encoding | Yes | Magic-byte MIME check (`imageType.js`, reused), 5MB size limit (multer, reused), face bounding-box coordinates clamped to image bounds in application code before any `sharp` geometry operation (never trust raw model output for `extract()` region math — an out-of-bounds region throws, and a hostile/hallucinated coordinate should never reach that call unclamped). |
| V6 Stored Cryptography | Yes (narrow) | `crypto.randomUUID()` (built-in) for persisted image filenames — unguessable, no path-traversal surface since the filename is never derived from user input. |
| V7 Error Handling and Logging | Yes (light) | The Pitfall #3 fix means genuine API/network failures now surface distinctly (5xx) rather than being silently swallowed — this is itself a security-relevant change (previously, a failed Anthropic call was invisible to any monitoring, indistinguishable from a normal "unclassified" outcome in logs). |

### Known Threat Patterns for this phase's stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malicious file content disguised with an image extension/declared MIME type (e.g., a script or malformed file renamed `.jpg`) | Spoofing / Tampering | Magic-byte detection via `imageType.js` (reused, unchanged) — this is already the project's established, correct defense; no new work needed beyond keeping it in the pipeline. |
| An un-blurred original ever being written to disk or otherwise persisted | Information Disclosure (PII) | Structural: only the post-composite `finalBuffer` is ever passed to a disk-write call (Pattern 3's hard requirement); recommend a code-review/grep check specifically for this as part of this phase's verification step. |
| Decompression-bomb-style image (small file size, extreme pixel dimensions) causing memory/CPU exhaustion during `sharp` processing | Denial of Service | `[ASSUMED — not independently verified this session]` `sharp`/libvips ships a default input-pixel-count limit (`limitInputPixels`) intended to guard against exactly this; the plan should explicitly confirm this default is not disabled anywhere in the implementation, as defense-in-depth alongside the existing 5MB file-size cap (a large-pixel-count image can still have a small compressed file size for some formats). |
| Face bounding-box coordinates from the model used directly in `sharp.extract()` without bounds-checking, causing a thrown error / potential crash on a hallucinated or malformed value | Denial of Service (minor) | Clamp every coordinate to `[0, imageWidth]`/`[0, imageHeight]` and treat a degenerate (zero-or-negative-area) box as "skip this face, don't crash the request" (shown in Pattern 3's `pixelateFace` sketch) — matches the existing guard-first, sentinel-return convention already established in `imageType.js`/`wasteImageClassifier.js`. |
| Transmission of an un-blurred image (necessarily, for detection) to a third-party API (Anthropic) before local blurring can occur | Information Disclosure | Accepted, structural characteristic of the "extend the Claude Vision call" architecture CONTEXT.md pre-endorsed — mitigated by Anthropic's documented policy that uploaded images are ephemeral (`[CITED: vision.md FAQ]` — "Image uploads are ephemeral and not stored beyond the duration of the API request... automatically deleted after they have been processed... Anthropic does not use uploaded images to train models"). This is a *transmission-for-processing* concern, distinct from the *retention* concern the project's AI Ethics constraint is about — the two are not in conflict, but worth documenting explicitly since a reviewer could otherwise reasonably ask "wait, doesn't sending the original image to Claude defeat the purpose?" |
| Multer denial-of-service CVEs (aborted-upload cleanup, deeply-nested multipart field names) | Denial of Service | `[CITED: GitLab advisory database, WebSearch this session]` — CVE-2026-5079/5038/3304/2359/3520 affect multer versions `< 2.2.0`; this project's pinned `^2.2.0` (`[VERIFIED: package.json, read this session — "multer": "^2.2.0"; npm view multer version → 2.2.0 installed]`) is at or above every disclosed fix version found this session. `[MEDIUM confidence — WebSearch-sourced advisory summaries, not independently cross-checked against multer's own changelog this session]`; recommend `npm audit` as a cheap Wave 0 sanity check rather than treating this as fully closed on WebSearch alone. |

## Sources

### Primary (HIGH confidence — direct execution/reads against this project's actual code and toolchain, this session)
- This repo, read directly this session: `.planning/phases/02-photo-upload-face-blur-ai-classification/02-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/PROJECT.md`, `.planning/ROADMAP.md`, `.planning/config.json`, `.claude/CLAUDE.md`, `SPEC.md`, `src/services/wasteImageClassifier.js`, `src/services/imageType.js`, `src/routes/classify.js`, `src/routes/report.js`, `src/services/locationStore.js`, `src/services/qrSignature.js`, `config/ai-thresholds.json`, `package.json`, `.env.example`, `.gitignore`, `views/report.ejs`, `public/js/report.js`, `public/css/report.css`, `test/report.test.js`, `.planning/phases/01-location-submission-entry/01-CONTEXT.md`, `01-RESEARCH.md`, `01-SECURITY.md`, `01-UI-SPEC.md`.
- `node --version`, `npm --version`, `node -e "console.log(process.platform, process.arch)"` — run live this session on the actual dev machine (Windows, win32/x64).
- `npm view <pkg> version|engines|type` for `sharp`, `file-type`, `multer` — run live this session, 2026-08-20.
- `gsd-tools query package-legitimacy check --ecosystem npm sharp file-type write-file-atomic proper-lockfile express-rate-limit sanitize-html helmet` — run live this session.

### Secondary (MEDIUM confidence — official docs fetched and quoted this session)
- [Claude Vision guide](https://platform.claude.com/docs/en/build-with-claude/vision) — image resize/token-cost rules, resolution tiers, request/size limits, EXIF-metadata-not-read confirmation, spatial-reasoning limitations — fetched and quoted this session.
- [Claude Coordinates and bounding boxes guide](https://platform.claude.com/docs/en/build-with-claude/vision-coordinates) — pixel-vs-normalized coordinate recommendation, exact resize/pad algorithm with TypeScript reference implementation, rescale-after alternative — fetched and quoted this session.
- [sharp: Image operations](https://sharp.pixelplumbing.com/api-operation) — `blur()` sigma parameter and range, `rotate()`/`autoOrient()` EXIF behavior — fetched this session.
- [sharp: Output options](https://sharp.pixelplumbing.com/api-output) — default metadata-stripping behavior, `withMetadata()`/`keepMetadata()`/`keepExif()` — fetched this session.
- [sharp: Resizing images](https://sharp.pixelplumbing.com/api-resize) — `kernel` option values including `nearest`, default `lanczos3` — fetched this session.
- [sharp: Compositing images](https://sharp.pixelplumbing.com/api-composite) — `composite()` signature, `left`/`top`/`blend` — fetched this session.
- `claude-api` skill (loaded this session via the Skill tool, per the mandatory Anthropic-topic trigger) — `output_config.effort`/`thinking: disabled` interaction and 400 conditions on `claude-opus-5`, structured-outputs JSON-Schema limitations (no `minimum`/`maximum`), current model pricing table.

### Tertiary (LOW-MEDIUM confidence — WebSearch-aggregated, multiple independent sources, not independently cross-checked against a single formal spec)
- Face-anonymization reversibility research: Fantômas (arXiv 2210.10651 / PETS 2024), IEEE "Real-Time Face Anonymization Using Gaussian Blur and Pixelation," Gallio.pro "Blur or Pixelate" and "Is face blurring irreversible" — converged on the same directional finding (pixelation more irreversible than light-moderate Gaussian blur) across independent sources.
- `sharp` extract/blur/composite face-blur pattern — WebSearch summary corroborating (not contradicting) the directly-fetched official API docs above; used only to confirm the *combination* pattern, not any individual API signature (those are all Secondary/CITED).
- Multer 2026 CVE advisories (GitLab advisory database via WebSearch) — see Security Domain table; recommend `npm audit` as a cheap independent confirmation at execution time.

## Metadata

**Confidence breakdown:**
- Coordinate-mapping mechanics (pixel-vs-normalized, resize algorithm, EXIF-not-read): HIGH — directly fetched and quoted from Anthropic's own current documentation this session, including a worked example (the A4 scan) that specifically contradicts a plausible naive implementation.
- `sharp` API mechanics (blur/rotate/resize/composite/metadata defaults): HIGH — directly fetched and quoted from `sharp`'s own official documentation this session.
- Pitfall #3 (existing code's error-handling gap relative to D-08): HIGH — directly read and verified against the actual file this session, not inferred.
- Face-blur strength/method recommendation (pixelation over blur): MEDIUM — WebSearch-aggregated across multiple independent academic/industry sources that converge on the same conclusion, but not a single formal specification.
- Face-detection reliability (Pitfall #2, Open Question #3): explicitly flagged as the weakest-confidence, highest-consequence area in this document — Anthropic's own docs confirm the limitation exists, but this session has no way to benchmark actual false-negative rates against real photos.
- Multi-photo urgency aggregation design (Pattern 4): MEDIUM — a reasoned synthesis grounded in verified existing code/enum values, not sourced from an external authority (none applies to an app-specific design choice).

**Research date:** 2026-08-20
**Valid until:** 2026-09-19 (30 days — re-verify `sharp` version via `npm view` at execution time regardless; the Claude vision/coordinates docs are a fast-moving area given the model-generation-tied resolution-tier changes documented above, so a stale re-read risk is real if implementation slips well past this window).
