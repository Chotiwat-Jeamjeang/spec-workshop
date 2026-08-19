---
phase: 01-location-submission-entry
reviewed: 2026-08-20T00:00:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - .env.example
  - .gitignore
  - config/locations.json
  - index.js
  - package.json
  - public/css/report.css
  - public/js/report.js
  - scripts/generate-qr.js
  - src/routes/report.js
  - src/services/locationStore.js
  - src/services/qrSignature.js
  - test/helpers/signedUrl.js
  - test/qrScript.test.js
  - test/report.test.js
  - views/report.ejs
findings:
  critical: 1
  warning: 3
  info: 2
  total: 6
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-08-20T00:00:00Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Reviewed the QR-locked/manual-dropdown location-submission entry flow: `GET /report`, `GET /api/locations`, `POST /api/waste-reports/validate`, the HMAC signature scheme, the location registry reader, the EJS view, and the client-side `report.js`. The implementation is generally careful — output is EJS-escaped everywhere user/registry data reaches HTML, XSS-sensitive strings on the client use `textContent` never `innerHTML`, signature comparison is constant-time with a pre-decode length guard, and the failure paths are deliberately consolidated to avoid leaking which check failed. Test coverage for the happy paths and the documented failure paths is thorough.

However, one code path (`GET /report`) accepts `req.query.location_id`/`sig` without validating that they are strings before handing them to the HMAC layer. Express turns a repeated query key (`?location_id=A&location_id=B`) into an array, and `qrSignature.verifyLocationSignature` — despite its own JSDoc explicitly promising it "never throws on malformed/garbage input" — only type-guards the `providedSig` argument, not `locationId`. A crafted request with a duplicated `location_id` and any syntactically-valid 32-hex-char `sig` reaches `crypto.createHmac(...).update(array)`, which throws a `TypeError` that is never caught anywhere in the call chain, producing an unhandled 500 instead of the application's own generic 400 failure response (and, since no `NODE_ENV=production` is set anywhere in this project, Express's default error handler will echo the stack trace back to the client). This is a correctness/robustness bug in a security-relevant code path and is rated a blocker. The remaining findings are lower-severity robustness/hardening gaps.

## Critical Issues

### CR-01: `GET /report` crashes (and can leak a stack trace) on an array-valued `location_id` query parameter

**File:** `src/routes/report.js:9-27`, root cause in `src/services/qrSignature.js:34-48`

**Issue:**
`GET /report` destructures `location_id`/`sig` straight off `req.query` with no type check:

```js
const { location_id: locationId, sig } = req.query;
...
const sigOk = locationId ? qrSignature.verifyLocationSignature(locationId, sig) : false;
```

Node's query-string parser (used by Express for both the default `simple` and the `extended` query parser) turns a *repeated* query key into an array, e.g. `GET /report?location_id=LIB&location_id=CAFE&sig=<32 hex chars>` yields `req.query.location_id === ['LIB', 'CAFE']`.

`locationId` is truthy (a non-empty array), so `verifyLocationSignature(locationId, sig)` is called. Its own JSDoc states: *"Constant-time verification. Never throws on malformed/garbage input — always returns false instead."* — but the implementation only guards `providedSig`'s type/length before decoding it; it never validates `locationId`:

```js
function verifyLocationSignature(locationId, providedSig) {
  if (typeof providedSig !== 'string' || providedSig.length !== 32) return false;
  const expected = signLocationId(locationId);   // <-- locationId not type-checked
  ...
}
```

`signLocationId` calls `crypto.createHmac('sha256', secret).update(locationId)`. `Hmac#update()` only accepts `string | Buffer | TypedArray | DataView`; passed an `Array`, Node throws `TypeError [ERR_INVALID_ARG_TYPE]`. This throw is synchronous and uncaught anywhere in the route handler, `locationStore`, or `qrSignature` — Express 5's automatic sync-throw catching forwards it to the default error handler, which returns a **500** (not the intended, tested 400 `INVALID_QR_MESSAGE` response) and, because no `NODE_ENV=production` is configured anywhere in this project (`.env.example`, `index.js`), **includes the stack trace in the response body**, leaking internal file paths.

This directly contradicts the documented "never throws" contract of `verifyLocationSignature`, breaks the invariant the test suite asserts elsewhere ("all four QR failure response bodies are byte-identical" — `test/report.test.js:121-139` — this 5th failure mode produces neither the same status code treatment nor the same body), and is trivially reachable by any client (no auth, no signature secret needed to *trigger* it — only a syntactically-valid-length `sig`, e.g. `sig=00000000000000000000000000000000` is 34 chars so use exactly 32 `0`s).

**Fix:** Guard the type at the boundary, the same way `src/routes/report.js`'s own `POST /api/waste-reports/validate` handler already does for `location_id` (`typeof body.location_id === 'string' ? body.location_id : undefined`). Apply it in `GET /report`, and additionally close the contract gap in `qrSignature.js` so the "never throws" promise actually holds for every future caller:

```js
// src/services/qrSignature.js
function verifyLocationSignature(locationId, providedSig) {
  if (typeof locationId !== 'string' || locationId.length === 0) return false;
  if (typeof providedSig !== 'string' || providedSig.length !== 32) return false;
  ...
}
```

```js
// src/routes/report.js
router.get('/report', (req, res) => {
  const rawLocationId = req.query.location_id;
  const locationId = typeof rawLocationId === 'string' ? rawLocationId : undefined;
  const sig = typeof req.query.sig === 'string' ? req.query.sig : undefined;

  if (rawLocationId === undefined) {
    return res.render('report', { mode: 'dropdown', locations: locationStore.getAll(), locked: null, message: null });
  }
  // ...rest unchanged, using the narrowed `locationId`/`sig`
```

## Warnings

### WR-01: No `helmet`/security-header baseline, despite it being a documented project requirement

**File:** `index.js:1-25`, `package.json:22-29`

**Issue:** The project's own stack guidance (CLAUDE.md) specifies `helmet ^8.3.0` as a one-line baseline hardening step ("there's no reason to hand-roll these headers"). `helmet` is neither installed (`package.json` dependencies list only `@anthropic-ai/sdk`, `dotenv`, `ejs`, `express`, `multer`, `qrcode`) nor wired into `index.js`, which now serves rendered HTML (`views/report.ejs`) and static assets (`public/`) for the first time in this phase. There is currently no CSP, no `X-Content-Type-Options`, no `X-Frame-Options`, etc.

**Fix:**
```bash
npm install helmet
```
```js
// index.js
const helmet = require('helmet');
...
app.use(helmet());
```

### WR-02: `scripts/generate-qr.js` invokes `main()` without a `.catch()`, turning a missing secret / unreadable registry into an unhandled rejection instead of a clean CLI error

**File:** `scripts/generate-qr.js:24-55`

**Issue:** `locationStore.getAll()` (line 25) and `signLocationId()` (line 36, via `qrSignature.getSecret()`) both throw synchronously when `config/locations.json` is missing/corrupt or `QR_SIGNING_SECRET` is unset. Only the `QRCode.toFile` call inside the loop is wrapped in `try/catch` (lines 40-49); the two failure points above are not. Since `main()` is an `async` function called bare (`main();`, line 55, no `.then`/`.catch`), either failure produces an unhandled promise rejection — inconsistent with the deliberately clean, actionable error message this same file already prints for the "no registered locations" case (lines 27-31).

**Fix:**
```js
main().catch((err) => {
  console.error(`generate-qr failed: ${err.message}`);
  process.exitCode = 1;
});
```

### WR-03: `QR_SIGNING_SECRET` has no minimum-strength check

**File:** `src/services/qrSignature.js:9-15`, `.env.example:3-4`

**Issue:** `getSecret()` only checks that `QR_SIGNING_SECRET` is non-empty (`if (!secret) throw ...`). The `.env.example` comment correctly recommends generating 32 random bytes, but nothing enforces it — a developer could set `QR_SIGNING_SECRET=x` and every deployed QR sticker's anti-forgery guarantee would degrade to a brute-forceable single-character HMAC key. This isn't exploitable today (test/dev-only risk) but is worth a cheap guard given the whole "un-forgeable QR" design goal rests on this secret's entropy.

**Fix:** Add a minimum-length check, e.g. `if (!secret || secret.length < 32) throw new Error('QR_SIGNING_SECRET must be set and at least 32 characters — see .env.example');`.

## Info

### IN-01: `test/report.test.js`'s "zero network requests" test is coupled to exact source formatting

**File:** `test/report.test.js:204-227`

**Issue:** The test locates the end of the `btnNotThis.addEventListener` handler body by searching for the literal substring `'\n  }\n'` (2-space-indented closing brace). If `public/js/report.js` is later reformatted (different indent width, Prettier config change, etc.) and `indexOf` fails to find that exact substring, `handlerEnd` becomes `-1` and the slice falls back to `handlerStart` through **end of file** — which now includes the real `fetch(` call belonging to the unrelated `btnNext` CTA handler further down the same file, causing this test to fail for a change that introduced no actual regression in the toggle handler itself.

**Fix:** Scope the search to a more robust boundary, e.g. locate the next top-level `addEventListener(` call (or the matching brace via a small bracket-depth counter) instead of a fixed-indentation string, or extract the toggle logic into its own named function so the test can `require`/inspect it directly rather than string-slicing the file.

### IN-02: `POST /api/waste-reports/validate` has no request-volume guard

**File:** `src/routes/report.js:87-125`

**Issue:** The route comment explicitly and correctly scopes rate-limiting to a future phase ("it also never rate-limits or dedups — that is Phase 6"), and the handler is cheap (one HMAC compute, one small-file read via `locationStore`), so this is not a blocker. Flagging only so it isn't lost: this endpoint is reachable with no auth and no throttling, and each call re-reads and re-parses `config/locations.json` from disk with no caching.

**Fix:** No action required for this phase; confirm Phase 6's rate-limiting work item covers this route in addition to the eventual report-submission endpoint.

---

_Reviewed: 2026-08-20T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
