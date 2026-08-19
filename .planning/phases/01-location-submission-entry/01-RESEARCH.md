# Phase 1: Location & Submission Entry - Research

**Researched:** 2026-08-19
**Domain:** Server-rendered Express entry form (QR-anchored + dropdown-anchored location resolution), HMAC-signed QR payloads, no-login public form, FCP/responsive performance budget
**Confidence:** MEDIUM-HIGH (all package/version facts and runtime-behavior claims below were confirmed live this session via `npm view`, official docs/READMEs, or direct Node execution against the actual installed toolchain — not recalled from training data. The one genuinely open area is the FCP/responsive automated-testing strategy, which has no existing project precedent to anchor against.)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Location registry source**
- **D-01:** Registered locations for Phase 1 live in a hand-maintained JSON seed file, `config/locations.json` (same convention as the existing `config/ai-thresholds.json`) — not a database, not an admin UI. — **Reversibility:** costly — **rationale:** once the manual/dropdown flow and QR generation are built against this file's shape, migrating to an admin-managed store later means rewriting the read path and adding a write/registration path.
- **D-02:** Each location record has the minimum fields implied by SPEC.md: `location_id`, `name`, `lat`, `lng`. No `building`/`zone` grouping field for Phase 1.
- **D-03:** Seed data uses placeholder names (e.g., "จุด A", "หอพัก 1") for now — the user will supply the real campus location names later; the seed file should be easy to hand-edit/replace with real data without code changes.
- **D-04:** Seed 5 sample locations initially — enough to exercise both the QR-scan path and the dropdown path during development/testing.

**Manual location picker UI**
- **D-05:** When a user opens the form directly (no QR scan), location is chosen from a plain `<select>`-style dropdown of registered points — not a map/pin picker. — **Reversibility:** costly — **rationale:** dropdown was chosen specifically to keep the FCP ≤2s/4G budget and avoid pulling in a mapping library; switching to a map later is a real UI rebuild, not a tweak.
- **D-06:** Dropdown options show location `name` only — no lat/lng or other metadata displayed to the user.
- **D-07:** The "location" part of the form looks the same regardless of entry path: on a successful QR scan, the location field is auto-filled and shown read-only (locked); on direct form entry, the same field area shows the dropdown instead. The rest of the form (note, photos in later phases) is identical either way.
- **D-08:** When QR-locked, the form includes a "ไม่ใช่จุดนี้" (not this location) control that switches the field from the locked/read-only state into the dropdown, letting the user pick the correct location themselves — covers the case of a mis-scanned or wrong QR.

### Claude's Discretion

- **QR payload format & tamper protection** (whether the QR encodes a bare `location_id` checked against the registry, or a signed URL per the HMAC approach noted in `.claude/CLAUDE.md`) was not selected for discussion. Research/planning should decide this against SPEC.md's requirement that QR codes be un-forgeable and reject unregistered `location_id` values. **→ This document's primary recommendation (see Architecture Patterns → Pattern 1) resolves this: HMAC-SHA256-signed URL.**
- **Form validation & error UX** (character-counter style for `note`, submit-blocking behavior, and how the "ไม่พบจุดนี้ในระบบ" error is surfaced) was not selected for discussion either — left to planning, grounded in SPEC.md's stated edge cases (missing location → block submit; `note` optional; invalid QR → clear error message). **→ See Architecture Patterns → Pattern 3 and Code Examples for a concrete design.**

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.

### Phase Boundary (from CONTEXT.md, verbatim)

> This phase delivers the entry point into the waste-reporting flow: how a user (no login required) arrives at the report form with a **validated location** attached — either by scanning a registered QR code, or by picking a registered point from a dropdown when entering the form directly. It also covers the optional `note` field (≤500 chars) and the page-load/responsive performance bar (FCP ≤2s on 4G, correct rendering at 375px/768px/1024px).
>
> **Out of scope for this phase** (belongs to later phases): photo upload, face-blur, AI classification, persisting the report to `waste-reports.json`, the officer queue/status dashboard, LINE notifications, rate limiting, and dedup detection. It's also out of scope to build an admin UI for registering new locations.

This boundary directly shapes the "does Phase 1 need a POST endpoint?" question addressed in Open Questions below — persistence is explicitly out of scope, but form *validation* is implicitly in scope (SUBM-02, SUBM-03).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SUBM-01 | ผู้ใช้งานแจ้งจุดขยะได้โดยไม่ต้อง login ผ่านการสแกน QR Code หรือเลือกจุดจากรายการ/แผนที่ที่ลงทะเบียนไว้เท่านั้น (ไม่มี free-text address) | Architecture Patterns (Pattern 1: signed-QR resolution; Pattern 2: SSR dropdown), Code Examples (`GET /report` route, `config/locations.json` seed), Don't Hand-Roll (QR generation via `qrcode`) |
| SUBM-02 | ระบบปฏิเสธ QR ที่ `location_id` ไม่ตรงกับจุดที่ลงทะเบียน พร้อม error message | Architecture Patterns (Pattern 1: HMAC verify + registry check), Common Pitfalls (#1, #2, #5), Code Examples (`verifyLocationSignature`, error-branch pseudocode), Security Domain (V5, V6, Known Threat Patterns) |
| SUBM-03 | ผู้ใช้งานกรอกรายละเอียดเพิ่มเติมได้ (field `note`, optional, ไม่เกิน 500 ตัวอักษร) | Common Pitfalls (#3: Thai character counting), Code Examples (maxlength + counter pattern), Open Questions (#1: where server-side enforcement lives) |
| SUBM-04 | ฟอร์มโหลดเร็ว (FCP ≤2 วินาทีบน 4G) และ responsive ที่ 375px/768px/1024px | Common Pitfalls (#8, #9), Architecture Patterns (SSR-over-client-fetch rationale), Validation Architecture (Lighthouse-based measurement, manual-only justification) |
</phase_requirements>

## Summary

Phase 1 is a single Express route (`GET /report`) that reads a small, hand-edited JSON registry (`config/locations.json`, per locked decision D-01) and renders one of three states: a **locked** location display (valid signed QR), a **dropdown** picker (direct entry, or user hit "ไม่ใช่จุดนี้"), or an **error** page (invalid/unregistered QR). The open technical decision this research resolves is the QR payload format: recommend **HMAC-SHA256-signed URLs** (`/report?location_id=X&sig=Y`, both verified server-side with Node's built-in `crypto` module) over a bare `location_id`, because a bare id lets anyone hand-type a URL and claim to be at any registered location without ever scanning anything — defeating the entire point of QR-gated intake. This costs zero new dependencies (`crypto` is built-in) and was already the direction `.claude/CLAUDE.md`'s prior stack research pointed toward.

The second major recommendation is architectural: render the form server-side with **EJS** (a lightweight, auto-escaping template engine, newly evaluated this session — `ejs@6.0.1`, CommonJS-compatible, zero client-side JS footprint) rather than serving a static HTML shell and fetching location data client-side after page load. This is what makes the "one real read" of `locations.json` show up directly in the initial HTML response — no second round-trip, no loading-flash state, and materially better for the FCP ≤2s/4G budget than a client-side-hydrated alternative. `qrcode` (already recommended in prior project research, re-verified here at `1.5.4`) generates the QR PNGs for the 5 seed locations via a one-off dev script — not an HTTP route, since QR generation is an ops-time action, not a runtime capability this phase needs to expose publicly.

Three concrete, verified pitfalls dominate the risk surface: (1) `crypto.timingSafeEqual` throws a `RangeError` on length-mismatched buffers and `Buffer.from(str, 'hex')` silently *truncates* malformed hex instead of throwing — both must be guarded explicitly or QR verification either crashes or silently misbehaves; (2) this is an all-Thai-language product, and naive server-side length validation using `Buffer.byteLength` instead of `.length` would reject a Thai `note` at roughly one-third of the stated 500-character limit (Thai text averages 3 UTF-8 bytes/character — verified directly against this project's own Node runtime); (3) a Windows-edited `config/locations.json` saved with a UTF-8 BOM will make `JSON.parse` throw `Unexpected token '﻿'` — also verified directly on this machine, and directly relevant since D-03 asks for a file the user will hand-edit later, likely on Windows.

**Primary recommendation:** Build `GET /report` (EJS-rendered, three states: locked/dropdown/error) + `GET /api/locations` (JSON, for testability) backed by `src/services/locationStore.js` and `src/services/qrSignature.js` (HMAC sign/verify), seed `config/locations.json` with 5 placeholder locations per D-03/D-04, and generate their QR codes via a one-off `scripts/generate-qr.js` using `qrcode` with `errorCorrectionLevel: 'H'` (outdoor/high-wear campus signage). Treat whether to add a lightweight `POST /api/waste-reports/validate` endpoint as an open, planner-level decision (see Open Questions #1) — this research recommends adding it for defense-in-depth on SUBM-03, but it is not mandated by CONTEXT.md.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| QR signature verification (HMAC) | API/Backend | — | Must never trust the client; the secret key only exists server-side. Non-negotiable trust boundary. |
| Location registry read (`config/locations.json`) | API/Backend | — | File-system read; the client only ever sees the rendered/JSON result, never the file. |
| Location dropdown population | API/Backend (SSR) | Browser/Client (for the locked↔dropdown *toggle*, not the data) | Server renders both states into one HTML response at request time (the "real read"); the browser only ever flips CSS/DOM visibility between two states it already has — no second fetch. |
| "ไม่ใช่จุดนี้" override control | Browser/Client | — | Pure visibility/state toggle against data already present in the DOM; no network call, no server logic. |
| `note` character-limit UX (counter, prevent-overtype) | Browser/Client | API/Backend (defense-in-depth re-validation, see Open Questions #1) | Native `maxlength` + live counter is the primary, instant UX; server-side re-check exists only to protect against a client that bypasses the browser (curl/devtools), not to drive the visible UX. |
| Static asset delivery (CSS/client JS) | CDN/Static (conceptually) | — | No real CDN exists at this project's scale — `express.static` on the same single Node process fills this role today (matches `.planning/research/ARCHITECTURE.md`'s "single Node process" scaling note). Flagged as its own tier per the template, but physically the same process as API/Backend right now. |
| Responsive layout (375/768/1024) | Browser/Client | — | Pure CSS media-query rendering; no server involvement beyond serving the stylesheet. |
| FCP performance | API/Backend (response size/latency/headers) | Browser/Client (render/parse cost) | Both tiers own pieces: backend controls payload size and TTFB, browser controls paint cost of what's shipped (fonts, CSS, JS). |

Note: this project has no separate "Frontend Server (SSR)" tier distinct from "API/Backend" — Express is simultaneously the page-renderer and the API, per the project's explicit no-framework/no-bundler constraint (`.claude/CLAUDE.md`). The two conceptual tiers collapse into one physical process.

## Project Constraints (from CLAUDE.md)

Extracted from `.claude/CLAUDE.md` (this project's `claude_md_path`, per `.planning/config.json`), filtered to what's actionable for Phase 1:

- **Runtime floor:** Node.js ≥22 required (two *other* phases' dependencies pin this; Phase 1's own new dependencies — `qrcode`, `ejs`, `supertest` — all declare much looser floors, see Package Legitimacy Audit). Installed: Node v24.18.0, confirmed `[VERIFIED: node --version, this session]`.
- **Frontend:** "Plain HTML/CSS/JS (native ES modules, no bundler)... Modern browsers fully support `<script type="module">`, `fetch`, `FormData`, CSS Grid/`clamp()`/container queries — a build step (Vite/webpack) buys nothing here." — **EJS does not violate this.** EJS is a *server-side* template engine (renders to plain HTML before the response leaves the server); it ships zero JavaScript to the client and requires no build step. The constraint targets client-side frameworks/bundlers, not server-side templating.
- **QR anti-forgery:** `.claude/CLAUDE.md` explicitly names the pattern this research formalizes: *"Append an HMAC-SHA256 signature (keyed by a server-side secret) to the QR payload/URL; on scan, recompute and compare, and confirm the id still exists in the locations list."*
- **What NOT to use (relevant subset):** no database "just in case"; no frontend framework/bundler for the report form; no `uuid` package (use built-in `crypto.randomUUID()` if any id generation is needed — not needed in Phase 1 itself, relevant if a `POST /api/waste-reports/validate` endpoint is added per Open Questions #1).
- **Testing convention:** `node:test` (built-in, zero install) + `supertest` for HTTP-endpoint tests — already the project's stated direction; this phase should follow it, not introduce a different framework (e.g., Jest/Vitest).
- **GSD Workflow Enforcement:** file changes should happen through a GSD command (`/gsd-execute-phase` etc.), not ad hoc — process note for whoever executes this plan, not a technical constraint on the code itself.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `qrcode` | `^1.5.4` | Server-side QR PNG generation for the 5 seed locations | `[CITED: npm registry, this session]` 18.8M weekly downloads, repo `soldair/node-qrcode`, first published 2010, not deprecated, no postinstall script. Already the prior project research's pick (`.claude/CLAUDE.md`); re-verified live this session, not carried over from memory. |
| `ejs` | `^6.0.1` | Server-side HTML templating for `GET /report` (auto-escaping, zero client JS) | `[CITED: npm registry + official README, this session]` 32.4M weekly downloads, repo `mde/ejs`, first published 2011, not deprecated. **New recommendation this session** — not evaluated in prior project research (`STACK.md` had no templating need before Phase 1). See Architecture Patterns → Pattern 2 for the SSR-vs-client-fetch rationale. |
| Node built-in `crypto` (`createHmac`, `timingSafeEqual`, `randomBytes`) | built-in | Sign/verify the QR `location_id`; generate the signing secret | No new dependency. Exactly the pattern `.claude/CLAUDE.md` names. Sign/verify round-trip and the `timingSafeEqual` length-mismatch throw were both directly executed and confirmed this session — see Code Examples. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `supertest` | `^7.2.2` | HTTP-endpoint tests for `GET /report`, `GET /api/locations`, and any validate endpoint | `[CITED: npm registry, this session]` 11.3M weekly downloads, repo `ladjs/supertest`, first published 2012. Matches the project's already-declared testing direction (`STACK.md`). Zero devDependencies exist in `package.json` today — this is a genuine Wave-0 gap, see Validation Architecture. |
| `lighthouse` (via `npx`, **not** a persistent devDependency) | `13.4.1` at time of research | Automated FCP measurement against the "4G" throttling profile SPEC references | `[SUS: package-legitimacy flagged "too-new"]` — see Package Legitimacy Audit for why this is very likely a false-positive-in-spirit (14-year-old package, Google's own official tool) but must still be surfaced and gated per protocol. Recommend `npx lighthouse` (ephemeral, not installed to `node_modules`) rather than a permanent dependency, given the project's stated dependency-minimalism. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| HMAC-signed QR URL | Bare `location_id` checked only against the registry | Simpler (one fewer field, no secret management) but does **not** satisfy SPEC's "un-forgeable" QR requirement in the way `.claude/CLAUDE.md` describes — anyone can hand-type `?location_id=<any-registered-id>` and be treated as if they scanned a real QR at that location. Registry-only validation stops *garbage* ids, not *impersonation* of a real one. Only acceptable if the team explicitly decides physical-presence-proof isn't actually a goal (contradicts CONTEXT.md's framing of this as an open question to resolve carefully). |
| EJS server-side rendering | Static HTML shell (`public/report.html`) + client-side `fetch('/api/locations')` to populate the dropdown | Zero new dependency, stays maximally "no templating engine at all" — but introduces a loading-flash state (empty dropdown until JS fetch resolves), a second network round-trip before the form is fully usable, and pushes HTML-escaping responsibility onto hand-written client-side DOM code instead of EJS's automatic `<%= %>` escaping. Reasonable only if the team wants literally zero server-side templating as a hard rule. |
| EJS | Hand-rolled JS template-literal function + manual `escapeHtml()` helper | Zero new dependency; defensible for a form this simple. Real risk: every interpolation site must remember to call the escape helper — one missed call anywhere is a reflected-XSS bug. EJS's `<%= %>` escapes by default, removing an entire class of "forgot to escape" mistakes, and the same engine is reusable for Phase 4's dashboard (which *will* render user-supplied `note`/`changed_by` text). |
| `qrcode` npm package | Hand-rolled QR encoding | Not seriously viable — QR encoding involves Reed–Solomon error correction and a nontrivial bit-packing spec; this is a textbook Don't-Hand-Roll case (see below). |
| Hex-encoded HMAC signature in the URL | Base64url-encoded signature | Base64url is ~30% shorter for the same entropy (fewer QR modules → more reliable outdoor scanning at a given print size), but hex is simpler to read in logs/debugging and has zero URL-encoding edge cases. Recommend hex for the initial implementation; base64url is a reasonable later refinement if QR print size becomes a real constraint. `[ASSUMED — my own engineering tradeoff judgment, not sourced from an authoritative reference specifically endorsing one over the other for this use case]` |

**Installation:**
```bash
npm install qrcode@^1.5.4 ejs@^6.0.1
npm install --save-dev supertest@^7.2.2
```

**Version verification (this session, `npm view <pkg> version|engines|time.created`):**

| Package | Latest version | Published | First published | `engines.node` |
|---|---|---|---|---|
| `qrcode` | 1.5.4 | 2025-11-13 | 2010-12-21 | `>=10.13.0` |
| `ejs` | 6.0.1 | 2026-08-03 | 2011-02-14 | `>=0.12.18` |
| `supertest` | 7.2.2 | 2026-01-06 | 2012-06-26 | `>=14.18.0` |
| `lighthouse` | 13.4.1 | 2026-07-20 | 2012-03-28 | `>=22.19` |
| `express` (already installed) | 5.2.1 | — | — | matches `package.json`'s `^5.2.1` |

`[CITED: npm registry, verified live this session — 2026-08-19]` for every row above.

## Package Legitimacy Audit

| Package | Registry | Age (first published) | Weekly Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `qrcode` | npm | ~15.7 yrs (2010-12-21) | 18,826,156 | `github.com/soldair/node-qrcode` | **OK** | Approved |
| `ejs` | npm | ~15.5 yrs (2011-02-14) | 32,409,898 | `github.com/mde/ejs` | **OK** | Approved |
| `supertest` | npm | ~14.1 yrs (2012-06-26) | 11,300,768 | `github.com/ladjs/supertest` | **OK** | Approved |
| `lighthouse` | npm | ~14.4 yrs (2012-03-28) | 3,806,716 | `github.com/GoogleChrome/lighthouse` | **SUS** (`too-new`) | Flagged — see note below |

**`lighthouse` [WARNING: flagged as suspicious by the legitimacy gate ("too-new") — verify before using.]** This is very likely a false positive *in the sense that the package itself is not new or untrustworthy*: it was first published in 2012, is maintained under Google's own official `GoogleChrome` GitHub org, and has 3.8M weekly downloads. The "too-new" signal is almost certainly tripping on **recency of the latest published version** (`13.4.1`, published 2026-07-20 — about a month before this research date), which is normal cadence for an actively-shipped tool, not a sign of a hijacked/hallucinated package. That said: (1) this is the tool's own verdict, not my override of it, so it is reported as required; (2) `npx lighthouse` still executes downloaded code, so the recommendation is to gate its first use behind a `checkpoint:human-verify` task (confirm the `npx` output resolves to the official `lighthouse` package before running it against anything beyond `localhost`), and (3) prefer ephemeral `npx lighthouse` invocation over adding it as a persistent `devDependency`, consistent with the project's stated dependency-minimalism.

**Packages removed due to `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** `lighthouse` — planner must add a `checkpoint:human-verify` task before its first invocation.

## Architecture Patterns

### System Architecture Diagram

```
BROWSER (mobile-first, no login)
  Phone camera scans printed         Student opens the site
  QR sticker on a bin                directly (bookmark/typed URL)
        |                                    |
        v                                    v
  GET /report?location_id=X&sig=Y     GET /report  (no query params)
        |                                    |
        +--------------------+---------------+
                             v
========================= EXPRESS APP (src/routes/report.js) =========================
        location_id present in query?
              |                     \
             yes                     no --------------------------------------+
              v                                                               |
     verifyLocationSignature(location_id, sig)                                |
     [src/services/qrSignature.js -- HMAC-SHA256, crypto built-in]            |
              |                                                               |
    invalid/missing sig            valid sig AND                             |
    OR unknown location_id         location_id in registry                   |
              |                              |                               |
              v                              v                               v
     render ERROR view            render FORM view              render FORM view
     "ไม่พบจุดนี้ในระบบ            (LOCKED state)                 (DROPDOWN state)
      กรุณาติดต่อเจ้าหน้าที่"       location auto-filled,          <select> populated
      -- HTTP 400                 read-only + "ไม่ใช่จุดนี้" btn   from locationStore
                                             |                              |
                                             +--------------+---------------+
                                                            v
                                        src/services/locationStore.js
                                        reads config/locations.json  <-- THE "real read"
========================================================================================
                                             |
                                             v   single HTML response, EJS-rendered
                                             |   (no second JS fetch needed for either state)
BROWSER -- rendered form
  - location block: locked display OR dropdown (same DOM position, D-07)
  - "ไม่ใช่จุดนี้" button -> pure client-side JS toggle, locked -> dropdown
    (data for the dropdown is already in the page; zero network calls)
  - note <textarea maxlength="500"> + live aria-live counter
  - [if built, see Open Questions #1] submit -> POST /api/waste-reports/validate
    re-verifies signature + note length server-side; does NOT persist (Phase 3's job)
```

A reader can trace both entry paths (QR scan, direct entry) from browser input through signature verification and registry lookup to the rendered response, and see exactly where the phase boundary cuts (no persistence, no photos — both explicitly out of scope per CONTEXT.md).

### Recommended Project Structure

```
config/
├── ai-thresholds.json        # existing (Phase 2 concern, untouched)
└── locations.json            # NEW -- D-01/D-02: [{location_id, name, lat, lng}, ...] x5

public/
├── css/
│   └── report.css            # NEW -- mobile-first, breakpoints at 768px/1024px
└── js/
    └── report.js             # NEW -- note counter, locked<->dropdown toggle (vanilla JS)

views/
└── report.ejs                # NEW -- single template, renders locked | dropdown | error state

src/
├── routes/
│   ├── classify.js           # existing (Phase 2 proof-of-concept -- do not touch)
│   └── report.js             # NEW -- GET /report, GET /api/locations, [POST /api/waste-reports/validate]
├── services/
│   ├── wasteImageClassifier.js   # existing (Phase 2 -- do not touch)
│   ├── imageType.js              # existing (Phase 2 -- do not touch)
│   ├── locationStore.js      # NEW -- reads config/locations.json, isValidLocationId()
│   └── qrSignature.js        # NEW -- signLocationId(), verifyLocationSignature()

scripts/
└── generate-qr.js            # NEW -- dev/ops CLI only, NOT an HTTP route (see Pattern 4)

.env.example                   # UPDATED -- add QR_SIGNING_SECRET=
index.js                       # UPDATED -- app.set('view engine','ejs'), express.static(public/), mount report router
```

This extends — rather than contradicts — the project structure already recommended in `.planning/research/ARCHITECTURE.md` (`src/routes/`, `src/services/` separation, services never importing `express`). `views/` and `public/` sit at the project root as siblings to `src/` and `config/`, matching how `config/` already sits at the root rather than nested under `src/` `[VERIFIED: config/ai-thresholds.json location confirmed via repo listing this session]`.

### Pattern 1: HMAC-signed QR URL, verified server-side

**What:** The QR encodes `https://<host>/report?location_id=<id>&sig=<hmac>`, where `sig = HMAC-SHA256(QR_SIGNING_SECRET, location_id)`, truncated to 16 bytes (32 hex chars) and hex-encoded. On scan, the server recomputes the HMAC over the received `location_id` and compares it to the received `sig` using `crypto.timingSafeEqual` (never `===`), **and independently confirms `location_id` still exists in `config/locations.json`** — the signature proves the URL wasn't hand-typed, the registry check proves the location hasn't since been removed.

**When to use:** Every request that arrives via the QR path. **Not** the dropdown path — a location picked from the `<select>` has no signature at all (there is no QR involved), and should only be checked for registry existence. Conflating the two paths (requiring a signature even for dropdown-originated ids) would break the dropdown entirely.

**Why bare `location_id` isn't enough:** SUBM-02's literal wording ("reject QR whose `location_id` doesn't match a registered point") is satisfiable by registry-only validation. But `.claude/CLAUDE.md`'s framing — "un-forgeable... reject QR ปลอม/โคลนนิ่ง" — implies a stronger property: proof the request actually originated from a real, previously-generated QR, not from someone reading a valid id off one QR and typing `?location_id=<that-id>` into a browser from anywhere. A bare id gives zero such proof; anyone can enumerate the ~5 known ids and submit reports "from" any of them without visiting. HMAC signing closes that gap for free (`crypto` is built-in, no new dependency) while adding one query parameter.

**Verified example (executed against this project's actual Node v24.18.0 this session):**
```javascript
// src/services/qrSignature.js
const crypto = require('crypto');

const SECRET = process.env.QR_SIGNING_SECRET;
if (!SECRET) {
  throw new Error('QR_SIGNING_SECRET is not set — see .env.example');
}

/** Deterministic HMAC-SHA256 over location_id, truncated to 16 bytes (128 bits), hex-encoded. */
function signLocationId(locationId) {
  return crypto.createHmac('sha256', SECRET).update(locationId).digest('hex').slice(0, 32);
}

/** Constant-time verification. Never throws on malformed/garbage input. */
function verifyLocationSignature(locationId, providedSig) {
  if (typeof providedSig !== 'string' || providedSig.length !== 32) return false; // see Pitfall #1
  const expected = signLocationId(locationId);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(providedSig, 'hex');
  if (a.length !== b.length) return false; // guard BEFORE timingSafeEqual — see Pitfall #2
  return crypto.timingSafeEqual(a, b);
}

module.exports = { signLocationId, verifyLocationSignature };
```
`[VERIFIED: direct Node v24.18.0 execution, this session]` — this exact logic was run with a real secret and confirmed: (a) a correct signature verifies `true`; (b) tampering `location_id` while reusing an old signature correctly fails (`false`) — this is the core anti-forgery property; (c) a garbage/wrong-length signature safely returns `false` with no crash.

**Trade-offs:** Requires managing one new secret (`QR_SIGNING_SECRET` in `.env`, generate via `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). Signing is deterministic (same `location_id` → same signature always) by design — this means one QR print run per location lasts forever unless the secret rotates or the location is removed from the registry; it also means adding a location later requires re-running the QR-generation script for the new id only, not regenerating every existing QR.

### Pattern 2: Server-side rendering (EJS) instead of client-side fetch-and-hydrate

**What:** `GET /report` reads `config/locations.json` and the query string, decides which of the three states applies (locked / dropdown / error), and renders a single EJS template (`views/report.ejs`) that contains **all three states' markup**, with only the active one visible (toggled by a body class or inline style set at render time). The inactive dropdown markup is still present in the initial HTML even in locked mode — this is what makes the "ไม่ใช่จุดนี้" button a zero-network-call, instant client-side toggle (Pattern 2 continues into the browser: no second fetch needed to "discover" the dropdown options after the button is clicked, because they were already shipped in the first response).

**When to use:** Any page whose content depends on request-time data (query params + a server-side file read) in this project — i.e., exactly `GET /report`, and no other page needed by this phase.

**Why not a static HTML shell + client fetch:** A static `public/report.html` served via `express.static` cannot vary its content per request (no query-param branching, no server-side file read) — the location data would have to be fetched client-side after the page loads, via `fetch('/api/locations')` and/or a location-check endpoint. That adds a second round-trip before the form is actually usable and a "loading" state to design/build, working against the FCP/perceived-speed goal that is this phase's explicit success criterion. EJS auto-escapes everything interpolated via `<%= %>` by default, which also means the location `name` value (currently hand-edited/trusted, but the field's origin will change once an admin UI exists later) and any query-param values echoed back are HTML-escaped without the developer having to remember to call an escape function at every interpolation site.

**Confirmed compatible with this project's `"type": "commonjs"` setting:** EJS's `6.0.1` changelog entry (the version jump from the `3.x` line this project's earlier research would have known about) is a packaging/bundler-interop fix only — *"the published CJS surface remains unchanged"* `[CITED: github.com/mde/ejs search result, this session]`. `require('ejs')` + `app.set('view engine', 'ejs')` + `res.render('report', {...})` work exactly as the long-standing standard Express pattern.

**Trade-offs:** One new dependency (`ejs`) vs. zero. Accepted because it removes an entire class of manual-escaping bugs and is directly reusable by Phase 4's officer dashboard (which will render user-supplied `note`/`changed_by` text and has the exact same XSS concern SPEC already calls out).

### Pattern 3: Client-only vs. server-side note-length enforcement (see Open Questions #1 for the fork)

**What:** `<textarea maxlength="500">` physically prevents typing past the limit and drives a live `aria-live="polite"` counter — this alone satisfies SUBM-03's literal wording ("ระบบป้องกัน/แจ้งเตือนเมื่อเกิน", system prevents/warns). Whether a server-side re-check also exists in Phase 1 depends on whether a `POST` endpoint exists at all in this phase (see Open Questions #1) — if one is added, it must count length the same way the browser does (see Common Pitfall #3).

**Example (verified HTML spec behavior, not yet built):**
```html
<label for="note">รายละเอียดเพิ่มเติม (ไม่บังคับ)</label>
<textarea id="note" name="note" maxlength="500" aria-describedby="note-counter"></textarea>
<div id="note-counter" aria-live="polite">0 / 500 ตัวอักษร</div>
```
```javascript
// public/js/report.js
const note = document.getElementById('note');
const counter = document.getElementById('note-counter');
note.addEventListener('input', () => {
  counter.textContent = `${note.value.length} / 500 ตัวอักษร`;
});
```
`note.value.length` and the HTML `maxlength` attribute both count **UTF-16 code units** — see Common Pitfall #3 for why this must match whatever the server does if a server-side check is added.

### Pattern 4: QR generation is a dev/ops script, not an HTTP route

**What:** A one-off Node script (`scripts/generate-qr.js`) reads `config/locations.json`, signs each `location_id` via `qrSignature.js`, and writes one PNG per location to a local output directory using `qrcode`'s `toFile()`.

**When to use:** Run manually whenever `config/locations.json` changes (new location added, or the signing secret rotates). Not exposed as a public or even authenticated HTTP endpoint — SPEC's own Scalability section frames QR generation as a future *admin UI* concern ("ลงทะเบียน location_id ใหม่ผ่านหน้า admin ก่อนสร้าง QR"), and CONTEXT.md explicitly puts admin UI out of scope for Phase 1. A CLI script satisfies the need (produce scannable QR images for UAT of SUBM-01) without building or securing a new route.

**Verified example (API confirmed via official README this session):**
```javascript
// scripts/generate-qr.js -- run with: node scripts/generate-qr.js
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { signLocationId } = require('../src/services/qrSignature');

const locations = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'locations.json'), 'utf8'));
const BASE_URL = process.env.QR_BASE_URL || 'http://localhost:3000';
const outDir = path.join(__dirname, '..', 'qr-output');
fs.mkdirSync(outDir, { recursive: true });

(async () => {
  for (const loc of locations) {
    const sig = signLocationId(loc.location_id);
    const url = `${BASE_URL}/report?location_id=${encodeURIComponent(loc.location_id)}&sig=${sig}`;
    const file = path.join(outDir, `${loc.location_id}.png`);
    // errorCorrectionLevel 'H' (~30% recoverable) -- outdoor/high-wear campus signage, see Sources
    await QRCode.toFile(file, url, { errorCorrectionLevel: 'H', width: 400, margin: 2 });
    console.log(`${loc.location_id} -> ${file}\n  ${url}`);
  }
})();
```
`[CITED: raw.githubusercontent.com/soldair/node-qrcode README, this session]` for `toFile(path, text, [options], [cb])` signature, the `errorCorrectionLevel` option accepting `L/M/Q/H` (default `M`), and promise support when the callback is omitted.

### Anti-Patterns to Avoid

- **Requiring a signature for dropdown-originated `location_id` values:** the dropdown path has no QR at all; only registry-existence should gate it. Requiring `sig` there breaks the entire manual-entry path.
- **Trusting a prior successful `GET /report` as proof of validity on a later `POST`:** these are separate requests. If a validate/submit endpoint is added (Open Questions #1), it must re-verify the signature itself from whatever hidden fields carry `location_id`/`sig` forward — never assume "the page rendered the locked state" is still true by the time of submit.
- **Using `<%- %>` (raw/unescaped) in EJS for any value that traces back to a query parameter or the location registry:** defeats the entire reason EJS was chosen over hand-rolled templating. `<%= %>` (auto-escaped) should be the default for every interpolation in this phase's template; reach for `<%- %>` only for markup the developer wrote themselves, never for data.
- **Distinct error messages per QR-failure reason** (e.g., "invalid signature" vs. "unknown location" vs. "missing sig param"): reveals the signing mechanism's shape to anyone probing it. Use the single SPEC-mandated message ("ไม่พบจุดนี้ในระบบ กรุณาติดต่อเจ้าหน้าที่") for all three cases; log the specific reason server-side only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| QR code image generation | A custom QR encoder (Reed–Solomon error correction, module bit-packing per the QR spec) | `qrcode` npm package | Genuinely complex, well-solved, 18.8M weekly downloads, zero reason to reimplement. |
| HTML escaping for server-rendered values | A hand-written `escapeHtml()` called manually at every interpolation site | EJS's `<%= %>` (auto-escapes by default) | One missed call anywhere is a reflected-XSS bug; auto-escaping-by-default removes the failure mode structurally instead of relying on developer discipline at every call site. |
| Constant-time signature comparison | `signature === expectedSignature` | `crypto.timingSafeEqual` (built-in) | String `===` short-circuits on the first differing byte, leaking timing information an attacker can use to guess a valid signature byte-by-byte. This is exactly what `timingSafeEqual` exists to prevent — no reason to hand-roll a constant-time compare when Node ships one. |
| Signature scheme | A custom checksum/obfuscation (e.g., simple string reversal, base64 of `location_id + secret`) | `crypto.createHmac('sha256', ...)` (built-in) | HMAC-SHA256 is the standard, well-analyzed primitive for exactly this "prove this value came from us" use case; anything hand-rolled is very likely weaker and unreviewed. |

**Key insight:** every item in this table is either a well-solved cryptographic primitive (don't invent your own) or a structural safety net (auto-escaping) that's strictly better than "developer remembers to do the safe thing every time." Both categories are classic hand-roll traps because the naive/manual version *looks* like it works right up until someone probes the specific case it doesn't handle (a crafted signature, a forgotten escape call).

## Common Pitfalls

### Pitfall 1: `Buffer.from(str, 'hex')` silently truncates malformed hex instead of throwing

**What goes wrong:** Code that decodes a client-supplied `sig` query param via `Buffer.from(sig, 'hex')` and assumes it either decodes correctly or throws will be wrong — malformed hex (odd length, non-hex characters) is *silently* decoded as far as possible and then stops, producing a shorter-than-expected buffer with no error at all.

**Why it happens:** Node's hex decoder is lenient by design (accepts partial/streaming input in some contexts); it was not written to be a validator.

**How to avoid:** Check the **string length** of the received signature (`providedSig.length !== 32`) before ever calling `Buffer.from`, as shown in Pattern 1's code. This also happens to be the cheapest possible rejection of garbage input.

**Verified this session** `[VERIFIED: direct Node v24.18.0 execution]`:
```
Buffer.from('zz','hex')      -> length 0   (invalid hex, no throw)
Buffer.from('abcXYZ','hex')  -> length 1   (decodes 'ab', silently drops the rest)
Buffer.from('abc','hex')     -> length 1   (odd-length input, drops trailing 'c')
```

**Warning signs:** Any code path that calls `Buffer.from(untrustedString, 'hex')` and relies on a `try/catch` to reject bad input — it won't throw.

**Phase to address:** QR signature verification (this phase) — `qrSignature.js`'s `verifyLocationSignature`.

---

### Pitfall 2: `crypto.timingSafeEqual` throws on length mismatch — must guard first

**What goes wrong:** Comparing an expected signature buffer against a client-supplied one via `timingSafeEqual` without first confirming both buffers are the same length crashes the request (uncaught `RangeError`) the moment an attacker (or just a truncated/garbled QR scan) supplies a signature of the wrong length.

**Why it happens:** `timingSafeEqual`'s whole purpose is constant-time comparison of equal-length secrets; the Node team deliberately made it throw rather than silently handle length mismatch (which would itself leak timing information).

**How to avoid:** `if (a.length !== b.length) return false;` immediately before calling `timingSafeEqual`, exactly as in Pattern 1's code.

**Verified this session** `[VERIFIED: direct Node v24.18.0 execution]`: `crypto.timingSafeEqual(Buffer.from('ab','hex'), Buffer.from('abcd','hex'))` throws `RangeError: Input buffers must have the same byte length` with code `ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH`.

**Phase to address:** Same as Pitfall 1 — both guards live in the same function.

---

### Pitfall 3: Thai `note` text will hit a byte-length limit at roughly 1/3 of the intended character count

**What goes wrong:** If server-side validation of the 500-character `note` limit is implemented with `Buffer.byteLength(note, 'utf8')` instead of `note.length`, a Thai-only note gets rejected at around **166 characters**, not 500 — a silent, confusing mismatch with both the SPEC's stated limit and the client-side `maxlength="500"` attribute (which counts UTF-16 code units, per MDN, not bytes).

**Why it happens:** Thai script has no precomposed characters the way Latin does — every consonant, vowel sign, and tone mark is its own Unicode codepoint, and each one is 3 bytes in UTF-8. It's easy to reach for `Buffer.byteLength` out of habit (it's the "obviously correct" way to bound *storage* size) without realizing it silently redefines the character limit for this product's primary language.

**Verified this session, against a real Thai sample string** `[VERIFIED: direct Node v24.18.0 execution]`:
```
sample: "เร่งด่วนควรดำเนินการไม่เร่งด่วน"
.length (UTF-16 code units):     31
Buffer.byteLength(utf8):         93   (3.00 bytes/char average)
```
i.e., a Buffer.byteLength-based "500" limit would actually cap Thai notes at ~166 characters.

**How to avoid:** Use `.length` (UTF-16 code units) for both the client `maxlength` attribute (already how the browser measures it — see Common Pitfalls source below) and any server-side re-check, so the two stay consistent. Do not use `Buffer.byteLength` for the *character* limit (it's the right tool for a *storage-size* limit, which this phase doesn't have).

**Warning signs:** A validation function that calls `Buffer.byteLength` anywhere near `note`; QA reports "the counter says I'm at 200/500 but it won't let me submit."

**Phase to address:** This phase, wherever note-length is (re-)validated server-side (see Open Questions #1).

---

### Pitfall 4: A UTF-8 BOM in a hand-edited `locations.json` breaks `JSON.parse`

**What goes wrong:** `config/locations.json` is explicitly meant to be hand-edited later (D-03: "seed file should be easy to hand-edit/replace... without code changes"). If it's ever saved by an editor that writes a UTF-8 byte-order mark (a real risk on Windows, per this project's dev environment), `JSON.parse(fs.readFileSync(path, 'utf8'))` throws.

**Verified this session** `[VERIFIED: direct Node v24.18.0 execution]`: writing a BOM-prefixed JSON file and reading it with `fs.readFileSync(path, 'utf8')` yields a string starting with `U+FEFF`; `JSON.parse` on that string throws `SyntaxError: Unexpected token '﻿', "﻿{"a":1}" is not valid JSON`.

**How to avoid:** Strip a leading BOM defensively before parsing: `raw.replace(/^﻿/, '')`. Cheap, harmless if no BOM is present, and removes an entire class of "why won't the server start" support requests once a non-developer is editing this file.

**Warning signs:** `locationStore.js` (or the app at boot, if locations are read at startup) throwing `Unexpected token` errors specifically after the file was edited/resaved, never after a fresh `git clone`.

**Phase to address:** This phase — `src/services/locationStore.js`'s read function, and identically relevant to `config/ai-thresholds.json`'s existing reader if it's ever touched.

---

### Pitfall 5: Conflating "location_id exists in the registry" with "this request proves physical presence at that location"

**What goes wrong:** Registry-existence checking alone (no signature) technically satisfies SUBM-02's literal wording but not the un-forgeability intent — anyone can submit `location_id=<any-of-the-5-known-ids>` from anywhere, with no QR involved, and the system accepts it as if it came from a legitimate QR scan.

**How to avoid:** Keep the two paths structurally distinct in code — the dropdown path *only* checks registry existence (by design, since there's no QR to sign); the QR path checks *both* signature validity *and* registry existence. Do not build one shared "is this location_id okay" function that both paths call with the same trust level.

**Phase to address:** This phase — see Pattern 1 and the Security Domain section below.

---

### Pitfall 6: Custom web fonts can quietly blow the FCP budget for an all-Thai-language UI

**What goes wrong:** Reaching for a Google Font (e.g., "Sarabun" or "Noto Sans Thai" — common, reasonable-looking choices for nicer Thai typography) adds a render-blocking stylesheet fetch to a third-party origin (extra DNS + TLS handshake before the CSSOM can settle) and, without `font-display: swap`, can leave text invisible (FOIT) until the font loads or the browser's block-period timeout expires — directly delaying First Contentful Paint, which is exactly the metric SUBM-04 gates on.

**How to avoid:** Use a system font stack with an explicit Thai-capable fallback rather than an external web font:
```css
font-family: system-ui, -apple-system, "Segoe UI", "Leelawadee UI", "Noto Sans Thai", sans-serif;
```
This ships zero extra network requests — every major OS already includes a Thai-capable font, and CSS font fallback substitutes automatically per-script even without perfect enumeration. `[ASSUMED — which exact named font each OS ships for Thai script is drawn from general platform knowledge, not independently verified per-OS this session; visually confirm Thai rendering on real test devices during UAT, see Environment Availability.]`

**Phase to address:** This phase's CSS (`public/css/report.css`).

## Code Examples

### Location resolution branching (server-side pseudocode, ties Patterns 1-3 together)

```javascript
// src/routes/report.js (sketch)
router.get('/report', (req, res) => {
  const { location_id, sig } = req.query;
  const locations = locationStore.getAll(); // [{location_id, name}, ...] — lat/lng not needed client-side per D-06

  if (!location_id) {
    return res.render('report', { mode: 'dropdown', locations, locked: null });
  }

  const known = locationStore.findById(location_id);
  const sigOk = qrSignature.verifyLocationSignature(location_id, sig);

  if (!sigOk || !known) {
    // Single generic message for ALL failure reasons — see Anti-Patterns
    return res.status(400).render('report', { mode: 'error', message: 'ไม่พบจุดนี้ในระบบ กรุณาติดต่อเจ้าหน้าที่' });
  }

  return res.render('report', { mode: 'locked', locked: known, locations }); // locations still passed for the "ไม่ใช่จุดนี้" fallback
});

router.get('/api/locations', (req, res) => {
  res.json(locationStore.getAll().map(({ location_id, name }) => ({ location_id, name })));
});
```

### `config/locations.json` seed shape (per D-01/D-02/D-03/D-04, verbatim field names)

```json
[
  { "location_id": "A", "name": "จุด A", "lat": 13.7469, "lng": 100.5349 },
  { "location_id": "B", "name": "จุด B", "lat": 13.7472, "lng": 100.5361 },
  { "location_id": "DORM-1", "name": "หอพัก 1", "lat": 13.7481, "lng": 100.5340 },
  { "location_id": "LIB", "name": "หอสมุด", "lat": 13.7465, "lng": 100.5375 },
  { "location_id": "CAFE", "name": "โรงอาหาร", "lat": 13.7478, "lng": 100.5355 }
]
```
Field names (`location_id`, `name`, `lat`, `lng`) are `[VERIFIED: CONTEXT.md D-02, read this session — "Each location record has the minimum fields implied by SPEC.md: location_id, name, lat, lng"]`. **The lat/lng values above are illustrative placeholders only** `[ASSUMED — not real coordinates, invented purely to produce a syntactically valid example]` — do not treat them as real campus locations; D-03 explicitly defers real names/coordinates to the user. Note the intentional naming-convention split: `location_id` is snake_case (matches the URL query parameter it flows into, and SPEC's own literal field name), while `config/ai-thresholds.json`'s existing fields are camelCase (`urgentMinPercent`) — this is not an inconsistency to "fix"; renaming `location_id` would break the QR URL contract and SPEC compliance.

### `.env.example` addition

```bash
# existing
ANTHROPIC_API_KEY=
PORT=3000
# NEW for Phase 1 — generate via: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
QR_SIGNING_SECRET=
```
`[VERIFIED: .env.example read this session — existing content is exactly `ANTHROPIC_API_KEY=` and `PORT=3000`, flat `KEY=` style with no quoting]`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Express 4 default query parser: `"extended"` (supports nested/bracket query keys via the `qs` module) | Express 5 default: `"simple"` | Express 5.0 | **No impact on this phase** — `location_id`/`sig` are flat keys, parsed identically under both modes. Relevant only if a future phase needs nested query syntax (`?filter[status]=x`), which would then need `app.set('query parser', 'extended')`. `[CITED: expressjs.com/en/guide/migrating-5.html, fetched this session]` |
| Express 4: `req.query` was a writable property | Express 5: `req.query` is a getter (read-only) | Express 5.0 | No impact — this phase never mutates `req.query`. Documented so nobody "fixes" a future bug by trying to reassign it. `[CITED: expressjs.com/en/guide/migrating-5.html]` |
| Express `express.static`: `dotfiles` default | Express 5 default: `dotfiles: 'ignore'` (dotfiles 404) | Express 5.0 | No impact for this phase's `public/css`/`public/js` assets (none are dotfiles). `[CITED: expressjs.com serve-static docs, via search this session]` |
| EJS ≤5.x: published ESM shim (`module.exports = ejs` inside ESM source) caused malformed-ESM warnings under some bundlers | EJS 6.0: CJS surface unchanged, only the packaging/build step changed | EJS 6.0 (2026) | No impact on this CommonJS project — confirms `require('ejs')` still works exactly as before. `[CITED: GitHub search result on mde/ejs, this session]` |

**Deprecated/outdated:** none directly relevant to this phase found — no older QR/HMAC pattern this recommendation is superseding; this is a greenfield decision, not a migration.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | HMAC signature truncated to 128 bits (32 hex chars) is a reasonable security/QR-compactness tradeoff for this threat model | Architecture Patterns → Pattern 1 | Low — 128 bits is far beyond brute-force range for a campus-prankster threat model even if the "ideal" number is debatable; wrong only in the sense of being possibly over- or under-cautious, not insecure. |
| A2 | Hex (not base64url) encoding for the signature is the right default for Phase 1 | Standard Stack → Alternatives Considered | Low — purely a QR-density/readability tradeoff, easily changed later without touching the verification logic's security properties. |
| A3 | System-font stack (`system-ui` + named Thai fallbacks) reliably renders Thai correctly across target devices without an explicit web font | Common Pitfalls #6 | Medium — if wrong, Thai text could render in a fallback glyph-less font (tofu boxes) on some device/OS combination; must be visually confirmed on real devices during UAT (see Environment Availability), not just assumed from general platform knowledge. |
| A4 | No `POST` endpoint is required in Phase 1 at all (Option A of Open Questions #1) vs. a lightweight validate endpoint (Option B, this document's lean) | Open Questions #1 | Medium — affects task breakdown directly; if the user/planner wants Option A, the note-length and location checks stay 100% client-side for this phase, with no automated server-side test possible until a later phase adds a real POST route. |
| A5 | Example `lat`/`lng` values in the `config/locations.json` code sample are placeholder-only, not real coordinates | Code Examples | Low — explicitly labeled as illustrative; risk only if someone copies them in as real data without noticing the caveat. |

## Open Questions

1. **Does Phase 1 need any `POST` endpoint at all, given persistence is explicitly out of scope?**
   - What we know: CONTEXT.md's Phase Boundary explicitly excludes "persisting the report to `waste-reports.json`" from this phase. None of the four success criteria (SUBM-01 through SUBM-04) require a working "submit and get a real response" round trip — they're all about arriving at a correctly-populated form and its load performance.
   - What's unclear: whether the walking-skeleton framing ("routing + one real read + one real UI interaction") is best satisfied by the `GET /report` round-trip alone (location resolution *is* the real read + real interaction), or whether a genuine POST round-trip is also wanted for a fuller vertical slice.
   - Recommendation: build a narrow `POST /api/waste-reports/validate` that accepts `{location_id, sig, note}`, re-verifies the signature/registry rule and the note length, and returns `{valid, errors}` — **no persistence, no photos**. This gives SUBM-02/SUBM-03 genuine server-side enforcement (not just client-side `maxlength`), is cheap to build (a few lines reusing `qrSignature`/`locationStore`), and can plausibly survive into Phase 2 as a "cheap pre-validate before the expensive multipart upload" step rather than being thrown away. If the planner disagrees, Option A (no POST at all, note-length enforcement is 100% client-side for this phase) is a legitimate, SPEC-compliant alternative — this is a genuine fork the planner should decide explicitly, not one this research can lock unilaterally.

2. **Should the invalid-QR error page also offer a path back to the dropdown?**
   - What we know: D-08 explicitly gives a "ไม่ใช่จุดนี้" recovery path for the case of a *valid* QR pointing at the *wrong* (but real) location. SPEC's edge case only specifies the error message text for an *invalid/unregistered* `location_id`, not a recovery UX for that case.
   - What's unclear: whether a user who scans a genuinely broken/forged QR should be stuck on a dead-end error page ("contact staff") or also get an escape hatch to the manual dropdown.
   - Recommendation: offer the dropdown as a secondary option on the error page too ("หรือเลือกจุดจากรายการ" link/button below the error message) — cheap to add since the location list is already being read for the render, and strictly better UX than a dead end, without contradicting anything CONTEXT.md locked. Flagged here rather than silently added because it's not explicitly requested by any locked decision.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | ✓ | v24.18.0 | — `[VERIFIED: node --version, this session]` |
| npm | Package install | ✓ | 11.16.0 | — `[VERIFIED: npm --version, this session]` |
| Chrome/Chromium (for `npx lighthouse`) | FCP measurement (Validation Architecture) | Not directly checked this session — Windows dev machine, Chrome presence not probed | — | If unavailable, fall back to manual DevTools/PageSpeed Insights measurement (human-verify step) instead of scripted `npx lighthouse` |
| Physical mobile device (or Chrome DevTools device emulation + network throttling) | UAT of SUBM-01 (actual QR scan) and SUBM-04 (real 4G/responsive check) | Assumed available (not verifiable from this research session) | — | DevTools device toolbar + "Fast 4G"/"Slow 4G" throttling profile approximates both if a physical device/network isn't on hand for every check |

**Missing dependencies with no fallback:** none identified — every dependency for this phase either is already confirmed present (Node/npm) or has a documented manual fallback.
**Missing dependencies with fallback:** Chrome (for scripted Lighthouse) and a physical test device both have manual/DevTools-based fallbacks if unavailable at execution time.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `node:test` (built-in) + `supertest@^7.2.2` |
| Config file | none — `node:test` needs no config file; test command is a glob passed to `node --test` |
| Quick run command | `node --test test/report.test.js` |
| Full suite command | `node --test` (discovers all `*.test.js` under `test/` by default) |

`[VERIFIED: direct Node v24.18.0 execution, this session]` — a trivial `node:test` file was written and executed against this exact toolchain (`node --test <file>`) and passed (`tests 1, pass 1, fail 0`), confirming the built-in runner works with zero additional setup on this project's Node version.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SUBM-01 | `GET /report` (no params) renders dropdown with all 5 seed locations, no free-text field present | unit/integration | `node --test test/report.test.js` (supertest: assert response contains `<select` and all 5 location names, and does NOT contain a free-text address `<input>`) | ❌ Wave 0 |
| SUBM-01 | `GET /report?location_id=X&sig=<valid>` renders locked state with correct location name | integration | `node --test test/report.test.js` (supertest, using a real signed URL generated in the test setup via `qrSignature.signLocationId`) | ❌ Wave 0 |
| SUBM-02 | `GET /report?location_id=<unregistered>&sig=<anything>` returns HTTP 400 with the exact SPEC error message | integration | `node --test test/report.test.js` (supertest, assert status 400 and body contains "ไม่พบจุดนี้ในระบบ") | ❌ Wave 0 |
| SUBM-02 | `GET /report?location_id=<registered>&sig=<tampered>` (valid id, wrong/forged signature) also returns 400 | integration | same file, additional case | ❌ Wave 0 |
| SUBM-03 | Rendered `<textarea>` has `maxlength="500"` | integration (string-match on HTML response, no browser needed) | `node --test test/report.test.js` | ❌ Wave 0 |
| SUBM-03 | (if Open Questions #1 → Option B) `POST /api/waste-reports/validate` with a 501-character note returns a validation error, using `.length` not byte-length (Thai test string required, see Pitfall #3) | integration | `node --test test/report.test.js` | ❌ Wave 0 |
| SUBM-04 | FCP ≤2s measured against a throttled "4G" profile | **manual-only** — no browser paint-timing engine inside `node:test` | `npx lighthouse http://localhost:3000/report --only-categories=performance --output=json` (default throttling already simulates "slow 4G" + 4x CPU slowdown, matching SPEC's own stated target — see Sources) | N/A — scripted but not part of the automated suite; gate behind `checkpoint:human-verify` per the `lighthouse` SUS flag |
| SUBM-04 | Correct rendering at 375px/768px/1024px | **manual-only** — visual/layout correctness is not meaningfully unit-testable without a real or headless browser and visual assertions, which this project has no infrastructure for yet | Browser DevTools device toolbar at the three widths, or Chrome responsive mode screenshots | N/A — manual UAT step |

### Sampling Rate
- **Per task commit:** `node --test test/report.test.js` (fast, seconds — no browser involved)
- **Per wave merge:** `node --test` (full suite)
- **Phase gate:** Full suite green, plus the two manual-only SUBM-04 checks (Lighthouse FCP run + responsive visual check) before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `test/report.test.js` — covers SUBM-01/02/03 per the table above
- [ ] `test/conftest`-equivalent shared setup (a small helper that signs a valid `sig` for a given test `location_id`, reusing `src/services/qrSignature.js`)
- [ ] Framework install: `npm install --save-dev supertest@^7.2.2` — `node:test` itself needs no install (built-in)
- [ ] No `test/` directory exists yet in this repo at all — this is a from-scratch Wave 0, not an extension of existing tests

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Intentionally absent by design — SPEC requires no login for reporters. Not a gap; do not add. |
| V3 Session Management | No | No sessions created anywhere in this phase. |
| V4 Access Control | No | No privileged actions exist in this phase's scope (registry is read-only from the app's perspective; hand-editing `locations.json` is an out-of-band ops action, not an app-level access-control concern). |
| V5 Validation, Sanitization and Encoding | Yes | `note` length via `.length` (UTF-16 code units, both client `maxlength` and any server re-check — Pitfall #3); `location_id`/`sig` format validated before use (Pitfalls #1/#2); every server-rendered value goes through EJS's `<%= %>` auto-escaping, never `<%- %>` for data. |
| V6 Stored Cryptography | Yes (narrow) | HMAC-SHA256 via Node's built-in `crypto`; secret lives only in `QR_SIGNING_SECRET` (env var, never hardcoded, never committed); comparison via `crypto.timingSafeEqual`, never `===`. |
| V7 Error Handling and Logging | Yes (light) | One generic user-facing message for all QR-validation failure modes (Anti-Patterns); the *specific* reason (bad signature vs. unknown id vs. missing param) may be logged server-side but must not reach the response body. |

### Known Threat Patterns for this phase's stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged/hand-typed QR URL (`?location_id=<known-id>` with no real QR scan) | Spoofing | HMAC-SHA256 signature over `location_id`, verified server-side with `timingSafeEqual` (Pattern 1) |
| Query-string tampering (swap `location_id`, reuse an old/mismatched `sig`) | Tampering | Same HMAC signature — tampering the id invalidates the signature, verified directly this session (Pattern 1's verified example) |
| Reflected XSS via `location_id`/`sig`/`note` echoed into an error or form re-render | Tampering (script injection) | EJS `<%= %>` auto-escaping on every interpolation, no exceptions for "trusted" config-sourced values (Anti-Patterns) |
| Information disclosure via distinct QR-error messages revealing *why* validation failed | Information Disclosure | Single generic SPEC-mandated message for every QR failure mode (Anti-Patterns) |
| Malformed `config/locations.json` (BOM, hand-edit typo) crashing the app confusingly mid-request rather than at a predictable point | (Availability, minor) | Strip a leading BOM defensively on read (Pitfall #4); fail loudly and specifically at startup/first-read rather than mid-request. **Note:** a full lock/backup/fallback system (as SPEC requires for `waste-reports.json` via STORE-01) is **not** requested for `locations.json` by CONTEXT.md and would be scope creep — this phase only needs a clear failure mode, not Phase 3's full persistence-safety machinery. |
| No-auth submission endpoint abuse (spam, cost) | Denial of Service | **Explicitly deferred to Phase 6 (ABUSE-01/02) per CONTEXT.md's Phase Boundary.** Noted here for honesty/defense-in-depth awareness, not as a Phase 1 action item — do not add rate limiting in this phase, that would contradict the locked phase scope. |

## Sources

### Primary (HIGH confidence — direct execution against this project's actual toolchain, this session)
- Node v24.18.0 direct execution: Thai-text `.length` vs `Buffer.byteLength` behavior, UTF-8 BOM + `JSON.parse` failure, `crypto.createHmac`/`timingSafeEqual` sign-verify round trip and length-mismatch throw, `Buffer.from(str,'hex')` malformed-input truncation, `node --test` runner execution — all commands and raw output captured in this research session.
- This repo, read directly this session: `.planning/phases/01-location-submission-entry/01-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/PROJECT.md`, `.claude/CLAUDE.md`, `SPEC.md`, `index.js`, `package.json`, `.env.example`, `config/ai-thresholds.json`, `src/routes/classify.js`, `src/services/wasteImageClassifier.js`, `src/services/imageType.js`, `.planning/config.json`, `.planning/research/ARCHITECTURE.md`, `.planning/research/FEATURES.md`, `.planning/research/PITFALLS.md`.
- `npm view <pkg> version|engines|time.created|deprecated|scripts.postinstall` for `qrcode`, `ejs`, `lighthouse`, `supertest`, `express` — run live this session, 2026-08-19.
- `gsd-tools query package-legitimacy check` — run live this session for `qrcode`, `ejs`, `lighthouse`, `supertest`.

### Secondary (MEDIUM confidence — official docs/README fetched this session)
- [Express: Migrating to Express 5](https://expressjs.com/en/guide/migrating-5.html) — query parser default change, `req.query` getter, `dotfiles` default — fetched and quoted this session.
- [web.dev: First Contentful Paint](https://web.dev/articles/fcp) — Good/Needs-Improvement/Poor thresholds and metric definition — fetched and quoted this session.
- [MDN: maxlength HTML attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/maxlength) — UTF-16 code unit measurement — fetched and quoted this session.
- [node-qrcode README (soldair/node-qrcode)](https://raw.githubusercontent.com/soldair/node-qrcode/master/README.md) — `toFile()` API, `errorCorrectionLevel` options — fetched this session.
- [EJS README (mde/ejs)](https://raw.githubusercontent.com/mde/ejs/main/README.md) — `<%= %>` vs `<%- %>` escaping behavior, v6.0 bundler-compat note — fetched this session.
- [Node.js crypto docs — timingSafeEqual](https://nodejs.org/api/crypto.html#cryptotimingsafeequala-b) — signature/behavior — fetched this session (cross-checked against direct execution, see Primary).

### Tertiary (LOW-MEDIUM confidence — WebSearch-aggregated, multiple independent sources)
- QR error-correction-level recommendations for outdoor/printed signage (Level H, ~30% recovery, ≥1.5" print size) — converged across several QR-vendor blog sources (the-qrcode-generator.com, qrcodekit.com, inventivehq.com, qr-insights.com); vendor content, not a formal spec, but directionally consistent across independent sources.
- Lighthouse default throttling ("simulates a typical 4G connection and mid-tier phone") — WebSearch summary, cross-referenced against `lighthouse`'s own npm registry entry and GitHub org.

## Metadata

**Confidence breakdown:**
- QR signing pattern (HMAC + timingSafeEqual): HIGH — directly executed and verified against this project's real toolchain, not just documented behavior taken on faith.
- Thai character-counting pitfall: HIGH — directly executed with a real Thai string on this exact Node version.
- EJS/SSR recommendation: MEDIUM-HIGH — official README + changelog confirmed current API and CJS compatibility; the "recommend EJS over hand-rolled" judgment itself is a reasoned synthesis, not a single authoritative source's mandate.
- FCP/responsive automated testing strategy: MEDIUM — Lighthouse CLI usage is well-documented and its default throttling matches SPEC's "4G" wording well, but this project has zero prior test infrastructure to anchor against, and the manual-only classification for two of four SUBM-04 checks is this document's own judgment call, flagged as such.
- QR physical print/error-correction guidance: LOW-MEDIUM — vendor-blog-sourced, directionally useful for the `errorCorrectionLevel: 'H'` recommendation but not a formal specification.

**Research date:** 2026-08-19
**Valid until:** 2026-09-18 (30 days — package versions and Express/EJS specifics should be re-checked via `npm view` at execution time regardless, since `ejs@6.0.1` was published only ~2 weeks before this research date and the ecosystem is evidently still active).
