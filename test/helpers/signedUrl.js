// Ensures a deterministic QR_SIGNING_SECRET exists before any test requires
// qrSignature.js or index.js — never overwrites a real secret from a
// developer's local .env, so a fresh clone with no .env still runs green.
if (!process.env.QR_SIGNING_SECRET) {
  process.env.QR_SIGNING_SECRET = 'test-only-deterministic-signing-secret-32bytes';
}

const { signLocationId } = require('../../src/services/qrSignature');

/**
 * Builds a `/report` URL signed exactly as a real QR sticker would be.
 * @param {string} locationId
 * @returns {string}
 */
function signedReportUrl(locationId) {
  const sig = signLocationId(locationId);
  return `/report?location_id=${encodeURIComponent(locationId)}&sig=${sig}`;
}

module.exports = { signedReportUrl };
