# API Coverage — Phase 1: Location & Submission Entry

**Detector result:** `api-coverage.cjs --json` over this phase's scope returned `{"detected": false, "signals": []}` (run 2026-08-19 against `01-RESEARCH.md` + `01-CONTEXT.md`).

No external API integration: QR generation and signing run entirely locally (qrcode npm package + Node crypto module) — no network calls, no remote service, no API key.

Full detail: Phase 1 calls no remote third-party service — QR images are produced locally by the `qrcode` npm package writing PNG files to disk, and QR payloads are signed/verified with Node's built-in `crypto` module in-process; the only "read" is the local file `config/locations.json`.

For completeness, the two capabilities that *could* be mistaken for external-API surface, and why they are not:

| Capability | Why it is not an external API integration |
|---|---|
| QR code generation (`qrcode@^1.5.4`) | A pure local encoder — `QRCode.toFile()` writes a PNG from a string. No network call, no service account, no remote endpoint. |
| QR signature sign/verify (`node:crypto`) | Built-in runtime module. `createHmac` / `timingSafeEqual` are local computations keyed by a locally-held secret. |

The Anthropic Claude API integration that does exist in this repo (`src/services/wasteImageClassifier.js`, `POST /api/waste-reports/classify`) belongs to **Phase 2**, is explicitly out of scope per `01-CONTEXT.md`'s Phase Boundary, and is not touched by any Phase 1 plan. Its coverage matrix is Phase 2's obligation, not this phase's.
