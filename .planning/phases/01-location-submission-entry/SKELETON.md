# Walking Skeleton — TeamBoard (ระบบแจ้งจุดขยะภายในมหาวิทยาลัย)

**Phase:** 1
**Generated:** 2026-08-19

## Capability Proven End-to-End

> One sentence: the smallest user-visible capability that exercises the full stack.

A person who scans a registered, HMAC-signed QR sticker on a campus bin lands on `GET /report`, and the server — having read `config/locations.json` and verified the signature — renders the report form with that location already confirmed and locked, with no login and no free-text address anywhere on the page.

This is the Phase-1 tracer: one entry point (`GET /report?location_id=…&sig=…`) wired through every layer this project has (route → signature service → registry read → server-rendered view → browser), production-quality, with a real end-to-end `node --test` + `supertest` assertion. Every later slice in this phase and every later phase expands outward from this path.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Runtime | Node.js ≥22 (v24.18.0 installed), `"type": "commonjs"` | Already pinned by the project; other phases' dependencies (`file-type@22`, `p-retry@8`) declare `engines.node >= 22`. CommonJS is the existing module system — `require()` everywhere, no ESM migration in Phase 1. |
| HTTP server / router | Express `^5.2.1` (already installed) | Existing `index.js` + `src/routes/classify.js` already use it. Express 5 query parser is `simple`, which parses the flat `location_id`/`sig` keys identically to Express 4 — no config change needed. |
| Server-side rendering | EJS `^6.0.1` via `app.set('view engine','ejs')` + `views/` at repo root | `GET /report` content depends on request-time data (query params + a file read), so it cannot be a static file. EJS's `<%= %>` auto-escapes by default, structurally removing the "forgot to call escapeHtml()" reflected-XSS class. Ships zero client JS and needs no build step, so it does not violate the project's no-bundler/no-framework constraint (that constraint targets client-side frameworks). Reusable by Phase 4's officer dashboard, which renders user-supplied `note`/`changed_by`. |
| Client-side JS | Vanilla, one file (`public/js/report.js`), no modules bundling, no framework | Project constraint (`.claude/CLAUDE.md` "What NOT to Use"). Client JS handles only the note counter, the locked→dropdown toggle, and the validate-request fetch. |
| Styling | Hand-authored `public/css/report.css`, mobile-first `min-width` media queries, system font stack | UI-SPEC declares no design system and no component library. A system font stack (`system-ui, -apple-system, "Segoe UI", "Leelawadee UI", "Noto Sans Thai", sans-serif`) ships zero extra network requests, which is load-bearing for the FCP ≤2s/4G budget (SUBM-04). |
| Location registry ("data layer") | Hand-maintained flat JSON at `config/locations.json`, read at request time via `src/services/locationStore.js` | Locked by D-01. Follows the existing `config/ai-thresholds.json` convention (flat JSON, no build step, read at request time by a service). No database — project constraint. Reader strips a leading BOM before `JSON.parse` because D-03 says a non-developer will hand-edit this file, likely on Windows. |
| QR anti-forgery | HMAC-SHA256 over `location_id` keyed by `QR_SIGNING_SECRET`, truncated to 16 bytes / 32 hex chars, appended as `&sig=`; verified server-side with `crypto.timingSafeEqual` | Resolves the CONTEXT.md "Claude's Discretion" item on QR payload format, and is the exact pattern `.claude/CLAUDE.md` names. A bare `location_id` would let anyone hand-type a URL and be treated as if they had physically scanned a QR at that bin. Node's built-in `crypto` — zero new dependency. **Gated by a `checkpoint:decision` in plan `01-01` because it is a one-way door** (see Reversibility below). |
| Auth | None, by design | SPEC and PROJECT.md Core Value both require reporting with no login. There is no session, no cookie, no user record in this phase or any later one for the reporter side. |
| QR image generation | One-off ops CLI at `scripts/generate-qr.js` using `qrcode@^1.5.4`, `errorCorrectionLevel: 'H'`, output to gitignored `qr-output/` | Not an HTTP route. SPEC frames QR registration as a future *admin UI* concern, and CONTEXT.md puts an admin UI out of scope for Phase 1. A CLI produces scannable PNGs for UAT without building or securing a new route. |
| Test runner | `node:test` (built-in) + `supertest@^7.2.2`, tests under `test/`, `npm test` → `node --test` | Project's already-declared testing direction (`.claude/CLAUDE.md`). Zero config file, ~5s feedback latency. `index.js` guards `app.listen` behind `require.main === module` so `supertest` can import the app without binding a port. |
| Deployment target | Local full-stack run: `npm start` → `http://localhost:3000/report` | No hosting target is chosen or in scope for this milestone. The documented local run command exercises the complete stack (route + registry read + signature verify + SSR + static assets + client JS + validate POST). |
| Directory layout | `src/routes/` + `src/services/` (services never import `express`), `config/`, `views/`, `public/{css,js}/`, `scripts/`, `test/` — all siblings at repo root | Extends the layout already established by `src/routes/classify.js` and `src/services/imageType.js`; `views/`, `public/`, `scripts/`, `test/` sit at the root the same way `config/` already does. |

## Stack Touched in Phase 1

- [ ] Project scaffold — dependency install (`ejs`, `qrcode`, `supertest`), `QR_SIGNING_SECRET` in `.env.example`, real `npm test` script, `test/` directory created from scratch (plan `01-01`)
- [ ] Routing — `GET /report` (three states), `GET /api/locations`, `POST /api/waste-reports/validate` mounted on the existing Express app alongside `classifyRouter` (plans `01-01`, `01-02`, `01-06`)
- [ ] Data layer — a real read of `config/locations.json` through `locationStore.getAll()` / `findById()` on every request (plan `01-01`). There is **no write** in Phase 1: persistence to `waste-reports.json` is Phase 3 (STORE-01), explicitly out of scope per CONTEXT.md's Phase Boundary. The read is the real data-layer exercise this skeleton proves.
- [ ] UI — server-rendered form with a real interactive element wired to the API: the "ถัดไป" CTA POSTs to `/api/waste-reports/validate` and renders the server's verdict (plan `01-06`); the "ไม่ใช่จุดนี้" control and the note counter are real client interactions against already-shipped DOM (plan `01-05`)
- [ ] Deployment — documented local full-stack run: `npm start`, then `http://localhost:3000/report` for the dropdown path and a signed URL printed by `node scripts/generate-qr.js` for the QR path (plans `01-01`, `01-04`)

## Reversibility of the Skeleton's Decisions

| Decision | Rating | Undo cost |
|---|---|---|
| `config/locations.json` as the registry (D-01) | costly | Migrating to an admin-managed store means rewriting the read path and adding a write/registration path; every consumer of `locationStore` changes shape. |
| Dropdown (not map/pin) as the manual picker (D-05) | costly | Switching to a map is a real UI rebuild plus a new mapping dependency, and reopens the FCP budget. |
| HMAC-signed QR URL payload format | **one-way** | Once QR stickers are printed and physically installed on campus bins, changing the payload shape or rotating the secret invalidates every deployed sticker — the undo is a physical reprint-and-reinstall campaign, not a code change. Gated by `checkpoint:decision` in `01-01`. |
| EJS as the template engine | reversible | Behind `res.render()`; swapping engines touches one `app.set()` call and the template files. |

## Out of Scope (Deferred to Later Slices)

> Anything that is *not* in the skeleton. Explicit, so future phases do not re-litigate Phase 1's minimalism.

- Photo upload, MIME magic-byte validation, face-blur (Phase 2 — PHOTO-01/PHOTO-02)
- AI waste classification and urgency computation (Phase 2 — AI-01/AI-02/AI-03; the existing `src/routes/classify.js` proof-of-concept is **not touched** by Phase 1)
- Persisting a report to `waste-reports.json`, file locking, backup, corrupt-file fallback (Phase 3 — STORE-01). `POST /api/waste-reports/validate` in Phase 1 validates and returns a verdict; it writes nothing.
- Officer queue, urgency sorting, status transitions, `changed_by` (Phase 4)
- LINE notification push and retry (Phase 5)
- Rate limiting and duplicate-report dedup (Phase 6 — ABUSE-01/ABUSE-02). Deliberately absent from Phase 1 per CONTEXT.md's Phase Boundary; the `T-01-05` threat row records this as an accepted, phase-scoped risk rather than an oversight.
- Admin UI for registering new locations and minting their QR codes (SPEC Scalability; CONTEXT.md puts it out of scope). `scripts/generate-qr.js` covers the need at ops level.
- A lock/backup/fallback system for `config/locations.json` — SPEC requires that machinery for `waste-reports.json` only (STORE-01). `locations.json` needs a clear, loud failure mode, not Phase 3's persistence-safety stack.
- Real campus location names and coordinates — D-03 defers these to the user; the 5 seeds are hand-editable placeholders.
- Any hosting/CDN/deployment platform choice.

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering its architectural decisions:

- **Phase 2:** the same `/report` form gains a photo input; the upload posts to the existing `classifyRouter` surface, face-blurs, and renders the AI verdict inline — reusing `views/report.ejs` and `public/js/report.js`.
- **Phase 3:** the validate endpoint's successful verdict becomes a real persisted write to `waste-reports.json` behind a file lock, with backup and fallback.
- **Phase 4:** a second EJS view (officer queue) renders persisted reports, urgency-sorted, with one-way status transitions — reusing the same view engine and the same `{ error: '<Thai message>' }` response convention.
- **Phase 5:** a successful persist emits a LINE push with retry, off the request's critical path.
- **Phase 6:** rate limiting and dedup wrap the submission route, keyed on IP and `location_id` — the `location_id` contract established here is exactly what the dedup key consumes.
