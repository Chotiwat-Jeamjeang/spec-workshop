---
phase: 1
slug: location-submission-entry
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-08-20
---

# Phase 1 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| phone camera / browser → `GET /report` | Fully untrusted, unauthenticated public input | `location_id`, `sig` query params |
| browser → `GET /api/locations` | Unauthenticated public read of registry data | none in, `{location_id, name}` out |
| browser → `POST /api/waste-reports/validate` | Fully untrusted, unauthenticated JSON body | `location_id`, `sig`, `note` |
| `locationStore` → `config/locations.json` | Semi-trusted file, hand-edited by a non-developer (D-03) | location registry records |
| process env → `QR_SIGNING_SECRET` | The signing key; confidentiality is the entire basis of the anti-forgery property | secret string |
| Express static → `public/` | Only `public/` is reachable as a static asset | CSS/JS assets |
| `npx` → npm registry | Downloads and executes third-party code at measurement time (`lighthouse`, ephemeral) | none persisted |
| headless Chrome → local app | Loads/executes the page exactly as a reporter's browser would | full page load |
| request body → JSON parser | An unbounded body would be parsed before any handler validation runs | JSON payload, capped at 64kb |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-01-01 | Spoofing | `GET /report` query params | high | mitigate | HMAC-SHA256 (`qrSignature.js`) + `crypto.timingSafeEqual`, checked before rendering `locked` | closed |
| T-01-02 | Tampering | `sig`/`location_id` pairing | high | mitigate | HMAC input is `location_id` alone — a signature is bound to exactly one id | closed |
| T-01-03 | Tampering (XSS) | EJS interpolation (all render branches + note label/counter copy) | high | mitigate | Every interpolation uses the EJS escaping tag `<%= %>`; zero unescaped `<%-` tags in `report.ejs`; reinforced by `helmet()` CSP | closed |
| T-01-04 | Information Disclosure | GET/POST QR-failure response bodies | medium | mitigate | Single consolidated `INVALID_QR_MESSAGE` constant reused on both GET and POST paths; per-reason detail logged server-side only | closed |
| T-01-05 | Denial of Service | unauthenticated `GET /report`, `GET /api/locations`, `POST /api/waste-reports/validate` (volume/spam) | medium | accept | Deferred to Phase 6 (ABUSE-01/02) per `01-CONTEXT.md` Phase Boundary; validate endpoint is zero-persistence, bounding blast radius in the meantime | closed (accepted) |
| T-01-06 | Information Disclosure | `QR_SIGNING_SECRET` | high | mitigate | Lives only in gitignored `.env`; `.env.example` carries the empty key name only; never logged/rendered; ≥32-char minimum enforced | closed |
| T-01-07 | Denial of Service | malformed / BOM-prefixed `config/locations.json` | low | mitigate | Leading BOM stripped before `JSON.parse`; loud, path-naming parse failure instead of silent empty registry | closed |
| T-01-09 | Tampering | `express.static` mount scope | medium | mitigate | Mounted at `path.join(__dirname, 'public')` only — repository root never reachable as a static asset | closed |
| T-01-10 | Information Disclosure | `GET /api/locations` / POST verdict response payloads | medium | mitigate | Explicit projection to `{location_id, name}` only — `lat`/`lng` never leave the server | closed |
| T-01-11 | Spoofing | dropdown path accepting an unsigned `location_id` | medium | accept | Deliberate per D-05 — the manual path has no QR to sign, so registry membership is the only available constraint; kept structurally separate from the QR path's stronger check | closed (accepted) |
| T-01-12 | Information Disclosure | remote assets referenced from the stylesheet / page | medium | mitigate | Zero remote URLs, zero `@import`, zero hosted fonts — confirmed single-origin waterfall in `01-FCP-REPORT.md` for all 3 render states | closed |
| T-01-13 | Denial of Service | render-blocking third-party stylesheet | low | mitigate | Same control — only same-origin stylesheet | closed |
| T-01-14 | Information Disclosure | committed QR artifacts | medium | mitigate | `qr-output/` gitignored; zero tracked QR PNGs | closed |
| T-01-15 | Elevation of Privilege | QR generation exposed as a route | high | mitigate | `scripts/generate-qr.js` is a pure CLI — no Express import, no router, no `app.listen` | closed |
| T-01-16 | Tampering (XSS) | note content reflected into the live counter | high | mitigate | Counter writes only a computed number via `textContent`, never the note content itself | closed |
| T-01-17 | Tampering | client-side toggle used to bypass the QR trust decision | medium | mitigate | POST handler reads only submitted `location_id`/`sig`, never client `data-mode`; re-derives trust independently | closed |
| T-01-18 | Denial of Service (client) | unbounded note input | low | mitigate | Native `maxlength="500"` physically caps input in the browser | closed |
| T-01-19 | Spoofing | `POST` path trusting a prior successful `GET` | high | mitigate | Handler re-runs `verifyLocationSignature`/`findById` on submitted values; stateless, holds no session | closed |
| T-01-20 | Tampering | client-side-only note limit bypassed via curl/devtools | high | mitigate | Server-side re-check in UTF-16 code units, matching the browser's own `maxlength` measure; `Buffer.byteLength`/`TextEncoder` banned | closed |
| T-01-21 | Tampering (XSS) | server error string rendered into the banner | high | mitigate | Client assigns every message via `textContent`; `innerHTML` absent from client/view/route source | closed |
| T-01-22 | Denial of Service | unbounded JSON request body | medium | mitigate | `express.json({ limit: '64kb' })`, mounted before both routers | closed |
| T-01-23 | Tampering | measurement artifacts committed to the repository | low | mitigate | Lighthouse JSON output written outside the repo (temp dir); zero tracked lighthouse/lhr artifacts | closed |
| T-01-SC | Tampering (supply chain) | npm installs (`qrcode`, `ejs`, `supertest`, ephemeral `lighthouse`) | high | mitigate | All installed packages match the Approved package-legitimacy audit; `[SUS]`-flagged `lighthouse` never added as a dependency, gated behind a human-approved `blocking-human` checkpoint | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on (high) count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01 | T-01-05 | No rate limiting/dedup on unauthenticated GET/POST endpoints. Explicitly scoped to Phase 6 (ABUSE-01/ABUSE-02) per `01-CONTEXT.md`'s Phase Boundary; adding throttling in Phase 1 would contradict the locked phase scope. The `POST /api/waste-reports/validate` handler persists nothing, bounding the blast radius of a flood in the meantime. | gsd-security-auditor (Phase 1 audit) | 2026-08-20 |
| AR-02 | T-01-11 | Manual dropdown entry accepts an unsigned `location_id`, validated only against registry membership. Deliberate per CONTEXT.md D-05 — the manual path has no QR to sign, so physical-presence proof is not a stated goal for that path. The QR path's stronger signature check is kept structurally separate rather than weakened to match. | gsd-security-auditor (Phase 1 audit) | 2026-08-20 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-08-20 | 23 | 23 | 0 | gsd-security-auditor |

---

## Notes from Audit (non-blocking)

- **Unregistered attack surface:** `index.js` mounts `POST /api/waste-reports/classify` (Phase 2's proof-of-concept, `src/routes/classify.js` — unauthenticated multipart upload, 5MB memory storage, forwards to Claude). Phase 1's threat register has no entry for this endpoint; it predates Phase 1 but Phase 1's `index.js` changes are what make it reachable in the running app. Recommend registering it in Phase 2's own threat model. Not blocking — no Phase 1 threat depends on it, and `express.json` limit + `helmet` now sit in front of it at the app level.
- **Incomplete `## Threat Flags` reporting:** 01-01 through 01-04 SUMMARY.md files contain no `## Threat Flags` section. The auditor compensated by verifying those plans' surface directly against the PLAN.md threat registers rather than relying on the summaries.
- **Register numbering gap:** `T-01-08` does not appear in any plan's register (IDs jump 07 → 09). Likely a drafting artifact, not a dropped threat.
- **Boot-time secret check is weaker than call-time:** `index.js` rejects only an absent `QR_SIGNING_SECRET` at boot; the ≥32-char minimum (WR-03 fix) lives in `qrSignature.js` and is enforced at first use, not at startup. A too-short secret therefore boots cleanly and fails on the first `/report` request instead of failing fast. Not a register threat — noted for awareness.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-08-20
