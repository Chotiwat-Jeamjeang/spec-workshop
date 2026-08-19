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
      // Passed even in locked mode -- the "ไม่ใช่จุดนี้" control (plan 01-05)
      // needs the options already present in this same HTML response.
      locations: locationStore.getAll(),
      message: null,
    });
  }

  // Single generic message for every failure reason (missing param, unknown
  // id, bad/mismatched signature) -- never reveal which one it was. Log the
  // specific reason server-side only. Consolidated into a rendered error
  // state with an escape hatch in Task 2 of this plan.
  if (!locationId) {
    console.warn('[GET /report] rejected: location_id missing or empty from query');
  } else if (!known) {
    console.warn(`[GET /report] rejected: unknown location_id "${locationId}"`);
  } else if (!sigOk) {
    console.warn(`[GET /report] rejected: invalid signature for location_id "${locationId}"`);
  }

  return res.status(400).send(INVALID_QR_MESSAGE);
});

router.get('/api/locations', (req, res) => {
  // Explicit projection to {location_id, name} only -- lat/lng never leave
  // the server, regardless of what locationStore records carry.
  res.json(locationStore.getAll().map(({ location_id, name }) => ({ location_id, name })));
});

module.exports = router;
