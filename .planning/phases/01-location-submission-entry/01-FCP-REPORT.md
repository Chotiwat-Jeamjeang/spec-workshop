# Phase 1 Plan 07 — FCP & Responsive Verification Report (SUBM-04)

Measured 2026-08-19. Records the two manual-only SUBM-04 checks: First Contentful
Paint under a simulated 4G profile, and responsive correctness at 375px / 768px /
1024px, across all three render states (dropdown, locked, error).

---

## Environment note: Chrome not installed, Edge (Chromium-based) used instead

This machine has no Google Chrome install (`chrome.exe` not found under either
`Program Files` location, nor on `PATH`). Microsoft Edge — a Chromium-based
browser — is installed at
`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` (version
`Edg/151.0.0.0`, reported by Lighthouse's own `environment.hostUserAgent`).
Lighthouse's `CHROME_PATH` environment variable is documented to accept any
Chromium ≥66-based binary, not literally Google Chrome only, so
`CHROME_PATH="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"`
was exported before every `npx lighthouse` invocation below. This is the same
rendering/paint engine Chrome uses (Blink), so the measurement is equivalent
to what a genuine Chrome run would report. Recorded honestly rather than
silently substituted, per this task's own instruction not to fabricate or
silently skip.

## Deviation: a `start` script did not exist and was added

`package.json` had no `"start"` script (`scripts` contained only `"test"`).
`npm start` — as instructed by this task's `<action>` — failed with
`npm error Missing script: "start"` before any measurement could run. This is
a Rule 3 (blocking-issue) auto-fix: added `"start": "node index.js"` to
`package.json`'s `scripts` block (matches the existing `"main": "index.js"`
entry point and the `require.main === module` guard already in `index.js`).
This is the only change made to `package.json`; a byte-diff taken
immediately after this addition and again after every `npx lighthouse`
invocation below confirms `npx` itself left `package.json` completely
unchanged — no `lighthouse` entry was added to `dependencies` or
`devDependencies` at any point.

## Deviation: the error state required `--ignore-status-code`

Lighthouse refuses to score First Contentful Paint for any top-level
navigation whose HTTP status is ≥400 (`ERRORED_DOCUMENT_REQUEST` — hard-coded
in Lighthouse's own navigation-error handling, not an artifact of this
environment). The error-state URL deliberately returns HTTP 400 per SUBM-02,
so the first attempt at that URL failed gathering entirely (`FCP: undefined`,
`0` network requests recorded, `runtimeError.code:
"ERRORED_DOCUMENT_REQUEST"`). Lighthouse ships a documented CLI flag for
exactly this situation — `--ignore-status-code` ("Disables failing on all
error status codes, and instead issues a warning") — which was added for the
error-state run only. It does not change what is rendered or measured; it
only tells Lighthouse to still gather metrics from a non-2xx page instead of
aborting. Re-run with the flag succeeded and is the number recorded below.

---

## First Contentful Paint (Task 2)

**Command (dropdown and locked states):**
```
CHROME_PATH="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
  npx lighthouse "<url>" --only-categories=performance --output=json --quiet \
  --chrome-flags="--headless" --output-path=<path-outside-repo>.json
```

**Command (error state — see deviation above):**
```
CHROME_PATH="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
  npx lighthouse "<url>" --only-categories=performance --output=json --quiet \
  --chrome-flags="--headless" --ignore-status-code --output-path=<path-outside-repo>.json
```

No custom throttling configuration was passed in any run — Lighthouse's
default (`throttlingMethod: "simulate"`) was used, as instructed, since it is
the documented closest match to a "4G" target:

| Throttling parameter | Value |
|---|---|
| Method | `simulate` |
| Round-trip time | 150 ms |
| Throughput | 1638.4 Kbps (download 1474.56 Kbps / upload 675 Kbps) |
| CPU slowdown | 4x |
| Form factor | mobile |

**Lighthouse version:** `13.4.1` (all three runs — confirmed in each JSON's
`lighthouseVersion` field).
**Date measured:** 2026-08-19 (UTC timestamps per run below, from each
report's own `fetchTime`).

| Render state | URL measured | FCP (ms) | vs. 2000ms | Origins in waterfall | Requests | Measured at (UTC) |
|---|---|---:|---|---:|---:|---|
| dropdown | `http://localhost:3000/report` | 765.22 | **PASS** (1234.78ms under budget) | 1 | 4 | 2026-08-19T21:58:40.229Z |
| locked | `http://localhost:3000/report?location_id=A&sig=46df516d2be160dd5e510ab2ed2c5959` | 761.98 | **PASS** (1238.02ms under budget) | 1 | 4 | 2026-08-19T21:59:46.636Z |
| error | `http://localhost:3000/report?location_id=NOPE&sig=00000000000000000000000000000000` | 958.31 | **PASS** (1041.69ms under budget) | 1 | 4 | 2026-08-19T22:01:32.907Z |

All three origins-in-waterfall counts were verified by extracting every
`network-requests` audit item's URL, taking the distinct set of origins, and
confirming the set is exactly `{"http://localhost:3000"}` in each of the
three JSON reports — no third-party origin (font CDN, analytics, etc.)
appears in any state, consistent with `public/css/report.css` and
`views/report.ejs` shipping zero external asset references.

`package.json` byte-diff confirmed identical before and after all three
`npx lighthouse` invocations (baseline snapshot taken immediately after
adding the `start` script, before the first `npx` call) — `lighthouse` was
never added to `dependencies` or `devDependencies`. No Lighthouse JSON output
file was written inside the repository; all three were written to the OS
temp directory (`%LOCALAPPDATA%\Temp`, outside the git working tree) and are
not part of this commit.

**`node --test`:** 56/56 passing after this task.

---

## Responsive verification (Task 3)

### Stylesheet source assertions (automated)

```
node -e "<the exact expression from this task's <verify><automated> block>"
```

Result: **OK** — exactly two `min-width` media queries exist
(`@media (min-width: 768px)` and `@media (min-width: 1024px)`), the 480px
card ceiling (`max-width: 480px`) is declared inside the 768px query, and
every interactive control (`.location-select`, `.cta`, `.location-not-this`)
carries `min-height: 44px` — meeting the WCAG 2.5.5 44px touch-target floor
noted in the UI contract.

### Bug found and fixed during verification

While capturing responsive screenshots, `#validate-banner` (the client-side
validation error banner, meant to stay hidden via the `is-hidden` class until
`report.js`'s `showMessage()` reveals it) rendered as a visible, empty,
red-bordered box on every page load in every state, at every width — see the
"before" screenshot evidence below. Root cause: `public/css/report.css`
declared `.error-banner, #validate-banner { display: flex; ... }`; the
`#validate-banner` **ID** selector (specificity `1,0,0`) always outranks
`.is-hidden`'s **class** selector (`display: none`, specificity `0,1,0`),
regardless of source order — so the element rendered even while carrying the
`is-hidden` class. The same root cause silently affected
`#location-inline-error` too (tied class-specificity with `.inline-error`,
resolved by source order in `.inline-error`'s favor), though that element has
no border/background and so produced no visible artifact — only a spurious
4px margin-top.

**Fix (Rule 1 — auto-fix bug):** `public/css/report.css`'s `.is-hidden` rule
now reads `display: none !important;`, with a code comment explaining why the
`!important` is deliberate (a utility "hidden" class must always win over any
component rule, including ID selectors). No other file changed. Verified:
`node --test` — 56/56 passing, unchanged from before the fix. The stylesheet
source-assertions above were re-run after the fix and still pass unchanged
(the fix touches only the `display` value inside an existing rule — no new
media query, no breakpoint change, no min-height change).

### Per-state, per-width results (post-fix)

Measured with a small ephemeral Node script (`tmp-cdp-responsive.js`, deleted
after use — not committed) that drove the same headless Edge instance over
the Chrome DevTools Protocol using only Node's built-in `WebSocket` and
`fetch` (zero new npm dependencies): for each of the 3 render states × 3
widths, it set `Emulation.setDeviceMetricsOverride` to the target width,
navigated, waited for `Page.loadEventFired`, read
`document.documentElement.scrollWidth` / `clientWidth` /
`window.innerWidth` / the `.form-card` bounding-box width via
`Runtime.evaluate`, and captured a PNG via `Page.captureScreenshot`. All 9
screenshots were visually inspected directly (image contents reviewed, not
just the numeric metrics) before recording any result below.

| State | Width | scrollWidth | clientWidth | innerWidth | Overflow? | `.form-card` width | Expected | Visual check |
|---|---:|---:|---:|---:|---|---:|---|---|
| dropdown | 375px | 375 | 375 | 375 | No | 343px | full-width, 16px side padding, no max-width (375−32=343 ✓) | Pass — single column, Thai glyphs render correctly, no phantom banner (post-fix) |
| dropdown | 768px | 768 | 768 | 768 | No | 480px | centred card, max-width 480px | Pass |
| dropdown | 1024px | 1024 | 1024 | 1024 | No | 480px | centred card, max-width 480px, 32px page margin | Pass |
| locked | 375px | 375 | 375 | 375 | No | 343px | full-width, 16px side padding | Pass — lock badge, location name, "ไม่ใช่จุดนี้" link all visible and tappable |
| locked | 768px | 768 | 768 | 768 | No | 480px | centred card, max-width 480px | Pass |
| locked | 1024px | 1024 | 1024 | 1024 | No | 480px | centred card, max-width 480px, 32px page margin | Pass |
| error | 375px | 375 | 375 | 375 | No | 343px | full-width, 16px side padding | Pass — exact SPEC message "ไม่พบจุดนี้ในระบบ กรุณาติดต่อเจ้าหน้าที่" renders, wraps correctly, no clipping |
| error | 768px | 768 | 768 | 768 | No | 480px | centred card, max-width 480px | Pass |
| error | 1024px | 1024 | 1024 | 1024 | No | 480px | centred card, max-width 480px, 32px page margin | Pass |

**Outcome: 9/9 pass.** No horizontal overflow at any width in any state
(`scrollWidth === clientWidth === innerWidth` in every measurement — a
non-zero difference would indicate content wider than the viewport). The
`.form-card` width matches the UI contract exactly: 343px at 375px (full
width minus 16px side padding on each side, no max-width constraint) and
480px at both 768px and 1024px (the centred card ceiling). Thai text
rendered as real glyphs (system font stack resolved correctly) in every
screenshot reviewed — no fallback boxes. The note `<textarea>` remained a
fixed-height, internally-scrollable field at every width (matches
`.note-input`'s `resize: vertical; overflow-y: auto;`, no auto-grow).
Touch-target controls (`<select>`, `ถัดไป` button, `ไม่ใช่จุดนี้` link) all
render at a comfortable width for one-handed use at 375px.

---

## Summary against acceptance criteria

- FCP ≤2000ms for all three states: **PASS** — worst case (error, 958.31ms)
  is still 1041.69ms under budget.
- Single origin (`http://localhost:3000`) in the network waterfall for all
  three states: **PASS**.
- No horizontal overflow at 375px / 768px / 1024px, across all three states:
  **PASS** (9/9).
- `package.json` contains no `lighthouse` entry: **PASS** (confirmed by
  byte-diff before/after every `npx` invocation).
- No Lighthouse JSON artifact committed to the repository: **PASS** (all
  written to the OS temp directory).
- `node --test` exits 0: **PASS** (56/56, both before and after the CSS fix).
