# Phase 1: Location & Submission Entry - Context

**Gathered:** 2026-08-19
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers the entry point into the waste-reporting flow: how a user (no login required) arrives at the report form with a **validated location** attached — either by scanning a registered QR code, or by picking a registered point from a dropdown when entering the form directly. It also covers the optional `note` field (≤500 chars) and the page-load/responsive performance bar (FCP ≤2s on 4G, correct rendering at 375px/768px/1024px).

**Out of scope for this phase** (belongs to later phases): photo upload, face-blur, AI classification, persisting the report to `waste-reports.json`, the officer queue/status dashboard, LINE notifications, rate limiting, and dedup detection. It's also out of scope to build an admin UI for registering new locations — that's a future scalability item per SPEC.md; Phase 1 works off a hand-maintained seed file instead.

</domain>

<decisions>
## Implementation Decisions

### Location registry source
- **D-01:** Registered locations for Phase 1 live in a hand-maintained JSON seed file, `config/locations.json` (same convention as the existing `config/ai-thresholds.json`) — not a database, not an admin UI. — **Reversibility:** costly — **rationale:** once the manual/dropdown flow and QR generation are built against this file's shape, migrating to an admin-managed store later means rewriting the read path and adding a write/registration path.
- **D-02:** Each location record has the minimum fields implied by SPEC.md: `location_id`, `name`, `lat`, `lng`. No `building`/`zone` grouping field for Phase 1.
- **D-03:** Seed data uses placeholder names (e.g., "จุด A", "หอพัก 1") for now — the user will supply the real campus location names later; the seed file should be easy to hand-edit/replace with real data without code changes.
- **D-04:** Seed 5 sample locations initially — enough to exercise both the QR-scan path and the dropdown path during development/testing.

### Manual location picker UI
- **D-05:** When a user opens the form directly (no QR scan), location is chosen from a plain `<select>`-style dropdown of registered points — not a map/pin picker. — **Reversibility:** costly — **rationale:** dropdown was chosen specifically to keep the FCP ≤2s/4G budget and avoid pulling in a mapping library; switching to a map later is a real UI rebuild, not a tweak.
- **D-06:** Dropdown options show location `name` only — no lat/lng or other metadata displayed to the user.
- **D-07:** The "location" part of the form looks the same regardless of entry path: on a successful QR scan, the location field is auto-filled and shown read-only (locked); on direct form entry, the same field area shows the dropdown instead. The rest of the form (note, photos in later phases) is identical either way.
- **D-08:** When QR-locked, the form includes a "ไม่ใช่จุดนี้" (not this location) control that switches the field from the locked/read-only state into the dropdown, letting the user pick the correct location themselves — covers the case of a mis-scanned or wrong QR.

### Claude's Discretion
- **QR payload format & tamper protection** (whether the QR encodes a bare `location_id` checked against the registry, or a signed URL per the HMAC approach noted in `.claude/CLAUDE.md`) was not selected for discussion. Research/planning should decide this against SPEC.md's requirement that QR codes be un-forgeable and reject unregistered `location_id` values.
- **Form validation & error UX** (character-counter style for `note`, submit-blocking behavior, and how the "ไม่พบจุดนี้ในระบบ" error is surfaced) was not selected for discussion either — left to planning, grounded in SPEC.md's stated edge cases (missing location → block submit; `note` optional; invalid QR → clear error message).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & scope
- `SPEC.md` — master spec; §"การแจ้งจุดขยะ" (location entry rules, QR behavior, edge cases), §"ทั่วไป" (FCP/responsive targets), §"Security & AI Ethics" (QR anti-forgery requirement)
- `.planning/PROJECT.md` — project-level constraints and core value
- `.planning/REQUIREMENTS.md` — SUBM-01 through SUBM-04, mapped to this phase
- `.planning/ROADMAP.md` — Phase 1 goal and success criteria

### Stack guidance
- `.claude/CLAUDE.md` — tech stack recommendations, including the `qrcode` + HMAC-signed-URL pattern for un-forgeable QR codes (relevant to the deferred QR payload decision above)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None yet directly reusable for this phase — no frontend files exist (`public/`/`views/` are empty), and the only backend code so far is the image-classification proof-of-concept (`src/routes/classify.js`, `src/services/wasteImageClassifier.js`, `src/services/imageType.js`), which belongs to Phase 2, not this phase.

### Established Patterns
- `config/ai-thresholds.json` establishes the project's convention for admin-tunable, hand-edited JSON config files living in `config/` — `config/locations.json` should follow the same pattern (flat JSON, no build step, read at request time).
- `index.js` mounts feature routers directly on the Express app (`app.use(classifyRouter)`) — a new location/submission router should follow the same mounting convention.
- Error responses in `src/routes/classify.js` return `{ error: "<Thai message>" }` with an appropriate 4xx status — Phase 1 endpoints (e.g., QR validation) should match this shape and language for consistency.

### Integration Points
- New location-lookup/validation logic and the submission-entry route(s) will be new files under `src/routes/` and `src/services/`, mounted in `index.js` alongside the existing `classifyRouter`.
- No `public/` static-serving is configured yet in `index.js` — the plain HTML/CSS/JS form for this phase will need `express.static` wired up.

</code_context>

<specifics>
## Specific Ideas

- Seed location names are explicitly placeholders for now ("จุด A", "หอพัก 1", etc.) — the user intends to supply the real campus location list later. Don't treat the placeholder names as final content to design around.
- The "ไม่ใช่จุดนี้" override control for QR-locked location is a specific UX request — a mis-scan recovery path, not a general "always editable" location field.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 1-Location & Submission Entry*
*Context gathered: 2026-08-19*
