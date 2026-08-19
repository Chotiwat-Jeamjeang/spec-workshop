const express = require('express');
const locationStore = require('../services/locationStore');
const qrSignature = require('../services/qrSignature');

const INVALID_QR_MESSAGE = 'ไม่พบจุดนี้ในระบบ กรุณาติดต่อเจ้าหน้าที่';

const router = express.Router();

router.get('/report', (req, res) => {
  const { location_id: locationId, sig } = req.query;

  // Absent entirely (no query string / no location_id key at all) -> manual
  // dropdown entry path. No QR behind it, so registry membership is the
  // only meaningful constraint -- never require/check a signature here.
  // Branch on presence of the key, not truthiness of its value: an empty
  // string (`?location_id=`) is a malformed QR payload, not "absent".
  if (locationId === undefined) {
    return res.render('report', {
      mode: 'dropdown',
      locations: locationStore.getAll(),
      locked: null,
      message: null,
    });
  }

  const known = locationId ? locationStore.findById(locationId) : undefined;
  const sigOk = locationId ? qrSignature.verifyLocationSignature(locationId, sig) : false;

  if (locationId && sigOk && known) {
    return res.render('report', {
      mode: 'locked',
      locked: known,
      // The exact sig that was just verified for this request -- carried
      // into the page as a data attribute (plan 01-06 Task 2) so the CTA
      // can submit it without ever re-parsing window.location.
      lockedSig: sig,
      // Passed even in locked mode -- the "ไม่ใช่จุดนี้" control (plan 01-05)
      // needs the options already present in this same HTML response.
      locations: locationStore.getAll(),
      message: null,
    });
  }

  // Consolidated failure branch: every QR-path failure reason (unregistered
  // id, tampered/mismatched signature, missing sig, empty id) funnels into
  // this single response with exactly one message string -- never a
  // per-reason variant, so a probe can't distinguish which check failed.
  // The specific reason is logged server-side only, never in the body.
  if (!locationId) {
    console.error('[GET /report] rejected: empty location_id');
  } else if (!known) {
    console.error(`[GET /report] rejected: unknown location_id "${locationId}"`);
  } else if (!sigOk) {
    console.error(`[GET /report] rejected: invalid signature for location_id "${locationId}"`);
  }

  return res.status(400).render('report', {
    mode: 'error',
    message: INVALID_QR_MESSAGE,
    locations: locationStore.getAll(),
    locked: null,
  });
});

router.get('/api/locations', (req, res) => {
  // Explicit projection to {location_id, name} only -- lat/lng never leave
  // the server, regardless of what locationStore records carry.
  res.json(locationStore.getAll().map(({ location_id, name }) => ({ location_id, name })));
});

const MISSING_LOCATION_MESSAGE = 'กรุณาเลือกจุดที่แจ้ง';
const NOTE_TOO_LONG_MESSAGE = 'รายละเอียดยาวเกินไป (ไม่เกิน 500 ตัวอักษร)';
const NOTE_MAX_LENGTH = 500;

// POST /api/waste-reports/validate -- independent server-side re-verification
// of SUBM-02 (QR signature + registry membership) and SUBM-03 (note length).
//
// This handler writes nothing: no file is created, appended to, or read
// beyond config/locations.json via locationStore; no report id is minted.
// Persistence is Phase 3 (STORE-01), explicitly out of this phase's
// boundary. It also never rate-limits or dedups -- that is Phase 6.
//
// Critically, this re-runs verifyLocationSignature/findById on the values
// actually submitted here, independent of whatever GET /report may have
// rendered earlier -- a prior successful GET is a different request and
// proves nothing about this one (RESEARCH.md Anti-Patterns).
router.post('/api/waste-reports/validate', (req, res) => {
  const body = req.body || {};
  const locationId = typeof body.location_id === 'string' ? body.location_id : undefined;
  const { sig, note } = body;

  if (!locationId) {
    return res.status(400).json({ error: MISSING_LOCATION_MESSAGE });
  }

  const known = locationStore.findById(locationId);
  if (!known) {
    return res.status(400).json({ error: INVALID_QR_MESSAGE });
  }

  // A submitted sig must verify -- re-run the check here rather than
  // trusting anything about an earlier GET. A submission with no sig at
  // all is the dropdown path and is judged on registry membership alone
  // (the two structurally separate trust levels established in 01-02).
  if (sig !== undefined && !qrSignature.verifyLocationSignature(locationId, sig)) {
    return res.status(400).json({ error: INVALID_QR_MESSAGE });
  }

  // note is optional; absent/null/empty all pass. Measured with .length
  // (UTF-16 code units), never Buffer.byteLength -- Thai script averages 3
  // UTF-8 bytes per code point, so a byte-derived limit would silently cap
  // Thai notes at roughly a third of the stated 500-character limit and
  // disagree with the browser's own maxlength measure.
  if (note !== undefined && note !== null) {
    if (typeof note !== 'string' || note.length > NOTE_MAX_LENGTH) {
      return res.status(400).json({ error: NOTE_TOO_LONG_MESSAGE });
    }
  }

  return res.status(200).json({
    valid: true,
    location_id: known.location_id,
    name: known.name,
  });
});

module.exports = router;
