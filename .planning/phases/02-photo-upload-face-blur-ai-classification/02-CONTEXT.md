# Phase 2: Photo Upload, Face-Blur & AI Classification - Context

**Gathered:** 2026-08-20
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers safe photo attachment (1-3 images, real magic-byte MIME check, ≤5MB each) integrated directly into the existing Phase 1 report form, automatic face-blur applied to any face detected before a file is ever persisted, and immediate AI waste-type/urgency classification shown to the reporter per photo — reusing the existing proof-of-concept (`src/services/wasteImageClassifier.js`, `POST /api/waste-reports/classify`, `config/ai-thresholds.json`) rather than rebuilding it.

**Out of scope for this phase** (belongs to later phases): actually persisting the report to `waste-reports.json` (Phase 3 — this phase does not write any report record, only classifies photos and shows results); the officer queue and any UI that lets staff edit/correct AI results (Phase 4); LINE notifications (Phase 5); rate limiting and dedup detection (Phase 6).

</domain>

<decisions>
## Implementation Decisions

### Photo attach flow
- **D-01:** Photo attachment lives on the same single-page form as the location and note fields from Phase 1 — no separate step or wizard page. The existing "ถัดไป" button and page structure stay a single page.
- **D-02:** The form shows one fixed photo slot plus a "+ เพิ่มรูป" (add photo) control that reveals another slot, one at a time, up to a maximum of 3 — not three empty slots shown upfront.
- **D-03:** Each attached photo can be removed or replaced (an X/change control on that slot) before submit — not "remove only, re-add from scratch."
- **D-04:** The "ถัดไป" button (which already calls `POST /api/waste-reports/validate` per Phase 1) must be blocked from proceeding until at least 1 photo is attached — enforced both client-side (immediate feedback) and server-side (so it cannot be bypassed via curl/devtools), matching SPEC's edge case "ไม่ได้แนบรูปภาพ → ปฏิเสธการ submit."

### Upload/classify UX timing
- **D-05:** Each photo is sent for AI classification immediately after the user selects the file for that slot — not batched and not deferred until a separate "check" button. This directly satisfies AI-01's "แสดงผลทันทีหลังอัปโหลด."
- **D-06:** While a photo's classification request is in flight, that slot shows the selected image thumbnail immediately with a spinner/overlay on top of it — not just a text-only "loading" state with no image visible.
- **D-07:** The AI's classification result (waste type + urgency) is display-only to the reporter in this phase — the reporter cannot edit or override it here. Correcting AI output is staff's job in the Phase 4 officer queue, consistent with PROJECT.md's AI Ethics constraint ("การตัดสินใจสุดท้ายเป็นหน้าที่เจ้าหน้าที่เสมอ").
- **D-08:** A genuine request failure (network error, server 5xx — NOT the AI returning "can't classify") shows an inline error with a "ลองใหม่" (retry) control at that specific photo slot. This is a distinct UX path from AI-03's `unclassified` outcome — a failed *request* is not silently treated as `unclassified`.

### Claude's Discretion
- **Face-blur implementation approach** — not selected for discussion. `.claude/CLAUDE.md` already carries a strong recommendation (extend the existing Claude Vision classify call to also return face bounding boxes, then blur with `sharp`, rather than a self-hosted face-detection model). Research/planning should confirm this approach and work out the details: blur strength/method, and the hard requirement that an un-blurred original is never written to disk or persisted anywhere (PROJECT.md AI Ethics: "ไม่เก็บข้อมูลส่วนบุคคลที่ไม่จำเป็น").
- **Multi-photo urgency aggregation** — not selected for discussion. SPEC and REQUIREMENTS describe classification/urgency per photo but do not address how 2-3 photos' independent `coverage_percentage` values should combine into a single report-level urgency (e.g., max across photos, since the existing `deriveUrgency()` in `wasteImageClassifier.js` currently operates on one `coverage_percentage` value). Left to planning, grounded in the existing single-photo threshold logic.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & scope
- `SPEC.md` — master spec; §"AI วิเคราะห์ภาพ" (classification/urgency rules, thresholds), §"Security & AI Ethics" (face-blur requirement, file-type/size limits, AI-as-advisory), §"Edge Cases" (no-photo-attached rejection, AI-can't-classify handling)
- `.planning/PROJECT.md` — Core Value, AI Ethics constraint (final decision is always staff's; face-blur required)
- `.planning/REQUIREMENTS.md` — PHOTO-01, PHOTO-02, AI-01, AI-02, AI-03, mapped to this phase
- `.planning/ROADMAP.md` — Phase 2 goal and success criteria (explicitly: build on the existing proof-of-concept, don't rebuild it)

### Stack guidance
- `.claude/CLAUDE.md` — face-blur approach recommendation (extend the Claude Vision call for bounding boxes + `sharp` for blurring, vs. the heavier self-hosted alternative); `sharp` for EXIF-stripping and resizing; `multer` memoryStorage pattern already in use

### Prior phase context
- `.planning/phases/01-location-submission-entry/01-CONTEXT.md` — Phase 1 decisions this phase's form extends (D-07: same field area regardless of entry path; the form's overall structure)
- `.planning/phases/01-location-submission-entry/01-UI-SPEC.md` — the existing design contract (palette, spacing scale, type scale, `.is-hidden` utility, focus-ring pattern) that new photo-slot UI must stay consistent with

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/services/wasteImageClassifier.js` — `classifyWasteImage(imageBuffer, mediaType)` returns `{wasteType, urgency, coveragePercentage, noWasteDetected}`; `deriveUrgency(coveragePercentage)` reads thresholds from `config/ai-thresholds.json` at call time; `WASTE_TYPES`, `UNCLASSIFIED` exported. This is the proof-of-concept the phase goal explicitly says to build on, not duplicate.
- `src/services/imageType.js` — `detectImageType(buffer)` does magic-byte detection for jpeg/png/webp, returning `null` for anything else. Directly satisfies PHOTO-01's "ตรวจสอบ MIME type จริงจากไฟล์" requirement — reuse as-is.
- `src/routes/classify.js` — existing `POST /api/waste-reports/classify` route: `multer({storage: multer.memoryStorage(), limits: {fileSize: 5*1024*1024}})`, single `image` field, calls `detectImageType` then `classifyWasteImage`, returns JSON. This is the working end-to-end pattern (upload → magic-byte check → classify → JSON response) this phase's per-photo upload should follow or directly reuse.
- `config/ai-thresholds.json` — `{urgentMinPercent: 80, actionNeededMinPercent: 50}`, admin-tunable, already wired into `deriveUrgency`.
- `views/report.ejs`, `public/js/report.js`, `public/css/report.css` — the Phase 1 single-page form (location block, note field, CTA) this phase adds photo-slot markup/behavior/styles into.

### Established Patterns
- Guard-first validation returning a safe sentinel (`null`/`UNCLASSIFIED`) rather than throwing — used throughout `imageType.js` and `wasteImageClassifier.js`; new code should match.
- Router mounted via bare `app.use(router)` in `index.js`, no path prefix (each router declares its own full paths) — established by both `classifyRouter` and `reportRouter`.
- Client-side JS uses guarded element lookups and `textContent`-only DOM writes (never `innerHTML`) — established in `public/js/report.js` during Phase 1, security-relevant, should extend to any new photo-slot script.
- EJS escaping output tag (`<%= %>`) on every interpolation, never the unescaped tag — established and source-asserted in Phase 1.

### Integration Points
- `views/report.ejs` needs new photo-slot markup (exact placement within the form left to planning/UI-phase, not locked here).
- `public/js/report.js` needs new upload/classify/retry logic, following the existing guarded-lookup, no-`innerHTML` style.
- `index.js` already mounts `classifyRouter`; this phase likely extends or reuses that router's endpoint for per-photo classify calls from the report form (currently `POST /api/waste-reports/classify` is a generic classify endpoint, not yet wired to the report flow's per-slot UX).
- `multer` is already configured with `memoryStorage` and a 5MB limit in `classify.js` — the established size/type constraints (PHOTO-01) should carry over rather than being redefined.

</code_context>

<specifics>
## Specific Ideas

- The "+ เพิ่มรูป" incremental-slot pattern (not three empty slots shown at once) was a specific UX call — keep the initial view minimal.
- The spinner sits directly over the already-visible thumbnail, not a separate "checking..." text state with no image.
- "ลองใหม่" (retry) is scoped to the individual photo slot that failed, not a whole-form retry.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 2-Photo Upload, Face-Blur & AI Classification*
*Context gathered: 2026-08-20*
