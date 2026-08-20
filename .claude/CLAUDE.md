<!-- GSD:project-start source:PROJECT.md -->

## Project

**Smart Waste Alert — ระบบแจ้งจุดขยะภายในมหาวิทยาลัย**

ระบบสำหรับแจ้งจุดที่มีขยะหรือถังขยะเต็มภายในมหาวิทยาลัย ให้เจ้าหน้าที่ได้รับแจ้งและเข้าดำเนินการได้อย่างรวดเร็ว ผู้ใช้งานแจ้งได้โดยไม่ต้อง login ผ่านการสแกน QR Code หรือเลือกจุดจากรายการ พร้อมแนบรูปภาพขยะ โดยมี AI ช่วยจำแนกประเภทขยะและวิเคราะห์ระดับความเร่งด่วนในการจัดเก็บจากรูปภาพที่แนบมา

**Core Value:** ผู้ใช้งานแจ้งจุดขยะได้อย่างรวดเร็วโดยไม่ต้อง login และเจ้าหน้าที่เห็นรายการที่เร่งด่วนที่สุดก่อนเสมอ เพื่อให้เข้าดำเนินการจัดเก็บได้เร็วที่สุด — ถ้าสิ่งนี้ไม่ทำงาน ระบบทั้งหมดก็ไม่มีความหมาย

### Constraints

- **Tech stack**: Node.js + Express, JSON file storage (`waste-reports.json`) — ไม่ใช้ database ตาม SPEC
- **Security**: ต้องตรวจสอบ MIME type จริงของไฟล์ภาพ (ไม่เชื่อนามสกุลไฟล์อย่างเดียว), จำกัดขนาดไฟล์ 5MB, ไม่ serve `waste-reports.json` เป็น static file, sanitize ทุก field ข้อความก่อนแสดงผล (ป้องกัน stored XSS)
- **AI Ethics**: ผลจำแนกจาก AI เป็นคำแนะนำเท่านั้น การตัดสินใจสุดท้ายเป็นหน้าที่เจ้าหน้าที่เสมอ ต้องทำ face-blur อัตโนมัติเพื่อไม่เก็บข้อมูลส่วนบุคคลที่ไม่จำเป็น
- **Compatibility**: ต้องรองรับโทรศัพท์มือถือและ responsive ตาม breakpoint ที่ระบุใน SPEC

<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->

## Technology Stack

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | 22 LTS or newer (24.x installed locally) | Runtime | Required as a floor because two recommended libraries below (`p-retry@8`, `file-type@22`) declare `engines.node >= 22`. Set `"engines": {"node": ">=22"}` in `package.json` so deploy targets don't silently break. |
| Express | ^5.2.1 (already in `package.json`) | HTTP server/router | Express 5.2 (Dec 2025) is the Technical Committee's current endorsed production release; Express 4 is in sunset/maintenance. Express 5 also closes a ReDoS class in path-matching that Express 4 apps must otherwise patch manually. No change needed — project already pinned correctly. |
| Plain HTML/CSS/JS (native ES modules, no bundler) | — | Frontend | Meets the FCP ≤2s-on-4G / 375–1024px-responsive requirement with the least possible shipped JS. Modern browsers fully support `<script type="module">`, `fetch`, `FormData`, CSS Grid/`clamp()`/container queries — a build step (Vite/webpack) buys nothing here and adds a compile step this project explicitly wants to avoid. Serve via `express.static` with `Cache-Control` + `ETag`. |
| `dotenv` | ^17.4.2 (already in use) | Env config (Claude API key, LINE tokens) | Standard, zero-risk choice for a single-server Node app; no reason to introduce a heavier config framework. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `multer` | ^2.2.0 (already in use) | `multipart/form-data` upload parsing | Already wired up for the classify endpoint. Configure `limits: { fileSize: 5*1024*1024, files: 3 }` and a `fileFilter` allowlisting `.jpg/.jpeg/.png/.webp` by extension — but treat this as the *first*, not the only, validation layer (Multer's `file.mimetype` is client-supplied and trivially spoofable). |
| `file-type` | 22.0.2 | True MIME-type detection from magic bytes (binary signature, e.g. JPEG = `FF D8 FF`) after upload, before any file touches disk permanently | Every accepted upload, right after Multer buffers it (`storage: multer.memoryStorage()`) and before it's written or sent to Claude. **Caveat:** v22 is ESM-only and requires Node ≥22; the project is `"type": "commonjs"`, so import it via `const { fileTypeFromBuffer } = await import('file-type');` inside an async function — this is a standard, safe CJS↔ESM interop pattern, not a blocker. |
| `sharp` | 0.35.3 | Image resize/normalize, EXIF metadata stripping, and applying the face-blur region before the file is persisted | Run on every accepted image: (1) strip EXIF (phones embed GPS coordinates and device info in JPEGs — stripping this is a privacy requirement even beyond face-blur), (2) resize to a sane max dimension to keep JSON-referenced files small and dashboard load fast, (3) apply `.blur()`/box-fill over face regions once bounding boxes are known. Uses libvips — 4-5x faster than ImageMagick and the de facto standard Node image library. |
| `write-file-atomic` | 8.0.0 | Crash-safe writes to `waste-reports.json` | Wrap every write: writes to a temp file, `fsync`s, then renames over the target — eliminates the "process killed mid-`fs.writeFile`, JSON now truncated/corrupt" failure mode the SPEC explicitly calls out (fallback-to-backup requirement). Use for the backup copy too (copy current file to `waste-reports.backup.json` before overwriting). |
| `proper-lockfile` | 4.1.2 | Serialize the read-modify-write cycle on `waste-reports.json` | This is the direct implementation of the SPEC's own wording: *"เขียนผ่าน file lock ทีละครั้ง (เขียนเสร็จค่อยปล่อย lock ให้คำขอถัดไป)"*. Acquire the lock, read file, mutate in memory, back up, atomic-write, release. Uses an atomic `mkdir`-based strategy (portable, no native deps) with mtime-based staleness detection and auto-release on normal process exit. Preferred over a bare in-process mutex because it still protects the file if the app is ever run as more than one OS process (PM2 cluster, a stray second `node index.js`, a crashed-and-restarted process holding a stale handle). |
| `qrcode` | 1.5.4 | Server-side QR code generation for registered locations | Generate one QR per `location_id` in the admin/registration flow, encoding a URL like `https://<host>/report?location_id=LIB-01&sig=<hmac>`. This is the most-downloaded, most-recommended Node QR generator ("recommended for 95% of use cases unless you need custom styling/logos"); outputs PNG/SVG directly, no native deps. |
| Node built-in `crypto` (`createHmac`) | built-in | Sign/verify the `location_id` embedded in each QR | The SPEC requires QR codes to be un-forgeable/un-cloneable and to 400-reject any `location_id` not in the registered list. Append an HMAC-SHA256 signature (keyed by a server-side secret) to the QR payload/URL; on scan, recompute and compare, *and* confirm the id still exists in the locations list. No extra package needed — this is exactly what Node's `crypto` module is for, and it avoids a whole class of "QR encodes a bare id, attacker mints their own QR pointing at a real id but wrong data" tampering. |
| `html5-qrcode` | 2.3.8 | *Optional* in-app camera QR scanner (only if you want a "Scan" button inside the web app itself, as opposed to relying on the phone's native camera app opening the encoded URL directly) | Most campus deployments should just let the phone's native camera app scan the QR and open the URL — zero JS, zero permissions dance, works identically on iOS/Android. Only reach for `html5-qrcode` if product wants an in-page scanner (e.g., for a shared kiosk tablet without a QR-aware camera app). It's the most complete/plug-and-play option and specifically handles known iOS camera-permission/orientation quirks better than the alternatives. |
| `@line/bot-sdk` | 11.2.0 | LINE Messaging API client — push the "new report" notification to the staff group | Official LINE SDK; supports both CJS and ESM, requires Node ≥18 (well under the ≥22 floor already needed for other deps). Use `messagingApi.MessagingApiClient` and its `pushMessage()` (or `multicast()`), not a raw `fetch` to the LINE HTTP endpoint — the SDK owns request signing, retries-on-connection-level-failures, and typed message builders (Flex Message is worth using here so the "urgent" tag/color is visually obvious in the LINE app itself). |
| Hand-rolled retry helper (no dependency) *or* `p-retry` | `p-retry` 8.0.0 if used | Retry the LINE push 3x with exponential backoff on failure | The SPEC's retry requirement is narrow and fixed (3 attempts, exponential backoff, then log+flag as failed) — a ~15-line `async function retryWithBackoff(fn, {retries=3, baseMs=500})` fully covers it with zero new dependencies and zero ESM-interop concerns. If you'd rather standardize retry logic across this call *and* future outbound calls (e.g., a flaky Claude API request), pull in `p-retry` instead — it's now the ecosystem-standard retry lib (superseding `async-retry`, which is CJS-only and less actively maintained), but note **v8 requires Node ≥22 and is pure ESM**, so a CommonJS project must call it via `const pRetry = (await import('p-retry')).default;`. |
| `express-rate-limit` | 8.6.2 | Enforce the 5 reports/hour/IP limit | Standard, ~10M-weekly-download Express rate-limiting middleware. Default in-memory store is sufficient for a single-instance deployment (which this project is); only reach for a Redis/external store if the app is later horizontally scaled. Apply it specifically to the report-submission route, keyed by IP. |
| `sanitize-html` | 2.17.7 | Strip/escape any HTML in user-entered `note` and `changed_by` fields before they're ever rendered on the staff dashboard | The SPEC explicitly calls out stored-XSS prevention for these two free-text fields. Prefer `sanitize-html` over `DOMPurify` here: DOMPurify's server-side story requires bundling `jsdom` (heavy, and documented CVEs in older `jsdom` versions have caused DOMPurify+jsdom to *fail* to stop XSS — combining DOMPurify with the lighter `happy-dom` is explicitly *not recommended*). `sanitize-html` has no DOM dependency, a small config surface (allow zero tags for these two fields — treat them as plain text, not "safe HTML"), and is purpose-built for exactly this server-side use case. |
| `helmet` | 8.3.0 | Standard Express security headers (CSP, `X-Content-Type-Options`, HSTS, etc.) | One-line `app.use(helmet())` baseline hardening; there's no reason to hand-roll these headers. |
| Node built-in `crypto.randomUUID()` | built-in | Generate `report_id` / other unique ids | Node has shipped a spec-compliant UUID v4 generator natively since Node 14.17/15.6 — no need for the `uuid` package for this project's needs. |
| Node built-in `node:test` + `supertest` | supertest 7.2.2 | Unit + HTTP-endpoint tests | Node's built-in test runner (zero install, `node --test`) is the lightweight-stack-consistent choice over Jest/Vitest for a project this size; pair with `supertest` for exercising Express routes (upload validation, rate limit, status-transition rules) without spinning up a real server/port. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `nodemon` (3.1.14) | Auto-restart dev server on file change | Dev-only; add an `nodemon.json` ignoring `data/*.json` and `uploads/*` so report submissions during dev don't trigger restarts. |
| `eslint` (10.8.1) + `prettier` (3.9.6) | Lint/format | Keep config minimal — this project doesn't need a framework-specific ESLint config (no React/Vue), just `eslint:recommended` + a Node-env override. |

## Installation

# Core (Express/Multer/Claude SDK/dotenv already installed)

# Optional — only if an in-app camera scanner is wanted instead of relying on native camera

# Optional — only if standardizing retry logic beyond the LINE push

# Dev dependencies

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|--------------------------|
| `proper-lockfile` + `write-file-atomic` for the JSON store | `async-mutex` (in-process mutex only) | If you are certain the app will **never** run as more than one OS process (no PM2 cluster mode, no risk of a stray duplicate process) and want to shave one dependency — an in-process mutex around the read-modify-write is simpler and has zero filesystem-lock overhead. It does **not** protect against a second process touching the same file, so it's a narrower guarantee than the SPEC's wording implies. |
| `file-type` for magic-byte MIME detection | `magic-bytes.js` | If the ESM-only nature of `file-type` v22 becomes friction (e.g., you don't want any `await import()` calls in a CJS codebase); `magic-bytes.js` ships CJS-compatible and covers the same signature-detection need, with a smaller/less curated signature database. |
| Native-camera QR scan (URL-encoded QR, zero JS) | `html5-qrcode` (in-app scanner) | Use the in-app scanner only when you need scanning to happen *inside* the web page itself (shared kiosk device, embedded webview, or a UX requirement to never leave the app) — otherwise it's unnecessary JS weight and camera-permission friction versus just letting the OS camera app open the QR's URL. |
| `html5-qrcode` (if an in-app scanner is built) | `jsQR` (1.4.0) | If you're already driving your own `<video>`/`<canvas>` capture loop and just need raw frame decoding, `jsQR` is a much smaller, dependency-free decode-only library — faster and lighter, but you own all camera plumbing, iOS quirks, and UI yourself. |
| Extend the existing Claude Vision call to also return face bounding boxes, then blur with `sharp` | `@vladmandic/face-api` + `@tensorflow/tfjs-node` (self-hosted face detector) | Use the self-hosted detector only if you want face-blur to work **without** any dependency on the Claude API being reachable/paid for that step, or if sending un-blurred images to Claude is itself a privacy concern for the university. It's a materially heavier install (native `tfjs-node` addon, tens of MB, more fragile on Windows) for a project whose stated goal is to stay lightweight — and the image is already being sent to Claude for waste classification, so reusing that same call for face bounding boxes adds no new data exposure. *(Confidence on this comparison is LOW — verify current `@vladmandic/face-api` maintenance status and Windows install experience before committing, since it wasn't independently cross-checked.)* |
| `p-retry` / hand-rolled backoff for LINE push retries | `async-retry` | Only if you need to stay on Node <22 or need CJS with no dynamic-import interop anywhere — `async-retry` is CJS-native but less actively maintained than `p-retry`. |
| `sanitize-html` for XSS-safe text fields | `DOMPurify` + `jsdom` | Only relevant if the app later needs to accept and safely render actual rich/HTML content from users (which this SPEC does not — `note`/`changed_by` are plain text). If that need arises, pin `jsdom` ≥20 specifically (earlier versions have documented DOMPurify-defeating bugs). |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Trusting `multer`'s `file.mimetype` or the filename extension alone | Both are client-supplied strings and trivially forged (rename a `.php`/`.svg` to `.jpg`, or spoof the `Content-Type` header) — this is exactly the vulnerability class the SPEC calls out. | `file-type`'s magic-byte detection on the buffered content, as the authoritative check. |
| A database (Postgres/MySQL/SQLite/Mongo) "just in case" | Explicitly out of scope per SPEC and PROJECT.md constraints — introduces migration/ops overhead this greenfield, single-JSON-file project doesn't need at current scale. | `waste-reports.json` + the lock/atomic-write pattern above. If report volume later grows past what a JSON file comfortably handles, that's a deliberate future migration decision, not a default. |
| A frontend framework (React/Vue/Svelte) or a bundler (Vite/webpack/Rollup) for the report form | Explicitly against the "no build-heavy frontend framework" constraint and the ≤2s-FCP-on-4G budget — framework runtime + hydration + a build pipeline is pure overhead for a form + a status dashboard. | Plain HTML/CSS + native ES modules, served directly by `express.static`. |
| `express-fileupload` or hand-rolled `busboy` wiring instead of Multer | Project already has a working Multer-based upload flow (`wasteImageClassifier.js`/classify endpoint) — swapping upload libraries mid-project is pure churn with no functional benefit here. | Keep `multer`; add `file-type` + `sharp` as the missing validation/processing layers. |
| DOMPurify + `happy-dom` for server-side sanitization | Explicitly documented as unsafe — `happy-dom` does not provide the DOM guarantees DOMPurify relies on, and combining them is known to permit XSS bypasses. | `sanitize-html` (no DOM dependency at all for the plain-text-field use case this project has). |
| `uuid` package for id generation | Node has had a built-in, spec-compliant `crypto.randomUUID()` since Node 14.17/15.6; this project already requires Node ≥22. | `crypto.randomUUID()`. |
| `p-retry` (or any dependency) for a fixed "retry 3x with exponential backoff" requirement, if you want to minimize dependencies | The requirement is narrow enough (3 attempts, one call site initially) that a dependency buys little over a small local helper, and it avoids `p-retry` v8's Node≥22/pure-ESM constraints entirely. | A ~15-line hand-rolled `retryWithBackoff()` utility — reach for `p-retry` only if retry logic needs to be reused across multiple call sites (LINE push, Claude API, etc.). |

## Stack Patterns by Variant

- `proper-lockfile` is still recommended (cheap insurance, matches the SPEC's literal wording), but `async-mutex` is an acceptable lighter substitute — document the choice either way so a future "let's run 2 instances behind a load balancer" change doesn't silently reintroduce the race condition.
- Keep metadata (location, note, status, AI classification, timestamps) in `waste-reports.json`; store the actual image files on disk (or object storage) referenced by path/id, never inline as base64 in the JSON — this is already implied by the Multer+`sharp` flow above and keeps the JSON file itself small and fast to lock/read/write.
- Use `@line/bot-sdk`'s Flex Message builder rather than plain text — it's part of the same SDK, no new dependency, and directly supports the "urgent items must be visually obvious" requirement.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `file-type@22.x` | Node ≥22, CJS project via `await import()` | ESM-only package; confirmed `engines.node: ">=22"` on the npm registry today. Do not `require()` it directly. |
| `p-retry@8.x` | Node ≥22, CJS project via `await import()` | Same ESM-only/Node≥22 situation as `file-type`; confirmed via npm registry `engines` field. |
| `@line/bot-sdk@11.x` | Node ≥18, works from CJS (`require`) or ESM | No interop friction — safe to `require()` directly in this project's `"type": "commonjs"` setup. |
| `express@5.2.x` | `multer@2.x`, `express-rate-limit@8.x`, `helmet@8.x` | All current major versions target Express 5 / modern Node; no known incompatibilities as of this research date. |
| `sharp@0.35.x` | Node ≥20.9 (Node-API v9) | Project's Node 24 comfortably exceeds this; if deploying to older infra, verify the target Node satisfies Node-API v9 support before locking this version. |

## Sources

- npm registry `npm view <pkg> version` / `npm view <pkg> engines` (live, run 2026-08-18) — `qrcode`, `file-type`, `write-file-atomic`, `proper-lockfile`, `@line/bot-sdk`, `p-retry`, `express-rate-limit`, `sharp`, `sanitize-html`, `helmet`, `html5-qrcode`, `multer`, `express`, `@anthropic-ai/sdk`, `async-mutex`, `jsqr`, `uuid`, `nodemon`, `supertest`, `eslint`, `prettier` — MEDIUM confidence (authoritative for version/engines fields; this is the registry itself, not a secondary description of it)
- WebSearch: "multer file upload MIME type magic byte validation Node.js best practices security" — MEDIUM (multiple independent sources agree: Transloadit, nodejs-security.com, Sourcery)
- WebSearch: "file-type npm package detect file type from buffer magic bytes Node.js" — MEDIUM
- WebSearch: "write-file-atomic npm package atomic file writes Node.js" — MEDIUM
- WebSearch: "proper-lockfile npm package file locking concurrent writes Node.js" — MEDIUM
- WebSearch: "qrcode npm package generate QR code Node.js server side PNG SVG" — MEDIUM
- WebSearch: "html5-qrcode vs jsQR browser QR code scanner camera library comparison" — MEDIUM
- WebSearch: "@line/bot-sdk npm package LINE Messaging API push message Node.js latest version" — MEDIUM
- WebSearch: "async-retry vs p-retry npm exponential backoff retry Node.js 2025" — MEDIUM
- WebSearch: "express-rate-limit npm package Express 5 IP rate limiting configuration" — MEDIUM
- WebSearch: "sharp npm package image resizing Node.js version 2025 2026" — MEDIUM
- WebSearch: "face-api.js vs @vladmandic/face-api Node.js server side face detection blur maintained 2025" — LOW (single-source, not independently cross-checked — flagged explicitly above)
- WebSearch: "lightweight face detection Node.js without TensorFlow face blur image API 2025" — LOW
- WebSearch: "DOMPurify server side Node.js jsdom vs sanitize-html XSS sanitize user text" — MEDIUM
- WebSearch: "vanilla JavaScript no build tool lightweight frontend ES modules 2025 mobile responsive best practice" — MEDIUM
- WebSearch: "Express 5 vs Express 4 2025 2026 stable production recommended" — MEDIUM (InfoQ, Express.js official migration guide, HeroDevs support-lifecycle post)
- Local inspection: `D:/Coolindy/smart-waste-reports/package.json`, `src/services/wasteImageClassifier.js` — HIGH (primary source, read directly)
- Note: No Context7/MCP research provider was available in this session (`research-plan` seam requested `context7` for several items but no matching MCP tool was present); all items were served via the `websearch` fallback per the tool-strategy's provider-fallback rule. Re-run with Context7 access available if stricter HIGH-confidence library-doc verification is required before roadmap lock-in.

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
