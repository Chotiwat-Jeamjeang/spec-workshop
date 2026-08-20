# Pitfalls Research

**Domain:** JSON-file-backed Node/Express reporting app with QR check-in, AI vision classification, and LINE Messaging API notifications (no auth, no database)
**Researched:** 2026-08-18
**Confidence:** MEDIUM (cross-referenced against official LINE Developers docs, sharp/libvips docs, and multiple independent security write-ups; several findings are well-established engineering patterns rather than single-source claims)

## Critical Pitfalls

### Pitfall 1: JSON file "locking" that isn't actually atomic

**What goes wrong:**
Two reports submitted within milliseconds of each other (e.g. two students scanning QR codes at the same bin at the same time) both read `waste-reports.json`, append their own record in memory, and write back — the second write silently overwrites the first. The lost report never reaches staff or LINE. This is invisible in manual testing (one browser tab) and only appears under real concurrent load.

**Why it happens:**
`fs.readFile` → modify in memory → `fs.writeFile` is not an atomic operation. A naive in-process mutex (e.g. a JS boolean flag) only protects against concurrency within a single Node process; if the app ever runs multiple workers/processes (PM2 cluster, multiple dynos), it does nothing. Developers also often treat "I added a lock" as done without verifying the write itself is atomic (a crash mid-write can leave a truncated/corrupt file).

**How to avoid:**
- Use a real file-lock library (`proper-lockfile`) around the full read-modify-write cycle, not just the write call, with `try/finally` to guarantee release even on error.
- Write to a temp file (`waste-reports.json.tmp`) and `fs.rename()` over the original — rename is atomic on the same filesystem, so a crash mid-write never corrupts the live file.
- Keep the app single-process for this JSON-file design (document this as a hard constraint) or move to a real database before scaling to multiple processes/instances.
- Serialize the lock+write inside a single async queue so a burst of near-simultaneous requests is processed strictly one at a time rather than relying on lock contention/retry alone.

**Warning signs:**
- Load-testing with 5-10 concurrent POSTs to the report endpoint and finding fewer than 5-10 records in the resulting file.
- `waste-reports.json` occasionally fails to `JSON.parse` after a burst of traffic.
- Report counts on the dashboard don't match LINE notification counts.

**Phase to address:** The phase that implements report persistence (write path), before QR/LINE integration is layered on top — this is foundational and every later feature depends on writes being reliable.

---

### Pitfall 2: Trusting file extension or client-supplied MIME type for uploaded images

**What goes wrong:**
An attacker (or just a mis-sent file) uploads a file named `photo.jpg` that is actually an HTML/SVG/script payload or a corrupted/malicious binary. If the server only checks the extension or the `Content-Type` header the browser sent, it accepts the file. Depending on how the file is later served, this can lead to stored XSS (SVG with embedded `<script>`), path/type confusion, or a crash when the image-processing step tries to decode a non-image as an image.

**Why it happens:**
Extension and browser-supplied MIME type are both attacker-controlled — trivial to spoof by renaming a file or crafting the request. Developers frequently implement "validation" as `multer` `fileFilter` checking `file.mimetype`, which is exactly the spoofable client-supplied value, and stop there, believing they've satisfied the "validate MIME type" requirement.

**How to avoid:**
- Validate the actual file content via magic-byte/signature sniffing (e.g. the `file-type` npm package, or trust the format `sharp`/libvips actually decodes it as) — never the client's `Content-Type` header or filename extension alone.
- Enforce an allowlist of both extension AND detected type (`.jpg/.jpeg/.png/.webp` only), rejecting anything else with a clear error.
- Generate a new random filename (UUID) server-side on save — never persist or trust the client's original filename in the storage path.
- Re-encode every accepted image through `sharp` before saving (this also strips EXIF/GPS metadata and invalidates polyglot files).

**Warning signs:**
- `fileFilter` logic that only checks `file.mimetype` or `path.extname(file.originalname)`.
- No dependency on a magic-byte detection library anywhere in the upload path.
- Uploaded files are served back with their original filename.

**Phase to address:** The photo-upload phase, before AI classification is wired in (classification should only ever run on verified, re-encoded images).

---

### Pitfall 3: Decompression ("pixel") bombs and oversized image decode DoS

**What goes wrong:**
A tiny file (a few KB) crafted to decode into an enormous pixel buffer (tens of thousands of pixels per side) is uploaded. When `sharp`/libvips (or the AI classification step) tries to decode/resize it, memory and CPU spike, potentially taking down the single Node process — a severe risk for a no-auth, publicly reachable upload endpoint with generous per-request limits (up to 3 files × 5MB).

**Why it happens:**
The 5MB *file size* limit does nothing to bound *decoded pixel dimensions* — a highly-compressible crafted PNG can be tiny on disk and gigantic once decoded. Teams that only enforce `multer` size limits assume that's sufficient protection.

**How to avoid:**
- Set `sharp`'s `limitInputPixels` well below its default (268 megapixels) — e.g. ~25 megapixels is generous for phone-camera waste photos and blocks bomb-scale images.
- Pass `failOn: 'truncated'` so partially-uploaded or corrupt files raise an error instead of being silently (mis)decoded.
- Run image decode/resize/face-blur with a timeout and treat failures as `unclassified`/rejected rather than letting a hung decode block the request indefinitely.
- Combine with rate limiting (see Pitfall 6) so even legitimate-looking bomb attempts are capped per IP/hour.

**Warning signs:**
- No `limitInputPixels` configured on the `sharp` instance used for uploads.
- Classification or face-blur step has no timeout and can hang the request.

**Phase to address:** Same phase as MIME/magic-byte validation (photo-upload hardening) — pixel-bomb protection is part of the same "don't trust the uploaded bytes" work.

---

### Pitfall 4: LINE notification retries turn into duplicate-message storms

**What goes wrong:**
The retry-with-exponential-backoff logic (3 retries required by spec) resends the *same* push request on failure/timeout. If a request actually succeeded on LINE's side but the response was lost (network blip) before the app saw success, a naive retry sends the identical notification again — and if this happens across multiple reports in a burst, staff get flooded with duplicate/near-duplicate messages in the group chat, eroding trust in the "urgent" highlighting the whole feature depends on.

**Why it happens:**
"Retry on any failure" is the default instinct, but LINE's Messaging API push endpoint is not automatically idempotent — a request that appears to fail client-side (timeout) may have already been delivered server-side. Developers often don't realize LINE has a first-class mechanism for exactly this problem.

**How to avoid:**
- Always send LINE push requests with the `X-Line-Retry-Key` header set on the *first* attempt (a UUID generated per logical notification). Reuse the same key on every retry of that same logical send — LINE deduplicates and executes the underlying request only once no matter how many times it's retried with that key. Requests sent without a retry key can never be safely retried after the fact.
- Cap retries at the required 3 attempts with exponential backoff, and after exhausting retries, write the "notification failed" status to the report record (per SPEC) rather than retrying indefinitely.
- Be aware of the free-tier monthly push-message quota and per-endpoint rate limits (429 on excess) — a burst of legitimate reports (e.g. after a campus event) could hit the quota; design the "notification failed" fallback (visible on staff dashboard) to cover quota exhaustion, not just network errors.

**Warning signs:**
- Retry logic does not include or persist a retry key across attempts for the same notification.
- No handling specifically for HTTP 429 from the LINE API distinct from other failure types.
- No monitoring/alert on approaching the monthly push-message quota.

**Phase to address:** The LINE notification integration phase.

---

### Pitfall 5: Webhook/inbound trust without signature verification (future-proofing)

**What goes wrong:**
If the system ever adds a LINE webhook (e.g. to let staff reply/react from LINE, or a future "acknowledge in LINE" feature), accepting webhook payloads without verifying the `x-line-signature` header lets anyone who discovers the webhook URL forge events (fake status changes, fake acknowledgments) since the endpoint is otherwise unauthenticated by design in this project.

**Why it happens:**
Push-only integrations (as in this MVP) don't need this, so it's easy to skip webhook signature verification entirely if a webhook is added later without revisiting security.

**How to avoid:**
- If/when any LINE webhook is introduced, verify the HMAC-SHA256 signature (computed over the raw request body using the channel secret) against the `x-line-signature` header before processing any event — reject unverified requests outright.
- Document this requirement now in the architecture notes so a future contributor doesn't add a webhook endpoint without it.

**Warning signs:**
- Any new route matching `/webhook` or `/line/*` that parses the request body before/without a signature check.

**Phase to address:** Not required for MVP (push-only), but flag explicitly as a requirement if a LINE webhook is ever added in a later milestone.

---

### Pitfall 6: No-auth reporting endpoint becomes a spam/DoS vector

**What goes wrong:**
Because there is no login by design, the report-submission endpoint (with image upload) is the most attractive abuse target in the system: a script can submit hundreds of fake reports with garbage images, filling `waste-reports.json`, spamming the LINE group with real-time notifications, and burning AI classification API cost — all from a single client.

**Why it happens:**
"No login" is a product requirement, but teams sometimes treat "no auth" as "no controls at all," when in fact no-auth systems need *more* abuse engineering, not less, since there's no account to ban.

**How to avoid:**
- Enforce the required per-IP rate limit (5 reports/hour) at the Express middleware layer (e.g. `express-rate-limit`), applied specifically to the submission endpoint, before file parsing/upload begins (reject early, don't accept the multipart body first).
- Recognize the IP-limit tradeoff explicitly: campus Wi-Fi/NAT means many real users can share one IP — set the limit generously enough for legitimate use but log/alert on sustained abuse so it can be tuned post-launch rather than guessed once and forgotten.
- Add a lightweight bot signal beyond IP (e.g. honeypot hidden field, minimum time-on-form before submit) since IP limits alone are trivially bypassed by rotating IPs but stop the common case (single script hammering the endpoint).
- Since dedup (`location_id` + 30 min window) already exists for legitimate double-reports, make sure the rate limiter and dedup logic don't conflict — a legitimate repeat reporter at the same bin should be deduped, not just rate-limited into a generic error.

**Warning signs:**
- Rate limiting applied only at a reverse-proxy/infra layer that isn't actually deployed, with nothing enforced in the app itself.
- Multipart file parsing happens before the rate-limit check runs.
- No visibility (log/metric) into requests rejected for exceeding the rate limit.

**Phase to address:** The report-submission phase, implemented alongside the endpoint itself (not bolted on later) — this is a core requirement, not a hardening afterthought.

---

### Pitfall 7: QR codes are physically spoofable and the app can't detect that on its own

**What goes wrong:**
Because a QR code is just a printed pattern, anyone can print a sticker with a fake QR code and place it over (or next to) a legitimate one on a bin. If the fake QR encodes a `location_id` that isn't registered, the app-level validation (required by spec) catches it and shows the "location not found" error — good. But if the fake QR encodes a *different, valid* `location_id` (e.g. one across campus) or points to an entirely different URL (phishing/off-domain), the app cannot detect that from the request alone; reports get silently misattributed to the wrong location, or users get phished.

**Why it happens:**
The spec's QR mitigation (reject unregistered `location_id`) only defends against *garbage* QR codes, not against a *valid-looking but wrong or malicious* substitute — a materially different threat that's easy to overlook because "we validate the QR" sounds like it's already handled.

**How to avoid:**
- Validating `location_id` against the registered list (already in SPEC) is necessary but not sufficient — treat it as covering only the "garbage/typo QR" case.
- Route every QR code through the app's own verified domain (not a generic short-link service) so users can visually confirm the URL before trusting the destination, per general QR anti-spoofing guidance.
- Use tamper-resistant physical codes (laminated, or printed directly on durable signage rather than a peel-able sticker) for high-traffic locations, and include this as an operational/rollout recommendation, not just a code fix.
- Recommend a lightweight periodic physical audit process (facilities staff spot-check bins) since no software control can fully prevent a sticker swap — this is a real-world/process mitigation, not something the app alone can solve.

**Warning signs:**
- No operational plan for who audits physical QR placements after rollout.
- QR generation logic does not route through a single recognizable app domain.

**Phase to address:** QR flow implementation phase (technical validation), plus a note in rollout/ops documentation (physical mitigation) — flag this pitfall's non-technical half explicitly so it isn't dropped as "not our problem."

---

### Pitfall 8: Automated face-blur creates a false sense of complete privacy compliance

**What goes wrong:**
The team implements automatic face detection + blur and considers the "no unnecessary personal data" requirement satisfied. In practice, automated face detectors reliably miss faces that are small, angled, partially obscured, in shadow, or in the background of a wide shot — exactly the kind of incidental faces likely to appear in campus waste photos (someone walking by in the background). Some fraction of uploaded photos will retain unblurred, recognizable faces despite the feature "working."

**Why it happens:**
Face detection libraries are evaluated on demo images (single, front-facing, well-lit face) during development, which passes easily — the failure modes only show up with the messy, incidental photos real users actually submit.

**How to avoid:**
- Do not present face-blur as a guarantee to users or in documentation — treat it as best-effort risk reduction, and set expectations accordingly (this is also a legal/policy point, not just engineering).
- Use a sufficiently strong blur/pixelation radius once a face region is detected (light blur is reversible via deblurring techniques; use a stronger blur or full pixelation, not a subtle Gaussian).
- Add server-side logging (without storing the face image itself) when face detection confidence is low/ambiguous, so staff reviewing the queue can be alerted to manually double-check a specific photo if needed — a lightweight manual fallback rather than full manual review of every photo.
- Consider running the face-blur step over the *final, re-encoded* image (after the pixel-bomb/format hardening in Pitfall 3), not the raw upload, so detection operates on a known-good decode.

**Warning signs:**
- No test photos in QA that include background/incidental people, only staged front-facing test faces.
- Face-blur library confidence scores are computed but never surfaced or logged anywhere.

**Phase to address:** The photo-upload/AI-processing phase, alongside classification — should be verified with real-world-messy test images, not just clean demo faces.

---

### Pitfall 9: AI classification treated as authoritative instead of advisory, or blocking submission

**What goes wrong:**
Two related failure modes: (a) the urgency/waste-type label the AI produces gets treated downstream as ground truth (e.g. auto-closing low-urgency reports, or hiding `unclassified` reports from the sorted queue), quietly contradicting the spec's requirement that staff always make the final call; (b) a classification failure (timeout, malformed response, model refusal) is allowed to block the user's submission entirely, when the spec explicitly requires `unclassified` fallback with no blocking.

**Why it happens:**
Vision LLM output looks confident and well-formatted (especially with structured/JSON-schema outputs), which tempts treating it as more reliable than it is; and it's easy to implement the happy path (classify → save) without deliberately testing what happens when the API call fails, times out, or returns something outside the expected schema.

**How to avoid:**
- Use JSON-schema/structured-output mode (already the project's chosen approach) to get consistent shape, but still explicitly branch on failure: any error, timeout, or off-schema response → `waste_type: "unclassified"` / `urgency: "unclassified"`, save and continue — never let the classification call be a hard dependency of the save path.
- Keep urgency computed by the app from `coverage_percentage` against the admin-configurable threshold file (already the project's design decision) rather than letting the model assert urgency directly — this is already the right call, just needs the failure-path discipline layered on top.
- Ensure the UI and dashboard always allow staff/users to override the AI's `waste_type` and urgency, and never suppress or auto-resolve a report purely based on AI output.
- Add a timeout on the classification call distinct from the overall request timeout, so a slow AI provider can't stall report submission — treat timeout as equivalent to classification failure (`unclassified`).

**Warning signs:**
- No explicit test case for "classification API returns 500 / times out / returns malformed JSON."
- Sorting or filtering logic on the staff dashboard that depends on `urgency` being a valid non-`unclassified` value.
- No visible/editable override control for `waste_type`/urgency in the staff UI.

**Phase to address:** AI classification integration phase — the failure-path branch should be built and tested at the same time as the happy path, not added afterward.

---

### Pitfall 10: One-way status workflow with no "undo" turns mistakes into orphaned/duplicate records

**What goes wrong:**
The spec deliberately makes status progression one-way (`รอดำเนินการ → กำลังดำเนินการ → ดำเนินการเสร็จสิ้น`, no reverting) and tells staff to "create a new report" if they click the wrong status. Without care, this produces a confusing dashboard full of accidentally-advanced/closed reports sitting next to a fresh duplicate report for the same real-world issue, with no link between them — worse for tracking than a simple revert would have been.

**Why it happens:**
The one-way-status decision is reasonable (audit trail integrity, no accidental "undo" abuse) but its stated recovery path (make a new report) is a manual workaround, not a designed feature — it's easy to implement the forward-only status transition correctly while never building any way to relate the accidental report to its replacement.

**How to avoid:**
- Add a confirmation step before any status change (especially the terminal "เสร็จสิ้น" transition) so accidental clicks are rare in the first place, reducing reliance on the "just make a new report" workaround.
- Since dedup logic (Pitfall/feature already in spec: `location_id` + 30-minute window) already links repeat reports, consider whether a staff-triggered "new report for same issue" action can reuse that same dedup linkage (e.g. tag the new report with a reference to the mis-closed one) so the dashboard doesn't lose the connection — even a simple free-text note is better than nothing.
- Make status-change history visible (who changed to what, when, via the optional `changed_by` field) so staff reviewing a confusing report can at least see it was likely a misclick, even without formal auth to enforce accountability.

**Warning signs:**
- No confirmation dialog on the terminal status transition.
- No way to see status-change history/timestamps per report, only the current status.

**Phase to address:** Staff dashboard / status-management phase.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|-----------------|------------------|
| In-process mutex instead of `proper-lockfile` for JSON writes | Simpler code, no new dependency | Breaks the moment the app runs as more than one process (PM2 cluster, scaling) | Only if the app is contractually pinned to a single Node process forever — document this explicitly if chosen |
| Checking `multer`'s `file.mimetype` only, skip magic-byte check | Faster to ship upload feature | Client-controlled value is spoofable — reopens the exact vulnerability the spec calls out | Never for this project — SPEC explicitly requires real MIME validation |
| Retrying LINE push without `X-Line-Retry-Key` | One less header to manage | Risk of duplicate notifications flooding the staff group during network blips | Never — the key costs nothing to add and directly prevents a real, spec-relevant failure mode |
| Skipping `limitInputPixels` on `sharp` | Slightly less config | Opens the app (public, no-auth, file upload) to a trivial memory-exhaustion DoS | Never in production; acceptable only in a throwaway local prototype not exposed publicly |
| No honeypot/behavioral signal, IP rate-limit only | Faster to ship | Trivial to defeat with IP rotation; spam/cost risk on AI classification calls | Acceptable for a true MVP soft-launch with small, known user base (e.g. single-building pilot), but should be added before wider campus rollout |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|-----------------|-------------------|
| LINE Messaging API (push) | Retrying failed sends without a retry key, causing duplicate notifications | Generate a UUID retry key per logical notification, reuse it across all retry attempts for that same send |
| LINE Messaging API (quota) | Assuming push sends are effectively unlimited during testing, hitting the free-tier monthly quota or per-endpoint rate limit in production under real report volume | Track/log push send counts, treat 429 as a distinct failure mode from network errors, and surface "notification failed" on the dashboard per SPEC when retries are exhausted |
| AI vision classification API | Treating structured-output JSON as infallible and skipping explicit error/timeout branches | Always branch explicitly on API error/timeout/off-schema response to `unclassified`, with its own timeout separate from the overall request |
| `sharp`/libvips | Using default `limitInputPixels` (268MP) meant for trusted internal images, not public uploads | Lower `limitInputPixels` for the public upload path specifically; add `failOn: 'truncated'` |
| `proper-lockfile` (or similar) | Locking only the write call, not the full read-modify-write cycle, so two readers can still race before either writes | Wrap the entire read → modify → write sequence in a single lock acquisition, released in `finally` |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| Rewriting the entire `waste-reports.json` array on every single status change or new report | Write latency grows linearly with total report count; file I/O becomes the bottleneck | Acceptable at campus MVP scale (hundreds–low thousands of reports); if usage grows, migrate to a real database rather than trying to optimize JSON-file writes further | Likely noticeable once the file holds several thousand reports with embedded metadata, or if images/base64 are ever stored inline in the JSON (must not — store images on disk, JSON holds only file paths) |
| Full backup-copy of `waste-reports.json` before every write (as required by SPEC) done synchronously on the request path | Adds latency to every submission/status-change request proportional to file size | Do the backup copy async/streamed and fire the response only after both backup and primary write complete, but keep the copy operation itself efficient (simple file copy, not JSON re-serialize) | Becomes noticeable once the file is large enough that a synchronous copy meaningfully delays the FCP/response-time budget in the SPEC |
| Running AI classification synchronously in the request/response cycle for every uploaded photo (up to 3 per report) | Slow perceived form response, especially on 4G, working against the "FCP ≤2s" and fast-response requirements | Kick off classification per-image possibly in parallel (not serial) and consider whether the user-facing "show classification immediately" requirement can tolerate a short async reveal rather than blocking full-page response | Becomes painful once 3 images are classified serially against a vision API with real-world latency (seconds per call) |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Serving `waste-reports.json` as a static file / placing it inside a static-serve directory | Full data leak of every report (including notes, which may contain PII from free text) to anyone who guesses/finds the URL | Store the JSON file outside any `express.static` directory; only ever read/write it through application code, never expose a direct route to it (already flagged in SPEC — verify in code review, don't just assume) |
| Rendering `note` / `changed_by` free-text fields directly into dashboard HTML | Stored XSS — a malicious `note` field becomes executable script when any staff member views the dashboard | Escape/sanitize all user-supplied text fields on render (or on save, consistently), treat every free-text field as hostile input by default |
| Storing uploaded images with user-controlled filenames or inside a path built from user input | Path traversal / overwrite of arbitrary files on disk | Always generate the storage filename server-side (UUID), never derive any part of the file path from client-supplied data |
| Not verifying uploaded images are truly re-encoded/flattened images before serving them back to the dashboard | SVG/polyglot files can carry embedded scripts that execute when "viewed" in-browser | Re-encode every accepted upload through `sharp` to a fixed output format (e.g. always re-save as JPEG/WebP) rather than serving the original bytes back |
| Assuming rate limiting is "handled" by the rate-limit requirement alone, with no logging of rejected/abusive requests | Real abuse patterns go unnoticed until the LINE group or AI API bill signals a problem | Log rate-limit rejections and dedup collisions with enough detail (IP, location_id, timestamp) to spot abuse patterns post-launch |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-------------------|
| Blocking form submission while waiting for AI classification of all attached photos | User stares at a spinner on mobile 4G, may abandon the report entirely — directly undermines the "แจ้งจุดขยะได้อย่างรวดเร็ว" core value | Save the report immediately once images are accepted/validated; run classification async and update the record (and dashboard) when it completes, or at minimum classify in parallel rather than serially |
| No feedback distinguishing "duplicate report merged" from "new report created" | User assumes their report was ignored when it silently merges into an existing one via dedup | Show an explicit, friendly message per SPEC ("มีรายการแจ้งอยู่แล้วสำหรับจุดนี้") rather than the generic success message, so users understand what happened |
| Generic error message when QR `location_id` doesn't validate | User has no idea whether the bin is genuinely not in the system, whether they scanned wrong, or whether the QR is fraudulent — they may just give up | Keep the specific SPEC-mandated error ("ไม่พบจุดนี้ในระบบ กรุณาติดต่อเจ้าหน้าที่") and make sure it's visually distinct from validation errors like missing fields, so users know to contact staff rather than retry the form |
| Status shown only as current state, no history/timeline for the reporter (who has no login to check back anyway) | Reporter has no way to know if their report was seen, especially since there's no account to check status against | Not in current scope, but flag for future: even a report-lookup-by-QR-rescan or a shareable report ID could close this loop without requiring login |

## "Looks Done But Isn't" Checklist

- [ ] **Concurrent write safety:** Looks done once single-request testing works — verify with a script firing 10+ simultaneous POSTs and confirm all 10 records persist and the file remains valid JSON afterward.
- [ ] **MIME/file-type validation:** Looks done once `.jpg`/`.png` uploads work — verify by uploading a renamed non-image file (e.g. a `.txt` or `.svg` renamed to `.jpg`) and confirming it's rejected by content inspection, not just accepted because the extension matched.
- [ ] **LINE retry logic:** Looks done once a single notification send works — verify the retry path actually reuses one `X-Line-Retry-Key` across all 3 attempts for the same failed send (not a fresh key each retry), and that "notification failed" is correctly surfaced after all retries are exhausted.
- [ ] **Face-blur:** Looks done once a clear, front-facing test photo gets blurred — verify against messy real-world test photos (background people, angled faces, partial occlusion) and confirm the feature doesn't silently do nothing when detection confidence is low.
- [ ] **AI classification failure path:** Looks done once the happy path returns a label — verify by forcing a timeout/error/malformed response from the classification call and confirming submission still succeeds with `unclassified`, not a blocked form.
- [ ] **QR validation:** Looks done once an unregistered `location_id` shows the error — verify the flow also handles a QR encoding no `location_id` at all, a malformed QR payload, and (as an ops note, not code) that there's a plan for physically auditing deployed codes.
- [ ] **Backup/restore for `waste-reports.json`:** Looks done once a backup file appears after a write — verify the actual fallback path by intentionally corrupting the primary file and confirming the app detects the parse failure and serves from backup with an admin alert, per SPEC.
- [ ] **Rate limiting:** Looks done once one over-limit request gets a 429 — verify the limit resets correctly after the window, applies per-IP as intended, and doesn't accidentally rate-limit the dedup "merge" path (a legitimate repeat report for the same location shouldn't count against the same limit as spam from unrelated locations).

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|-----------------|-----------------|
| Lost report from a race condition | MEDIUM | Add file-lock library, add regression test for concurrent writes; historical lost reports generally cannot be recovered unless logs captured the original payload |
| Duplicate LINE notifications from retry storm | LOW | Add `X-Line-Retry-Key` to the send path; no data recovery needed, just stops future duplicates |
| Corrupted `waste-reports.json` in production | LOW (if backup exists) / HIGH (if not) | Restore from the most recent backup file per SPEC's fallback requirement; if no valid backup exists, this is why the backup-before-write requirement must never be skipped |
| Spam/abuse flood before rate limiting was enforced | MEDIUM | Add rate limiting middleware; manually review and purge obviously fraudulent report entries from the JSON file (scripted cleanup by IP/pattern), notify staff of the incident |
| Unblurred face discovered in a published/notified photo | HIGH (privacy incident) | Immediately remove/reprocess the specific image, tighten blur strength or detection threshold, and treat this as a trigger to add the manual-review fallback if not already present |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|-------------------|----------------|
| Non-atomic JSON writes / lost reports | Report persistence / write-path phase | Concurrent-write load test (10+ simultaneous submissions) passes with no lost/corrupted records |
| MIME spoofing / path traversal on upload | Photo-upload phase | Renamed non-image file upload is rejected; uploaded files are stored under server-generated UUID names only |
| Decompression/pixel-bomb DoS | Photo-upload phase (same as above) | Crafted high-pixel-count small file is rejected or safely bounded, does not spike memory/CPU unbounded |
| LINE duplicate-notification storms | LINE notification integration phase | Simulated network failure during send results in exactly one delivered message after retries, not multiple |
| LINE webhook trust (future) | Not in MVP — flag for any future webhook-adding phase | Signature verification present before any webhook body is processed |
| No-auth spam/DoS on submission endpoint | Report-submission phase | Automated script exceeding 5 requests/hour from one IP is blocked with clear error; legitimate dedup merges are unaffected |
| QR spoofing/cloning | QR flow phase (technical) + rollout/ops notes (physical) | Unregistered `location_id` rejected; ops documentation includes a physical-audit recommendation |
| Face-blur false sense of completeness | Photo-upload/AI-processing phase | Tested against messy real-world photos, not just clean demo faces; documentation avoids over-claiming privacy guarantees |
| AI classification treated as authoritative / blocking | AI classification integration phase | Forced API failure/timeout still results in successful submission with `unclassified`; staff/user override UI exists and works |
| One-way status workflow orphaning reports | Staff dashboard / status-management phase | Confirmation required before terminal status change; status-change history visible via `changed_by`/timestamps |

## Sources

- [Understanding Node.js file locking - LogRocket Blog](https://blog.logrocket.com/understanding-node-js-file-locking/)
- [node-proper-lockfile (GitHub)](https://github.com/alessioalex/node-proper-lockfile)
- [Node.js File Locking: Ensuring Data Integrity with proper-lockfile](https://www.somethingsblog.com/2024/10/22/node-js-file-locking-ensuring-data-integrity-with-proper-lockfile/)
- [File Upload Content Type and MIME Type Bypass Vulnerabilities — Sourcery](https://www.sourcery.ai/vulnerabilities/file-upload-content-type-bypass)
- [Secure API file uploads with magic numbers — Transloadit](https://transloadit.com/devtips/secure-api-file-uploads-with-magic-numbers/)
- [Weak Multer File Name Manipulation — nodejs-security.com](https://www.nodejs-security.com/learn/secure-file-handling/weak-multer-file-name-manipulation)
- [Path Traversal in File Uploads — Xygeni](https://xygeni.io/blog/path-traversal-in-file-uploads-how-developers-create-their-own-exploits/)
- [Node.js + Sharp in 2026: Production Image Processing Guide — HireNodeJS](https://www.hirenodejs.com/blog/nodejs-sharp-image-processing-2026)
- [sharp (official docs)](https://sharp.pixelplumbing.com/)
- [CVE-2022-29256 sharp vulnerability — Acunetix](https://www.acunetix.com/vulnerabilities/sca/cve-2022-29256-vulnerability-in-npm-package-sharp/)
- [Retry failed API requests — LINE Developers](https://developers.line.biz/en/docs/messaging-api/retrying-api-request/)
- [Verify webhook signature — LINE Developers](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/)
- [Messaging API pricing — LINE Developers](https://developers.line.biz/en/docs/messaging-api/pricing/)
- [As of April 23, 2025, rate limit for "Send multicast message" changed — LINE Developers](https://developers.line.biz/en/news/2025/04/23/messaging-api-rate-limit/)
- [Receive messages (webhook) — LINE Developers](https://developers.line.biz/en/docs/messaging-api/receiving-messages/)
- [QR code sticker overlay fraud: how to spot and stop it](https://qrcodekit.com/news/qr-code-sticker-overlay-fraud/)
- [QR Code Security: Risks, Phishing Threats, and Best Practices — Bitly](https://bitly.com/blog/qr-code-security/)
- [Form Submission Rate Limiting: Stop Spam and Abuse](https://splitforms.com/blog/form-submission-rate-limiting)
- [Best practices to prevent email subscription form abuse — AWS re:Post](https://repost.aws/articles/ARcQyJBUbPTYeA63j5g_9usw/best-practices-to-prevent-email-subscription-form-abuse)
- [Blur Faces for Photo Privacy guide — image-toolkit](https://www.image-toolkit.com/guides/blur-faces-for-photo-privacy)
- [How to Blur Faces in Photos for Privacy — Scanly.co](https://scanly.co/blog/how-to-blur-faces-in-photos)
- [LLMs vs Specialised Vision APIs: Image Processing Showdown](https://medium.com/@API4AI/llms-vs-specialised-vision-apis-image-processing-showdown-31d1060c7de5)
- [How to Reduce LLM Hallucinations in 2026: 7 Proven Strategies](https://futureagi.com/blog/taming-hallucination-beast-strategies-reliable-llms/)
- [Is Your Legacy 311 Process Working Against You? — CivicPlus](https://www.civicplus.com/blog/crm/is-your-legacy-311-process-working-against-you/)
- [What is a 311 CRM Solution? — CivicPlus](https://www.civicplus.com/blog/crm/what-is-a-311-and-citizen-request-management-solution/)
- Project SPEC.md and PROJECT.md (Security & AI Ethics, Edge Cases sections) — internal requirements cross-referenced against above external findings

---
*Pitfalls research for: JSON-file-backed campus waste-reporting web app (QR check-in, AI vision classification, LINE notifications, no auth)*
*Researched: 2026-08-18*
