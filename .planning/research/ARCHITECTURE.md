# Architecture Research

**Domain:** Lightweight single-server Node.js/Express web app — public QR-triggered intake form, AI vision classification in the request path, JSON-file persistence, event-based LINE webhook notification, no auth
**Researched:** 2026-08-18
**Confidence:** MEDIUM (Express layering and Node file-locking/atomic-write patterns are well-established, cross-checked against known npm ecosystem behavior; LINE-specific retry semantics and face-blur library choice are MEDIUM — verify against current LINE docs and pick a specific face-detection library during Phase discussion since this repo has no proof-of-concept for it yet)

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                         CLIENT (no login, mobile-first)               │
│  ┌───────────────┐   ┌──────────────────┐   ┌──────────────────┐     │
│  │ QR scan lands  │   │ Direct form —     │   │ Staff dashboard   │     │
│  │ on /report?    │   │ dropdown/map pin  │   │ list view (no     │     │
│  │ location_id=X  │   │ (registered only) │   │ login)            │     │
│  └───────┬───────┘   └────────┬──────────┘   └────────┬──────────┘     │
├──────────┼─────────────────────┼───────────────────────┼───────────────┤
│          ▼                     ▼                       ▼               │
│                     EXPRESS APP (single Node process)                  │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │ Middleware: rate-limit (IP) → multer upload → validation        │   │
│  └───────────────────────────┬────────────────────────────────────┘   │
│                               ▼                                        │
│  ┌─────────────┐   ┌──────────────────┐   ┌─────────────────────┐     │
│  │ Location    │   │ Report Intake     │   │ Status Workflow      │     │
│  │ Registry    │◄──┤ Orchestrator      │──►│ (one-way transition) │     │
│  │ (validate)  │   │ (routes/reports)  │   └─────────────────────┘     │
│  └─────────────┘   └────┬─────────┬────┘                              │
│                         ▼         ▼                                   │
│              ┌──────────────┐ ┌────────────────────┐                  │
│              │ Face-Blur    │ │ AI Classification   │                  │
│              │ Service      │►│ Service (Claude     │                  │
│              │ (local)      │ │ vision, existing)   │                  │
│              └──────────────┘ └──────────┬──────────┘                  │
│                                           ▼                             │
│                              ┌────────────────────────┐                │
│                              │ Urgency Threshold Rules │                │
│                              │ (config/ai-thresholds)  │                │
│                              └────────────┬─────────────┘              │
│                                           ▼                             │
│                    ┌──────────────────────────────────────┐            │
│                    │  Dedup Check (location_id + 30 min)   │            │
│                    └──────────────────┬─────────────────────┘          │
│                                       ▼                                │
│                    ┌──────────────────────────────────────┐            │
│                    │   JSON Persistence Layer (generic)     │            │
│                    │   lock → backup → atomic write → unlock│            │
│                    └───────┬──────────────────────┬─────────┘          │
│                            ▼                       ▼                   │
│                 waste-reports.json      locations.json / thresholds    │
│                            │                                           │
│                            ▼ (event: report.created / status.changed)  │
│                 ┌────────────────────────────┐                        │
│                 │ Notification Dispatcher     │                        │
│                 │ (async, retry+backoff)      │──► LINE Messaging API  │
│                 └────────────────────────────┘                        │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|-------------------------|
| Location Registry | Source of truth for valid `location_id`s (name, lat/lng); rejects unknown IDs from QR/manual pick | `data/locations.json` + `src/services/locationStore.js` reading through the shared JSON persistence layer; admin-managed |
| Report Intake Orchestrator | Coordinates one submit request end-to-end: validate location → validate files → face-blur → classify → compute urgency → dedup check → persist → emit event → respond | `src/routes/reports.js` (thin route) delegating to `src/services/reportService.js` |
| Upload & File Validation | Multer memory storage, magic-byte MIME sniffing (not extension/declared MIME), size (≤5MB) and count (1–3) limits | Already exists: `src/routes/classify.js`, `src/services/imageType.js` — reusable as-is |
| Face-Blur Service | Best-effort local face detection + Gaussian blur on each accepted image **before** it is written to disk or sent to any external API (including the AI vision call) | A local/on-server detector (e.g. `face-api.js` under `@tensorflow/tfjs-node` + `canvas`, or a Haar-cascade via `opencv4nodejs`) + `sharp` for the blur step; pure function `(buffer) -> buffer`, non-blocking on detection failure |
| AI Classification Service | Calls Claude vision with structured output, returns `waste_type`/`coverage_percentage`/`no_waste_detected`; does **not** decide urgency itself | Already exists: `src/services/wasteImageClassifier.js` |
| Urgency Threshold Config | Admin-editable JSON mapping `coverage_percentage` → urgency label; read fresh on each request (not cached at boot) so admin edits apply without restart | `config/ai-thresholds.json` (exists) |
| Dedup Engine | Before creating a new record, checks `waste-reports.json` for an existing report with same `location_id` within the last 30 minutes; merges (`report_count++`) instead of inserting | `src/services/dedupService.js`, reads through persistence layer |
| Rate Limiter | Caps submissions per IP to 5/hour | In-memory sliding-window map keyed by IP (e.g. `express-rate-limit` with a memory store) — does not need JSON persistence since it's a soft, restart-tolerant control |
| JSON Persistence Layer | Generic, reusable read/write/append primitives for **all** JSON-file stores in the app: acquire lock → backup current file → atomic write → release lock; corrupt-file fallback to backup on read | `src/data/jsonStore.js` wrapping `proper-lockfile` (serializes concurrent writers, works via mkdir so no partial-lock races) + `write-file-atomic` (temp-file + rename so a crash mid-write never corrupts the live file) |
| Status Workflow | Enforces one-way `รอดำเนินการ → กำลังดำเนินการ → ดำเนินการเสร็จสิ้น`; rejects backward/skip transitions server-side (never trust the client) | `src/services/statusService.js`, pure transition-table validation, invoked by the status-change route |
| Notification Dispatcher | Fires after a report is successfully persisted (create or status change); sends LINE push, retries 3× with exponential backoff, records failure on the report and exposes it to the dashboard | `src/services/notifier.js`, invoked via a lightweight in-process event (`EventEmitter`) so the HTTP response is never blocked waiting on LINE |
| LINE Client | Thin wrapper around LINE Messaging API push-message call (group push) | `src/services/lineClient.js`, uses `@line/bot-sdk` or a plain `fetch`/`axios` call with the channel access token from env |
| Staff Dashboard/List View | Renders/serves the report list sorted urgency-desc then oldest-first; escapes all free-text fields (`note`, `changed_by`) before render to prevent stored XSS | `src/routes/dashboard.js` (or a JSON API consumed by a static frontend page) |
| Admin Config | CRUD for `location_id` registry (name + lat/lng) and, optionally, an editor for threshold values; also where QR codes get generated for a newly registered location | `src/routes/admin.js` + `qrcode` npm package to render a PNG/SVG pointing at `/report?location_id=X` |

## Recommended Project Structure

```
src/
├── routes/                 # HTTP layer only — no business logic, no fs access
│   ├── reports.js          # POST /api/waste-reports (submit), GET (list/dashboard feed)
│   ├── reportStatus.js     # POST /api/waste-reports/:id/status
│   ├── classify.js         # existing standalone classify endpoint (POC) — keep or fold into reports.js
│   ├── locations.js        # GET /api/locations (public list for dropdown/map)
│   ├── admin.js            # location CRUD, QR generation
│   └── dashboard.js        # staff list view
├── services/                # business logic, framework-agnostic (no req/res)
│   ├── reportService.js     # orchestrates submit flow
│   ├── locationStore.js
│   ├── dedupService.js
│   ├── statusService.js
│   ├── notifier.js
│   ├── lineClient.js
│   ├── faceBlur.js
│   └── wasteImageClassifier.js   # existing
├── data/
│   ├── jsonStore.js          # generic locked/atomic JSON read-write-append + backup/fallback
│   └── files/                # waste-reports.json, waste-reports.backup.json, locations.json
├── middleware/
│   ├── rateLimit.js
│   ├── uploadValidation.js   # multer + magic-byte check (from imageType.js)
│   └── errorHandler.js
├── config/
│   └── ai-thresholds.json    # existing
└── utils/
    └── sanitize.js            # HTML-escape for note/changed_by before render
```

### Structure Rationale

- **`data/jsonStore.js` is the single chokepoint for every file write.** Every JSON store (`waste-reports.json`, `locations.json`) goes through the same lock → backup → atomic-write → unlock primitive. Building this once, first, and reusing it everywhere is what prevents subtly-different (and subtly-buggy) locking code per feature.
- **`services/` never imports `express`.** Keeps AI classification, face-blur, dedup, and status-transition logic unit-testable without spinning up HTTP, and keeps `routes/` thin enough that adding a second entry point (e.g. an admin CLI) later is cheap.
- **`data/files/` is outside any `public/` or static-served directory.** SPEC explicitly forbids serving `waste-reports.json` as a static file — physically separating data files from anything Express `static()`-serves removes an entire class of accidental-exposure bugs.
- **Face-blur sits between upload-validation and AI classification**, not after — see Anti-Pattern below.

## Architectural Patterns

### Pattern 1: Locked, atomic, backed-up JSON store as a generic module

**What:** One module (`jsonStore.js`) exposes `read(file)`, `write(file, data)`, `append(file, record)`. Internally: `proper-lockfile` acquires an exclusive lock on the target file (mkdir-based, safe even on network shares), the current file is copied to `<file>.backup.json` before any write, and the write itself goes through `write-file-atomic` (write to temp file, `fs.rename` into place) so a crash mid-write can never leave a half-written/corrupt file live.
**When to use:** Every JSON file in this system that is written by more than one concurrent request path (`waste-reports.json` definitely; `locations.json` less critical but same pattern for consistency).
**Trade-offs:** Adds two small dependencies and a bit of latency per write (lock acquisition + backup copy), but this is negligible at campus-report volumes and is the only realistic way to satisfy the SPEC's explicit lock+backup+fallback requirement without a database.

**Example:**
```javascript
// src/data/jsonStore.js
const lockfile = require('proper-lockfile');
const writeFileAtomic = require('write-file-atomic');
const fs = require('fs/promises');

async function readWithFallback(filePath, backupPath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (err) {
    // corrupt/missing primary → fall back to last known-good backup, log for admin
    console.error(`[jsonStore] ${filePath} unreadable (${err.message}), falling back to backup`);
    return JSON.parse(await fs.readFile(backupPath, 'utf8'));
  }
}

async function append(filePath, backupPath, record) {
  const release = await lockfile.lock(filePath, { retries: 5 });
  try {
    const current = await readWithFallback(filePath, backupPath);
    await fs.copyFile(filePath, backupPath); // backup BEFORE overwrite
    current.push(record);
    await writeFileAtomic(filePath, JSON.stringify(current, null, 2));
    return record;
  } finally {
    await release();
  }
}
```

### Pattern 2: Event-based, non-blocking notification dispatch with bounded retry

**What:** The HTTP handler that creates/updates a report emits an in-process event (`EventEmitter`, no external queue needed at this scale) immediately after the JSON write commits, then responds to the client. A separate listener performs the actual LINE push asynchronously, retrying up to 3 times with exponential backoff + jitter, and on final failure writes a `notification_status: "failed"` flag back onto the report record (through the same locked persistence layer) so it surfaces on the dashboard.
**When to use:** Any outbound call to a third-party API that must not block the user-facing response and must satisfy a "within N seconds, best-effort" SLA (here: ≤10s, event-based not polling).
**Trade-offs:** In-process `EventEmitter` is lost on process crash/restart mid-retry (acceptable for a single-server MVP — no message durability guarantee); a real queue (BullMQ/Redis) would add durability but is overkill for this scale and would violate the "no extra infra beyond Node+Express+JSON" constraint.

**Example:**
```javascript
// src/services/notifier.js
const EventEmitter = require('events');
const bus = new EventEmitter();

bus.on('report.created', async (report) => {
  await sendWithRetry(() => lineClient.pushToGroup(formatMessage(report)), { retries: 3, baseMs: 1000 });
});

async function sendWithRetry(fn, { retries, baseMs }) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try { return await fn(); }
    catch (err) {
      if (attempt === retries) { await markNotificationFailed(); throw err; }
      const delay = baseMs * 2 ** attempt + Math.random() * 250; // jitter
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

module.exports = { bus };
```

### Pattern 3: AI advisory result, never authoritative

**What:** The AI classification service returns a *suggestion* (`waste_type`, `coverage_percentage`, derived `urgency`) that is written to the record as editable fields, not locked-in truth. The urgency mapping itself lives in an admin-editable config file (`config/ai-thresholds.json`) read fresh per request — the app computes urgency from `coverage_percentage`, the model never returns urgency directly. Any `unclassified` result is a normal, non-blocking data state, not an error path.
**When to use:** Any AI-in-the-loop step whose output should remain admin-tunable and human-correctable, per SPEC's AI-ethics requirement.
**Trade-offs:** Requires reading a small config file on the hot path (submit request) — cheap, but must not be cached in memory at process boot or admin threshold edits won't take effect without a restart (this is exactly the mistake `wasteImageClassifier.js`'s current `readThresholds()` correctly avoids by reading synchronously per-call).

## Data Flow

### Submit Flow (the hot path)

```
QR scan / dropdown pick (location_id)
    ↓
GET /report?location_id=X  →  client-side validate against GET /api/locations
    ↓ (user fills note + attaches 1–3 images, submits)
POST /api/waste-reports (multipart)
    ↓
[rate-limit middleware] → reject if >5/hr for this IP
    ↓
[upload middleware] → multer memory storage, magic-byte MIME check, size/count limits
    ↓
[Report Intake Orchestrator]
    ├─→ Location Registry: validate location_id exists → 400 if not
    ├─→ for each image: Face-Blur Service (local, best-effort) → blurred buffer
    ├─→ AI Classification Service (Claude vision, on the BLURRED image) → waste_type, coverage%, no_waste_detected
    ├─→ Urgency Threshold Config → derive urgency from coverage%
    ├─→ Dedup Engine: query waste-reports.json for same location_id within 30 min
    │       ├─ match found → merge (report_count++, append note) → skip insert
    │       └─ no match → build new report record
    ↓
JSON Persistence Layer: lock → backup → atomic write → unlock  (waste-reports.json)
    ↓
HTTP response to user: report saved + AI classification shown immediately (editable)
    ↓ (async, does not block the response above)
emit 'report.created' → Notification Dispatcher → LINE Client → LINE group
    (retry 3x exponential backoff on failure; failure recorded on the record)
```

### Status Change Flow

```
Staff dashboard: GET /api/waste-reports (sorted: urgency desc, then oldest first)
    ↓ (staff selects a report, changes status, optional changed_by)
POST /api/waste-reports/:id/status { new_status, changed_by }
    ↓
Status Workflow: validate transition is forward-only (400 if backward/skip)
    ↓
JSON Persistence Layer: lock → backup → atomic write → unlock
    ↓
(optional) emit 'status.changed' event for audit/notification if ever needed
```

### Key Data Flows

1. **Location validation is a gate, not a lookup-with-fallback.** Both QR-scan and manual-pick paths converge on the same `location_id` validation against the registry before anything else runs — this is what prevents spoofed/cloned QR codes and free-text location injection.
2. **Face-blur happens before the image touches any external API call or disk write**, not after classification and not only before persistence — the AI vision call itself is an external network call and should not receive an unblurred face any more than the stored file should.
3. **Every write to a shared JSON file is single-writer-serialized through one module.** No route or service ever calls `fs.writeFile` on `waste-reports.json`/`locations.json` directly — always through `jsonStore.js`. This is the one non-negotiable boundary in the whole system.
4. **Notification is decoupled from persistence by an event, not by a return value.** The submit request's response to the user must never wait on the LINE API round-trip (SPEC's own 10-second budget is a "best-effort" SLA, not a synchronous contract).

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|---------------------------|
| Current target: 1 campus, low hundreds of reports/day | Single Node process, JSON files, in-memory rate-limit map — exactly what's specified, no changes needed |
| If report volume grows to thousands/day or multi-campus | `proper-lockfile` write serialization becomes a throughput bottleneck (one write at a time); migrate `waste-reports.json` to SQLite (still file-based, no new infra, gets real transactions and indexed queries) while keeping `locations.json`/config as-is |
| If deployed across multiple server instances | JSON-file + local lock stops being safe (locks are per-filesystem, not distributed) — this architecture assumes single-process/single-disk; horizontal scaling requires a real database first |

### Scaling Priorities

1. **First bottleneck: JSON write lock under concurrent submit bursts** (e.g. many people reporting near the same event). Mitigated at this scale by lock-wait queuing (requests wait briefly, they don't fail) — acceptable given campus-scale traffic; revisit only if p95 submit latency becomes visible.
2. **Second bottleneck: dashboard list-read scanning the whole JSON array on every request.** Fine until the array grows into the many-thousands; if it does, add an in-memory cache invalidated on write rather than re-parsing the file per GET.

## Anti-Patterns

### Anti-Pattern 1: Reading/writing `waste-reports.json` from more than one place without going through the shared lock module

**What people do:** Add a "quick" direct `fs.writeFileSync` in a new route (e.g. the status-change endpoint) because it feels like a one-off, bypassing `jsonStore.js`.
**Why it's wrong:** Two independent write paths racing on the same file is exactly the corruption scenario SPEC's file-locking requirement exists to prevent — a lock only protects writers that agree to use it.
**Do this instead:** Every read/write/append of a shared JSON file goes through `jsonStore.js`, with no exceptions, enforced by code review / a lint rule against `fs.writeFile`/`fs.writeFileSync` outside `src/data/`.

### Anti-Pattern 2: Blocking the submit response on the LINE notification call

**What people do:** `await lineClient.pushToGroup(...)` inline in the same request handler that persists the report, before responding to the user.
**Why it's wrong:** LINE API latency/outages then directly slow down or fail the user-facing "report submitted" response, even though the report was already safely persisted — and it makes the "within 10s, event-based" requirement pointless since it's now synchronous.
**Do this instead:** Persist first, respond to the user, then emit an event that a separate listener consumes to dispatch the notification with its own retry loop.

### Anti-Pattern 3: Caching admin-editable config (thresholds, locations) in memory at server boot

**What people do:** `const thresholds = require('../config/ai-thresholds.json')` once at module load for a small performance win.
**Why it's wrong:** SPEC requires admin threshold edits to take effect without hardcoding/redeploying — a boot-time cache means every threshold change needs a server restart, silently violating that requirement.
**Do this instead:** Read the config file fresh on each request that needs it (as `wasteImageClassifier.js` already does via `readThresholds()`) — it's a tiny file, the I/O cost is negligible, and it keeps admin edits live immediately.

### Anti-Pattern 4: Sending the un-blurred original image to the AI vision API

**What people do:** Run face-blur only on the copy that gets saved to disk, but send the original (unblurred) buffer to the Claude vision API for classification, reasoning that "it's just for analysis, not storage."
**Why it's wrong:** SPEC's privacy intent is not to avoid *storing* unnecessary personal data — it's to avoid *retaining/transmitting* it unnecessarily at all. An external API call is a transmission just as much as a disk write.
**Do this instead:** Blur first, then use the blurred buffer for both the AI classification call and the persisted file — one buffer, one blur step, two consumers.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|----------------------|-------|
| Claude API (vision, structured outputs) | Synchronous `await` inside the submit request — result must be shown to the user immediately per SPEC | Already implemented in `wasteImageClassifier.js`; on error/refusal, degrade to `unclassified` rather than failing the submit (SPEC edge case) |
| LINE Messaging API (group push) | Asynchronous, event-triggered, own retry loop — never awaited by the HTTP response | Needs a channel access token + target group ID in env config; `@line/bot-sdk` gives a typed client, or a plain HTTP POST works fine at this scale |
| QR code generation | Admin-time only (not in the hot request path) — generates a static image once per registered location | `qrcode` npm package producing a PNG/SVG that encodes `/report?location_id=X`; regenerate only when a location is added |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|----------------|-------|
| Routes ↔ Services | Direct function calls (synchronous `await`) | Routes never touch `fs`/`jsonStore` directly |
| Report Intake Orchestrator ↔ Persistence Layer | Direct function calls through `jsonStore.js` | Single chokepoint, see Anti-Pattern 1 |
| Report Intake Orchestrator ↔ Notification Dispatcher | In-process event (`EventEmitter`), not a direct awaited call | Decouples user-facing latency from LINE API latency, see Pattern 2 |
| Face-Blur Service ↔ AI Classification Service | Direct function call, blurred buffer passed forward | Ordering matters — see Anti-Pattern 4 |
| Admin Config ↔ Location Registry / Threshold Config | Same `jsonStore.js` primitives as the report flow, just lower write frequency | No separate mechanism needed — reuse, don't reinvent |

## Suggested Build Order

Given the dependency graph above, the sensible sequence is:

1. **JSON persistence layer** (`jsonStore.js`: lock, backup, atomic write, corrupt-file fallback) — everything else writes through this; build and test it in isolation first (including the "missing file → auto-create `[]`" and "corrupt file → fallback to backup" edge cases from SPEC) before any feature touches real data.
2. **Location registry + admin CRUD** — needed before a real QR/intake flow can validate anything; can be seeded with a hand-written `locations.json` for early development.
3. **QR/manual intake form + location validation** — depends on 1 and 2; this is the first end-to-end user-facing slice (form → validated location, no images/AI yet).
4. **Image upload validation + face-blur** — already partially built (magic-byte check exists); face-blur is new and can be developed independently, then inserted into the pipeline.
5. **AI classification wiring into the main submit flow** — the classify POC already exists; the remaining work is threading blurred images through it inside the orchestrator (not just the standalone `/classify` endpoint) and handling `unclassified`/no-waste-detected edge cases.
6. **Dedup + rate limiting** — layer on top of the now-working submit pipeline; both are independent of each other and can be built in parallel.
7. **Report creation end-to-end (persist + respond)** — the orchestrator now has all its inputs (location, images, AI result, dedup decision) and can write through the persistence layer from step 1.
8. **Status workflow** — depends only on the persistence layer and existing report records from step 7.
9. **Staff dashboard/list view** — depends on 7 (needs real records to display) and 8 (needs status-change action); sorting logic (urgency desc, oldest-first) is pure and testable independent of the UI.
10. **LINE notification dispatch (event + retry)** — can be developed and tested against a mock LINE client in parallel with steps 6–9, then wired to fire on `report.created` (and optionally `status.changed`) once step 7 emits that event.

Steps 1–3 form the critical path (nothing else works without them). Steps 4–6 and step 10 can be parallelized once step 1 exists, since they don't depend on each other. Steps 7–9 are sequential because each depends on real persisted data existing.

## Sources

- [write-file-atomic — npm](https://www.npmjs.com/package/write-file-atomic)
- [proper-lockfile — npm](https://www.npmjs.com/package/proper-lockfile)
- [Understanding Node.js file locking — LogRocket](https://blog.logrocket.com/understanding-node-js-file-locking/)
- [LINE Messaging API reference](https://developers.line.biz/en/reference/messaging-api/nojs/)
- [Webhook Retry Best Practices for Sending Webhooks — Hookdeck](https://hookdeck.com/outpost/guides/outbound-webhook-retry-best-practices)
- [Building a Robust Webhook Handler in Node.js — DEV Community](https://dev.to/dumebii/building-a-robust-webhook-handler-in-nodejs-validation-queuing-and-retry-logic-2fb6)
- [Face Detection on the Web with Face-api.js — SitePoint](https://www.sitepoint.com/face-api-js-face-detection/)
- [Build a Face Detection App Using Node.js and OpenCV — SitePoint](https://www.sitepoint.com/face-detection-nodejs-opencv/)
- [How to Structure Express.js Projects for Scale — OneUptime](https://oneuptime.com/blog/post/2026-02-02-express-project-structure/view)
- [Layers Architecture — Rizwan Ashiq Developers Handbook](https://docs.rizwanashiq.com/docs/frameworks/express/advance/layers-architecture)
- Existing repo code: `src/services/wasteImageClassifier.js`, `src/routes/classify.js`, `src/services/imageType.js`, `SPEC.md`, `.planning/PROJECT.md`

---
*Architecture research for: lightweight single-server Node.js/Express campus waste-reporting app (QR intake, AI vision classification, JSON-file storage, LINE notification, no accounts)*
*Researched: 2026-08-18*
