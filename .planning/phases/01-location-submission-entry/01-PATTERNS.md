# Phase 1: Location & Submission Entry - Pattern Map

**Mapped:** 2026-08-19
**Files analyzed:** 12 (new/modified)
**Analogs found:** 7 / 12 (5 have no in-repo analog — greenfield surfaces; RESEARCH.md Code Examples are the fallback pattern source for those)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|-----------------|---------------|
| `config/locations.json` | config | CRUD (read-only reference data) | `config/ai-thresholds.json` | exact |
| `src/services/locationStore.js` | service | CRUD (read) | `src/services/wasteImageClassifier.js` (config-read half) + `src/services/imageType.js` (pure-function shape) | role-match |
| `src/services/qrSignature.js` | service/utility | transform (sign/verify) | `src/services/imageType.js` | role-match |
| `src/routes/report.js` | route/controller | request-response | `src/routes/classify.js` | role-match |
| `index.js` (modified) | config/bootstrap | request-response (mounting) | itself (current version) | exact (extend existing) |
| `.env.example` (modified) | config | — | itself (current version) | exact (extend existing) |
| `package.json` (modified) | config | — | itself (current version) | exact (extend existing) |
| `views/report.ejs` | component/view | request-response (SSR) | none in repo | no analog — use RESEARCH.md Pattern 2 |
| `public/css/report.css` | utility/asset | transform (static render) | none in repo | no analog — use 01-UI-SPEC.md tokens |
| `public/js/report.js` | component (client JS) | event-driven (DOM) | none in repo | no analog — use RESEARCH.md Pattern 3 |
| `scripts/generate-qr.js` | utility (CLI script) | batch / file-I/O | none in repo | no analog — use RESEARCH.md Pattern 4 |
| `test/report.test.js` | test | request-response (integration) | none in repo | no analog — use RESEARCH.md Validation Architecture |

## Pattern Assignments

### `config/locations.json` (config, CRUD-read)

**Analog:** `config/ai-thresholds.json` (`E:/Coolindy/smart-waste-reports/config/ai-thresholds.json`, full file, 5 lines)

**Full pattern to copy** — flat JSON array/object, no build step, no comments, no envelope:
```json
{
  "urgentMinPercent": 80,
  "actionNeededMinPercent": 50
}
```
This establishes the project convention: `config/*.json` files are plain, hand-editable, flat data — no wrapper object, no metadata keys. `locations.json` should follow the same minimalism: a bare JSON array of location records (per RESEARCH.md's seed shape), nothing else. Consumers `JSON.parse(fs.readFileSync(...))` it directly (see `locationStore.js` below) exactly the way `wasteImageClassifier.js` does for `ai-thresholds.json`.

**Field-name convention note:** `ai-thresholds.json` uses camelCase (`urgentMinPercent`). `locations.json` intentionally breaks this to snake_case (`location_id`) per CONTEXT.md D-02/SPEC's literal field name — this is a deliberate divergence (the field flows directly into the QR URL query string), not an inconsistency to fix.

---

### `src/services/locationStore.js` (service, CRUD-read)

**Analog 1 — config-read half:** `src/services/wasteImageClassifier.js` (`E:/Coolindy/smart-waste-reports/src/services/wasteImageClassifier.js`, lines 1-45)

**Imports + path-resolution pattern** (lines 1-5):
```javascript
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const THRESHOLDS_PATH = path.join(__dirname, '..', '..', 'config', 'ai-thresholds.json');
```
Copy the `path.join(__dirname, '..', '..', 'config', '<file>.json')` pattern verbatim for `LOCATIONS_PATH` — this is the established way `src/services/*.js` locates files under `config/` regardless of CWD.

**Read + parse pattern** (lines 32-35):
```javascript
function readThresholds() {
  const raw = fs.readFileSync(THRESHOLDS_PATH, 'utf8');
  return JSON.parse(raw);
}
```
`locationStore.js`'s reader should follow this exact shape (`fs.readFileSync(..., 'utf8')` then `JSON.parse`), but **must additionally strip a leading BOM** before parsing — this project's existing reader does not do this and is not itself BOM-safe; RESEARCH.md Pitfall #4 flags this as a new requirement specific to `locations.json` (since it's the file most likely to be hand-edited on Windows), not something to copy as-is. Add: `raw.replace(/^\uFEFF/, '')` before `JSON.parse`.

**Analog 2 — pure-function-module shape:** `src/services/imageType.js` (`E:/Coolindy/smart-waste-reports/src/services/imageType.js`, full file, 38 lines)

**Module shape to copy** — no Express import, no side effects beyond the stated I/O, JSDoc above each exported function, single-purpose `module.exports` at bottom:
```javascript
/**
 * Detects real image MIME type from file bytes (magic numbers) —
 * does not trust the client-supplied extension or declared MIME type.
 * @param {Buffer} buffer
 * @returns {'image/jpeg'|'image/png'|'image/webp'|null}
 */
function detectImageType(buffer) {
  if (!buffer || buffer.length < 12) return null;
  // ...
  return null;
}

module.exports = { detectImageType };
```
`locationStore.js` should export `{ getAll, findById }` (per RESEARCH.md's Code Examples sketch) in this same flat, dependency-free style — no class, no singleton state beyond an optional read-time cache.

---

### `src/services/qrSignature.js` (service/utility, transform)

**Analog:** `src/services/imageType.js` (same file as above) — role-match on "pure crypto/validation utility, zero Express dependency, exported as a flat function object."

**Pattern to copy:** Same shape as `detectImageType` — a small module of pure functions, each with input validation that **returns a safe default instead of throwing** on malformed input (see `imageType.js`'s `if (!buffer || buffer.length < 12) return null;` guard-first style, lines 8-9). Apply the identical defensive posture in `verifyLocationSignature`: guard on `providedSig` length/type *before* touching `Buffer.from`/`timingSafeEqual`, returning `false` rather than throwing — this mirrors `imageType.js`'s "guard first, return sentinel value" convention rather than a try/catch style.

**Full reference implementation** (from RESEARCH.md, not yet in repo — this is the concrete code to write, verified against this project's actual Node v24.18.0 this session):
```javascript
// src/services/qrSignature.js
const crypto = require('crypto');

const SECRET = process.env.QR_SIGNING_SECRET;
if (!SECRET) {
  throw new Error('QR_SIGNING_SECRET is not set — see .env.example');
}

function signLocationId(locationId) {
  return crypto.createHmac('sha256', SECRET).update(locationId).digest('hex').slice(0, 32);
}

function verifyLocationSignature(locationId, providedSig) {
  if (typeof providedSig !== 'string' || providedSig.length !== 32) return false;
  const expected = signLocationId(locationId);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(providedSig, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = { signLocationId, verifyLocationSignature };
```

---

### `src/routes/report.js` (route/controller, request-response)

**Analog:** `src/routes/classify.js` (`E:/Coolindy/smart-waste-reports/src/routes/classify.js`, full file, 37 lines)

**Imports + router-setup pattern** (lines 1-13):
```javascript
const express = require('express');
const multer = require('multer');
const { classifyWasteImage } = require('../services/wasteImageClassifier');
const { detectImageType } = require('../services/imageType');

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
});

const router = express.Router();
```
Copy the top-of-file shape: `const router = express.Router();`, service functions destructure-imported from `../services/...`, any tunable constants declared near the top. `report.js` swaps `multer`/`detectImageType` imports for `locationStore`/`qrSignature`.

**Route-handler + validation-short-circuit pattern** (lines 15-27):
```javascript
router.post('/api/waste-reports/classify', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'กรุณาแนบรูปภาพ (field name: image)' });
  }

  const mediaType = detectImageType(req.file.buffer);
  if (!mediaType) {
    return res.status(400).json({ error: 'ชนิดไฟล์ไม่รองรับ อนุญาตเฉพาะ .jpg, .jpeg, .png, .webp เท่านั้น' });
  }

  const result = await classifyWasteImage(req.file.buffer, mediaType);
  res.json(result);
});
```
The pattern is: validate input, early-`return res.status(4xx).json({ error: '<Thai message>' })` on the first failing check, otherwise call into the service layer and respond with its result. `GET /report`'s handler follows the identical early-return shape but renders EJS instead of `res.json` (see RESEARCH.md's Code Examples for the exact branching: `!location_id` → dropdown state; `!sigOk || !known` → 400 + error view; else → locked state).

**Error-handling pattern** (lines 29-35) — router-scoped middleware for a specific failure class:
```javascript
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'ขนาดไฟล์เกิน 5MB' });
  }
  next(err);
});
```
Not directly reusable (no Multer error class in `report.js`), but establishes the convention: router-local `router.use((err, req, res, next) => {...})` catches a specific, expected error type and responds with the project's `{ error: '<Thai>' }` shape, `next(err)`-ing anything unexpected rather than swallowing it.

**Export convention** (line 37): `module.exports = router;` — copy verbatim.

**Response shape for the SPEC-mandated single error message** (per RESEARCH.md Anti-Patterns — same `{ error: '<Thai message>' }` envelope as `classify.js`, but for `GET /report` this is delivered via `res.status(400).render(...)`, not `res.status(400).json(...)`, since this route serves HTML):
```javascript
return res.status(400).render('report', { mode: 'error', message: 'ไม่พบจุดนี้ในระบบ กรุณาติดต่อเจ้าหน้าที่' });
```
If the optional `POST /api/waste-reports/validate` is built (RESEARCH.md Open Questions #1), it should return `res.json({ error: '...' })` matching `classify.js`'s shape exactly, since it's a JSON API endpoint like `classify.js`.

---

### `index.js` (modified — app bootstrap)

**Analog:** current `index.js` (`E:/Coolindy/smart-waste-reports/index.js`, full file, 19 lines)

**Current mounting pattern to extend** (lines 1-9):
```javascript
require('dotenv').config();

const express = require('express');
const classifyRouter = require('./src/routes/classify');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(classifyRouter);
```
New additions follow the same flat, top-of-file style — no wrapping in a factory function, no config object:
```javascript
const path = require('path');
const reportRouter = require('./src/routes/report');
// ...
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(reportRouter);
```
Mount `reportRouter` the same way `classifyRouter` is mounted (bare `app.use(...)`, no path prefix — each router declares its own full paths, as `classify.js` does with `/api/waste-reports/classify`).

---

### `.env.example` (modified)

**Analog:** current `.env.example` (`E:/Coolindy/smart-waste-reports/.env.example`, full file, 2 lines)

```
ANTHROPIC_API_KEY=
PORT=3000
```
Flat `KEY=` style, no quoting, no comments currently — but RESEARCH.md's recommended addition introduces the project's first inline comment for context (acceptable, since the value must be generated, not filled in blank):
```
# NEW for Phase 1 — generate via: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
QR_SIGNING_SECRET=
```
Append after `PORT=3000`, preserving the existing two lines unchanged.

---

### `package.json` (modified)

**Analog:** current `package.json` (`E:/Coolindy/smart-waste-reports/package.json`) — `dependencies` block, alphabetically-ish ordered, caret ranges:
```json
"dependencies": {
  "@anthropic-ai/sdk": "^0.117.1",
  "dotenv": "^17.4.2",
  "express": "^5.2.1",
  "multer": "^2.2.0"
}
```
Add `"ejs": "^6.0.1"` and `"qrcode": "^1.5.4"` into this block (verified current versions, RESEARCH.md Standard Stack). Add a new `"devDependencies"` block (does not exist yet) with `"supertest": "^7.2.2"`. No `"scripts.test"` currently does anything real (`echo "Error: no test specified" && exit 1`) — replace with `"node --test"` once `test/report.test.js` exists, per RESEARCH.md Validation Architecture.

---

## No Analog Found

These files have no existing counterpart anywhere in the repo (confirmed via `Glob` — no `views/`, `public/`, `scripts/`, or `test/` directories exist yet). Planner should build these directly from RESEARCH.md's cited patterns and 01-UI-SPEC.md's design contract, not from a codebase analog.

| File | Role | Data Flow | Pattern Source |
|------|------|-----------|-----------------|
| `views/report.ejs` | component/view | request-response (SSR) | RESEARCH.md → Architecture Patterns → Pattern 2 (three-state single template: locked/dropdown/error, `<%= %>` auto-escape only, never `<%- %>` for data) + Code Examples (route → render-call contract: `res.render('report', { mode, locations, locked, message })`) + 01-UI-SPEC.md (Color/Typography/Copywriting Contract tables for exact markup content and state styling) |
| `public/css/report.css` | utility/asset | transform (static) | 01-UI-SPEC.md → Spacing Scale, Responsive Behavior (mobile-first, `min-width: 768px`/`1024px` media queries, 480px max-width card), Color (locked-state 4px accent left border vs. dropdown neutral border), Typography (14/16/20px, 400/600 weight); RESEARCH.md Common Pitfall #6 (system-font stack, zero external font requests — exact `font-family` string given) |
| `public/js/report.js` | component (client JS) | event-driven (DOM) | RESEARCH.md → Architecture Patterns → Pattern 3 (note-counter `input` listener, `.length` not `Buffer.byteLength`) + the "ไม่ใช่จุดนี้" locked→dropdown toggle described in Pattern 2 (pure DOM visibility swap, zero network call — both states' markup already present in the SSR'd HTML) |
| `scripts/generate-qr.js` | utility (CLI script) | batch / file-I/O | RESEARCH.md → Architecture Patterns → Pattern 4, full verified code sample given (reads `config/locations.json`, calls `qrSignature.signLocationId`, writes PNGs via `qrcode`'s `toFile()` with `errorCorrectionLevel: 'H'`) |
| `test/report.test.js` | test | request-response (integration) | RESEARCH.md → Validation Architecture → Phase Requirements → Test Map (exact assertions per SUBM-01/02/03) + Wave 0 Gaps (no `test/` dir exists — this is from-scratch; `node:test` + `supertest`, no config file needed) |

## Shared Patterns

### Error response shape (Thai message, appropriate 4xx)
**Source:** `src/routes/classify.js` lines 17, 22 (`E:/Coolindy/smart-waste-reports/src/routes/classify.js`)
**Apply to:** `src/routes/report.js` (all failure branches), and `POST /api/waste-reports/validate` if built.
```javascript
return res.status(400).json({ error: 'กรุณาแนบรูปภาพ (field name: image)' });
```
For HTML-rendering routes (`GET /report`), the equivalent is `res.status(400).render('report', { mode: 'error', message: '<Thai>' })` — same status-code discipline, same single-Thai-string content, different transport (`render` vs `json`).

### Config-file read convention (`config/*.json`)
**Source:** `src/services/wasteImageClassifier.js` lines 5, 32-35 (`E:/Coolindy/smart-waste-reports/src/services/wasteImageClassifier.js`)
**Apply to:** `src/services/locationStore.js`
```javascript
const THRESHOLDS_PATH = path.join(__dirname, '..', '..', 'config', 'ai-thresholds.json');
function readThresholds() {
  const raw = fs.readFileSync(THRESHOLDS_PATH, 'utf8');
  return JSON.parse(raw);
}
```
`locationStore.js` must extend this with a BOM-strip (`raw.replace(/^\uFEFF/, '')`) before `JSON.parse` — new requirement, not present in the existing reader, per RESEARCH.md Pitfall #4.

### Pure-utility module shape (no Express import, guard-first validation, sentinel return over throw)
**Source:** `src/services/imageType.js` full file (`E:/Coolindy/smart-waste-reports/src/services/imageType.js`)
**Apply to:** `src/services/qrSignature.js`, and the read-only accessor functions in `src/services/locationStore.js`
```javascript
function detectImageType(buffer) {
  if (!buffer || buffer.length < 12) return null;
  // ...checks...
  return null;
}
module.exports = { detectImageType };
```

### Router mounting convention
**Source:** `index.js` line 9 (`E:/Coolindy/smart-waste-reports/index.js`)
**Apply to:** mounting `reportRouter` in the updated `index.js`
```javascript
app.use(classifyRouter);
```
No path prefix at mount time — each router owns its full route paths internally (`classify.js` declares `/api/waste-reports/classify`; `report.js` will declare `/report`, `/api/locations`, etc.).

## Metadata

**Analog search scope:** `src/routes/`, `src/services/`, `config/`, project root (`index.js`, `.env.example`, `package.json`); confirmed via `Glob` that `views/`, `public/`, `scripts/`, and `test/` do not yet exist anywhere in the repo.
**Files scanned:** 8 (`index.js`, `src/routes/classify.js`, `src/services/wasteImageClassifier.js`, `src/services/imageType.js`, `config/ai-thresholds.json`, `.env.example`, `package.json`, `.claude/CLAUDE.md`)
**Pattern extraction date:** 2026-08-19
