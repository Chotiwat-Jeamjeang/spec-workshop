# Feature Research

**Domain:** Campus facilities/waste issue-reporting — no-login, QR-triggered, AI-assisted (compare to municipal 311 apps, campus CMMS/work-order tools, and "see something say something" civic reporting apps)
**Researched:** 2026-08-18
**Confidence:** MEDIUM (SPEC.md/PROJECT.md are HIGH confidence — they are this project's own committed source of truth; general ecosystem patterns from web search are LOW confidence and used only to sanity-check scope, not as authoritative claims)

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist in any low-friction issue-reporting tool. Missing these makes the product feel broken or untrustworthy. Every item below is already covered by SPEC.md/PROJECT.md — listed here to confirm they match ecosystem norms, not to propose new scope.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Report without creating an account | Every 311/civic app studied (SeeClickFix/CivicPlus, city 311 apps) offers a no-account "guest" path; friction kills adoption for one-off reports | LOW | Already in scope. SPEC explicitly requires no login for both reporters and staff. |
| Photo attachment on report | Universal across 311 and CMMS work-order tools — text-only reports are considered incomplete/unverifiable | LOW-MEDIUM | SPEC requires 1-3 images, MIME-validated, ≤5MB. Matches ecosystem norm (SeeClickFix, SafetyCulture QR issue codes) of "attach photo to show exactly where the problem is." |
| Location context passed automatically | 311 apps use GPS/geofencing; CMMS tools route by location. Forcing users to type location text is a known source of bad data | LOW-MEDIUM | SPEC's QR → `location_id` auto-fill (with dropdown/map fallback, no free-text) is at or above ecosystem standard — most 311 apps still allow free-text address entry, which this project deliberately avoids. |
| Status visibility (submitted → in progress → done) | Every reviewed product (SeeClickFix case tracking, CMMS timestamped status) treats "where is my request now" as core, non-negotiable UX | LOW-MEDIUM | SPEC's one-way status progression (`รอดำเนินการ` → `กำลังดำเนินการ` → `ดำเนินการเสร็จสิ้น`) is simpler than most (no reopen), which is a deliberate, reasonable constraint for a low-stakes reporting flow. |
| Staff notification on new report | CMMS tools push real-time notifications to technicians; 311 platforms route to the right department. Silent inboxes are the #1 cause of abandoned civic-reporting deployments | LOW-MEDIUM | SPEC uses LINE push to a central group within 10s, with retry/backoff — matches or exceeds CMMS "real-time mobile notification" pattern. |
| Duplicate/spam protection at the edges | Ecosystem research on anonymous reporting explicitly flags rate-limiting, dedup, and input sanitization as required baseline for any no-auth public form | LOW-MEDIUM | SPEC has rate limit (5/hr/IP) and dedup-by-location+30min window. This is table stakes specifically *because* the product has no login — without it, anonymous forms are trivially spammable. |
| Mobile-first, fast-loading form | 311/CMMS reporting happens overwhelmingly on phones, often on cellular data outdoors | LOW-MEDIUM | SPEC's FCP ≤2s on 4G + responsive breakpoints (375/768/1024) matches expectation; no product in this category ships a desktop-first flow. |
| Clear "what happens next" feedback after submit | Users who report anonymously have no other way to know their report was received — SeeClickFix/CMMS tools all show an immediate confirmation | LOW | Implicit in SPEC (AI result shown immediately, submit confirmation implied) — worth confirming the confirmation screen explicitly states no further contact will happen (since no account = no follow-up channel to the reporter). |

### Differentiators (Competitive Advantage)

Features that go beyond what a bare-bones 311/CMMS clone would offer, and specifically serve this project's Core Value ("report fast without login; staff always see the most urgent first").

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| AI waste-type classification (general/recyclable/organic/hazardous) from photo | Removes a manual triage step that 311/CMMS tools require a human to do — most CMMS platforms categorize by having the *user* pick from a dropdown; here the photo itself drives it | MEDIUM-HIGH | Already scoped via Claude vision API. Ecosystem research on vision-AI bin monitoring (CNN/ViT models) confirms photo-based classification is state-of-the-art for waste-specific use cases, ahead of manual categorization or ultrasonic-sensor-only approaches. |
| AI urgency scoring from image coverage %, not user self-report | 311 apps rely on the reporter's own severity judgment (or none at all); this computes urgency objectively from the photo, then sorts the queue automatically | MEDIUM-HIGH | Already scoped, with urgency computed app-side from an admin-editable threshold config (not hardcoded, not decided directly by the AI) — this is a stronger design than most reviewed civic tools, which either skip auto-prioritization entirely or bury it in a black-box vendor model. |
| QR-anchored locations only (no free-text address) | Removes the single biggest 311 data-quality problem (bad/ambiguous addresses); every report maps to a real, pre-registered point | LOW-MEDIUM | Differentiator relative to city 311 apps, which mostly still accept free-text or map-pin addresses across an entire city (much harder to pre-register). A bounded campus makes this tractable and higher-precision than the norm. |
| Automatic urgency-based queue sorting for staff | Staff at CMMS/311 shops normally triage manually or by FIFO; here the queue self-prioritizes so the most severe pile-up surfaces first without staff effort | LOW-MEDIUM | Directly serves Core Value. Depends on AI urgency scoring existing first (see dependencies below). |
| Automatic face-blurring before storage | Not seen as a feature in any reviewed 311/CMMS product — this project pre-empts a privacy problem (photos of trash areas incidentally capturing bystanders) that competitors either ignore or would create user complaints/legal exposure over | MEDIUM | A genuine differentiator on privacy/ethics posture, cheap to justify given AI vision is already in the pipeline for classification. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that look tempting for this category of product but would work against a lightweight, no-login, single-purpose reporting tool. None of these are in SPEC scope — listed to explicitly guard against scope creep during requirements/roadmap work.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|------------------|-------------|
| User accounts / login for reporters | 311 platforms that do offer accounts get "track my request history," "get notified when resolved" | Directly contradicts the Core Value (login-free is the whole point); adds auth infra, password/session security surface, and GDPR-style PII handling for a low-stakes anonymous report | Rely on the LINE group + staff dashboard for visibility; no user-facing tracking in v1 (already correctly excluded in PROJECT.md Out of Scope) |
| Free-text address / "type your location" | Faster to build than a QR/dropdown/map constraint; feels more "flexible" | Free-text location is the single largest data-quality failure mode in every 311 app reviewed — leads to unreachable/ambiguous reports staff can't act on | Keep QR auto-fill + constrained dropdown/map-pin selection from pre-registered points only (already in SPEC) |
| Status reopen / undo | Staff will occasionally mis-click a status change and want to revert | One-way status transitions are a deliberate simplicity/audit-trail choice; allowing reopen adds state-machine complexity and ambiguity about "which report is current" | If a status was set in error, staff creates a new report referencing the old one (already the documented SPEC behavior) |
| Per-report public commenting / discussion thread | Seen in some 311 platforms (SeeClickFix has public comment feeds) to build community engagement | For a no-login internal-facing tool (student → facilities staff only), public discussion adds moderation burden and exposes the system to spam/abuse with zero accountability (no accounts to ban) | LINE group already serves as the staff coordination channel; no need for an in-app comment feed |
| Full public dashboard/analytics (report counts, resolution time trends) | Municipal 311 CRMs universally offer trend analytics for planning; feels like an obvious "of course we need this" add | Explicitly deferred in PROJECT.md as a future scalability item — building it now duplicates effort before the core loop (report → notify → resolve) is validated, and analytics needs volume of real data to be meaningful | Ship the core reporting/notification loop first; revisit analytics once there's a few weeks of real report data (already correctly scoped as "future" in PROJECT.md) |
| Per-area assignment / routing to specific staff subgroups | CMMS tools route by skill/location/workload automatically; feels more "efficient" than one shared channel | PROJECT.md explicitly defers this; premature routing logic adds complexity (which area owns which QR point, escalation rules) before there's evidence the single shared LINE group is actually a bottleneck | Single central LINE group notification for all reports (already scoped); revisit only if staff feedback shows the shared channel is noisy |
| CAPTCHA / bot-challenge on the report form | Ecosystem research flags CAPTCHA as a standard anti-spam control for anonymous public forms | For a QR-triggered flow scoped to people physically standing at a real campus location, a CAPTCHA adds friction against the Core Value ("report fast") for a bot threat that's low-probability given the QR-gated entry point | Rely on already-scoped rate limiting (5/hr/IP) + dedup window, which target the realistic abuse case (repeat human spam) without adding friction to legitimate one-off reporters |
| Reporter contact field for follow-up ("leave your phone/email") | Some QR-based issue-reporting tools (e.g., SafetyCulture) collect contact info so staff can follow up with the reporter | Contradicts the explicit no-login/no-PII design goal and the "don't collect unnecessary personal data" AI-ethics constraint in SPEC; also nothing in the workflow currently uses reporter contact (staff act on the report itself, not the reporter) | Keep reports fully anonymous; the optional `note` field is the only reporter-authored context, matching SPEC |

## Feature Dependencies

```
QR Code Scan → location_id lookup
    └──requires──> Pre-registered location list (admin-managed)
                       └──requires──> location_id validation (reject unknown QR)

Photo Upload (1-3 images)
    └──requires──> MIME/magic-byte validation + size limit
    └──requires──> Face-blur pass (before persistence)
                       └──feeds──> AI waste-type classification
                       └──feeds──> AI urgency scoring (coverage % → threshold config)

AI urgency scoring ──enables──> Urgency-sorted staff queue (most urgent first)
                    ──enables──> LINE notification highlighting urgent reports

Report submission ──triggers──> waste-reports.json write (file lock + backup)
                   ──triggers──> LINE push notification (event-based, retry/backoff)
                   ──checked-against──> Dedup key (location_id + 30min window)
                   ──checked-against──> Rate limit (5/hr/IP)

Status change (staff) ──requires──> Report already persisted
                       ──is──> one-way only (no reopen)

Public dashboard/analytics (deferred) ──requires──> Sustained volume of persisted reports
Per-area routing (deferred) ──requires──> Area/zone data model not yet defined
```

### Dependency Notes

- **AI urgency scoring requires face-blur to run first (ordering, not hard dependency):** the pipeline should blur faces before persisting the image, and classification/urgency scoring can run on the blurred or original image — but face-blur must not be skippable, since it's a privacy/ethics constraint, not an optional enhancement.
- **Urgency-sorted queue requires AI urgency scoring to exist first:** sorting logic has nothing to sort on until coverage % and the threshold config are in place. This is a hard phase-ordering constraint — don't build the "urgent reports float to top" UI before the AI scoring pipeline is working (including its `unclassified` fallback path).
- **QR flow requires pre-registered locations to exist first:** you cannot validate `location_id` against a list that doesn't exist yet — the admin location-registration mechanism (however minimal) is a prerequisite for both the QR path and the dropdown/map fallback path.
- **Dedup and rate-limiting are independent of AI features:** they operate on submission metadata (IP, location_id, timestamp), not on image content, so they can be built and tested before the AI classification pipeline is complete.
- **Deferred analytics/routing conflict with nothing in v1** — they're additive future work, not features that need to be designed around now. Building them prematurely (anti-feature list above) would be the actual risk.

## MVP Definition

### Launch With (v1)

Minimum viable product — matches PROJECT.md Active requirements exactly; this is not a new proposal, it's confirmation the SPEC scope is the right MVP cut for this domain.

- [ ] No-login report submission via QR scan or constrained dropdown/map — why essential: this *is* the Core Value; without it there's no product
- [ ] Photo upload (1-3 images, validated) — why essential: AI classification and staff triage both depend on it; text-only reports are considered incomplete in this domain
- [ ] AI waste-type classification with `unclassified` fallback — why essential: differentiator that removes manual staff triage; must not block submission if AI fails
- [ ] AI urgency scoring (coverage % → configurable threshold) — why essential: directly enables the "staff sees most urgent first" half of Core Value
- [ ] Urgency-sorted staff queue with status transitions (one-way) — why essential: the other half of Core Value; without visible prioritization, urgent piles wait as long as trivial ones
- [ ] LINE push notification (event-based, retry/backoff) — why essential: staff won't check a dashboard proactively; push is what makes "fast" real
- [ ] Face-blur before persistence — why essential: non-negotiable privacy/ethics constraint given photos are taken in public campus spaces
- [ ] Rate limiting + dedup — why essential: table stakes the moment there's no login; the form is unspammable-by-accountability otherwise
- [ ] Atomic JSON storage with backup/fallback — why essential: only persistence layer in scope; a corrupted single file with no backup would be a total-data-loss risk

### Add After Validation (v1.x)

Features to add once the core report → notify → resolve loop is proven in real campus use.

- [ ] Reporter-facing confirmation detail beyond "submitted" (e.g., estimated resolution time) — trigger: staff/students ask "did anyone see my report" after v1 ships, once there's real usage feedback
- [ ] Manual override UI for AI classification/urgency (staff correcting AI results) — trigger: `unclassified` rate or AI misclassification rate observed in production is high enough that manual correction becomes a real workflow, not a hypothetical

### Future Consideration (v2+)

Features to defer until the core loop has weeks of real report data and confirmed staff pain points — matches PROJECT.md Out of Scope exactly.

- [ ] Reporting/analytics dashboard (counts, urgency trends, time-to-resolve) — why defer: needs sustained data volume to be meaningful; premature before v1 validates the core loop
- [ ] Per-area staff routing (instead of one shared LINE group) — why defer: adds a zone/ownership data model; only worth it if the single shared channel proves to be a real bottleneck
- [ ] Historical hotspot analysis for collection-round planning — why defer: explicitly a data-driven future feature: requires months of accumulated reports to produce any actionable signal

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| No-login QR/dropdown report submission | HIGH | LOW-MEDIUM | P1 |
| Photo upload with validation | HIGH | LOW-MEDIUM | P1 |
| AI waste-type classification | HIGH | MEDIUM-HIGH | P1 |
| AI urgency scoring + configurable thresholds | HIGH | MEDIUM-HIGH | P1 |
| Urgency-sorted staff queue + status flow | HIGH | LOW-MEDIUM | P1 |
| LINE push notification with retry | HIGH | MEDIUM | P1 |
| Face-blur pipeline | MEDIUM (high ethical/legal value, low visible user value) | MEDIUM | P1 |
| Rate limiting + dedup | MEDIUM (invisible when working, critical when absent) | LOW-MEDIUM | P1 |
| Atomic JSON storage + backup fallback | MEDIUM (invisible until failure) | LOW-MEDIUM | P1 |
| Manual staff override of AI results | MEDIUM | LOW | P2 |
| Reporting/analytics dashboard | MEDIUM | MEDIUM-HIGH | P3 |
| Per-area staff routing | LOW-MEDIUM | MEDIUM | P3 |
| Hotspot/trend analysis | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch (= PROJECT.md Active requirements, all already scoped)
- P2: Should have, add when possible (post-launch iteration based on real usage)
- P3: Nice to have, future consideration (= PROJECT.md Out of Scope)

## Competitor Feature Analysis

| Feature | 311 municipal apps (SeeClickFix/CivicPlus, city 311) | Campus CMMS work-order tools (UpKeep, eWorkOrders, FlowPath) | Our Approach |
|---------|--------------------------------------------------------|----------------------------------------------------------------|--------------|
| Account requirement | Optional — guest submission allowed, account adds tracking | Usually tied to institutional SSO/email for staff-facing requests | Fully no-login for both reporters and staff (stricter than both) |
| Location capture | GPS/geofence or free-text address within city bounds | Building/room picker, often free text for detail | QR-bound `location_id` only, or constrained dropdown/map — no free text (stricter, higher precision) |
| Photo attachment | Yes, geotagged | Yes, "attach a photo to show exactly where the problem is" | Yes, 1-3 images, MIME-validated, ≤5MB — matches norm |
| Categorization | User selects category from list | Auto-routed by category/location/skill after submission | AI-inferred from photo instead of user-selected — ahead of both patterns |
| Prioritization | Rarely automated; mostly FIFO or manual triage | Workflow-based auto-assignment, not severity-based | AI-computed urgency from image coverage %, admin-tunable threshold — differentiator |
| Notification to staff | Case management inbox, sometimes email/SMS | Real-time mobile push to assigned technician | LINE push to shared group within 10s, retry/backoff — matches CMMS responsiveness bar without the SSO/account overhead |
| Status tracking | Full lifecycle incl. reopen, public status page | Timestamped, visible to requester (if account exists) | Simple 3-stage one-way flow, staff-visible only (no reporter-facing tracking in v1) — intentionally leaner |
| Privacy handling (photos) | Not typically addressed | Not typically addressed | Automatic face-blur before storage — clear differentiator, no competitor reviewed does this |
| Spam/abuse control | Rate limits, CAPTCHA, IP logging (general anonymous-reporting best practice) | N/A (mostly authenticated users) | Rate limit (5/hr/IP) + dedup window, no CAPTCHA — deliberately lighter-touch given QR-gated physical presence |

## Sources

- [What is a 311 CRM Solution? — CivicPlus](https://www.civicplus.com/blog/crm/what-is-a-311-and-citizen-request-management-solution/) — LOW confidence (vendor content, general web search)
- [CivicPlus SeeClickFix 311 CRM](https://seeclickfix.com/pages/311-app.html) — LOW confidence (vendor content)
- [Report an Issue to Your City — CivicPlus Help](https://www.civicplus.help/seeclickfix/docs/report-an-issue-to-my-city) — LOW confidence
- [311 Mobile App for Easy Issue Reporting — Civita](https://www.civitaapp.com/311-mobile-app-for-easy-issue-reporting/) — LOW confidence
- [MyLA311 — City of Los Angeles](https://lacity.gov/myla311) — LOW confidence (municipal source, but summarized via search)
- [eWorkOrders — Universities Facilities Maintenance](https://eworkorders.com/educational-facilities-maintenance-management-system-cmms/) — LOW confidence (vendor content)
- [FlowPath — CMMS for Higher Education](https://www.getflowpath.com/facility-management-software-for-higher-education) — LOW confidence (vendor content)
- [UpKeep — Maintenance Software for Schools & Higher Education](https://upkeep.com/maintenance-software-for/schools-higher-education/) — LOW confidence (vendor content)
- [SafetyCulture — Create/Report issue QR codes](https://help.safetyculture.com/000165) / [Report issues via issue QR codes](https://help.safetyculture.com/001617) — LOW confidence (vendor docs, but directly analogous QR-triggered no-login pattern)
- [CamThink AI — Waste Bin Monitoring System](https://www.camthink.ai/blog/smart-waste-monitoring-edge-ai/) — LOW confidence (vendor content)
- [Frontiers — Vision transformers for garbage bin fullness detection](https://www.frontiersin.org/journals/artificial-intelligence/articles/10.3389/frai.2025.1612080/full) — MEDIUM confidence (peer-reviewed journal, accessed via web search summary)
- [Artificial intelligence for waste management in smart cities: a review — PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC10169138/) — MEDIUM confidence (peer-reviewed review article)
- General web search on anonymous/no-login reporting abuse patterns (spam.org, eSafety Commissioner, PEN America) — LOW confidence, used only to confirm rate-limiting/dedup as expected baseline controls
- **Project's own SPEC.md and PROJECT.md** — HIGH confidence (authoritative source of truth for this project's committed v1 scope; all table-stakes/differentiator/anti-feature judgments above are anchored to these documents)

---
*Feature research for: Campus waste-reporting, no-login QR-triggered AI-assisted issue reporting*
*Researched: 2026-08-18*
