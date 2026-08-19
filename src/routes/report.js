const express = require('express');
const locationStore = require('../services/locationStore');
const qrSignature = require('../services/qrSignature');

const INVALID_QR_MESSAGE = 'ไม่พบจุดนี้ในระบบ กรุณาติดต่อเจ้าหน้าที่';

const router = express.Router();

router.get('/report', (req, res) => {
  const { location_id: locationId, sig } = req.query;

  const known = locationId ? locationStore.findById(locationId) : undefined;
  const sigOk = locationId ? qrSignature.verifyLocationSignature(locationId, sig) : false;

  if (locationId && sigOk && known) {
    return res.render('report', {
      mode: 'locked',
      locked: known,
      // Passed even in locked mode — the "ไม่ใช่จุดนี้" control (plan 01-05)
      // needs the options already present in this same HTML response.
      locations: locationStore.getAll(),
      message: null,
    });
  }

  // Single generic message for every failure reason (missing param, unknown
  // id, bad/mismatched signature) — never reveal which one it was. Log the
  // specific reason server-side only.
  if (!locationId) {
    console.warn('[GET /report] rejected: location_id missing from query');
  } else if (!known) {
    console.warn(`[GET /report] rejected: unknown location_id "${locationId}"`);
  } else if (!sigOk) {
    console.warn(`[GET /report] rejected: invalid signature for location_id "${locationId}"`);
  }

  return res.status(400).send(INVALID_QR_MESSAGE);
});

module.exports = router;
