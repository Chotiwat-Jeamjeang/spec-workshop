// Seeds QR_SIGNING_SECRET deterministically before anything else reads it —
// must be required first, matching the convention test/report.test.js
// already established.
require('./helpers/signedUrl');

const { test } = require('node:test');
const assert = require('node:assert');

const { signLocationId, verifyLocationSignature } = require('../src/services/qrSignature');
const locationStore = require('../src/services/locationStore');

const BASE_URL = 'http://localhost:3000';

/**
 * Reproduces scripts/generate-qr.js's URL construction rule exactly:
 * base URL + /report + percent-encoded location_id + sig.
 * @param {string} locationId
 * @returns {URL}
 */
function mintedUrl(locationId) {
  const sig = signLocationId(locationId);
  return new URL(`${BASE_URL}/report?location_id=${encodeURIComponent(locationId)}&sig=${sig}`);
}

test('every minted URL parses and verifies for its own location', () => {
  const all = locationStore.getAll();

  all.forEach((record) => {
    const url = mintedUrl(record.location_id);
    const decodedId = url.searchParams.get('location_id');
    const sig = url.searchParams.get('sig');

    assert.strictEqual(decodedId, record.location_id, `decoded location_id should round-trip exactly for ${record.location_id}`);
    assert.strictEqual(verifyLocationSignature(decodedId, sig), true, `minted URL should verify for ${record.location_id}`);
  });
});

test('no minted signature cross-validates another location', () => {
  const all = locationStore.getAll();

  all.forEach((a) => {
    all.forEach((b) => {
      if (a.location_id === b.location_id) return;

      const sigForB = signLocationId(b.location_id);
      assert.strictEqual(
        verifyLocationSignature(a.location_id, sigForB),
        false,
        `signature minted for ${b.location_id} must not validate ${a.location_id}`
      );
    });
  });
});

test('signLocationId is deterministic — same id yields the same signature on repeated calls', () => {
  const all = locationStore.getAll();

  all.forEach((record) => {
    const first = signLocationId(record.location_id);
    const second = signLocationId(record.location_id);
    assert.strictEqual(first, second, `repeated signing of ${record.location_id} should be identical`);
  });
});

test('every minted sig is exactly 32 lowercase hex characters', () => {
  const all = locationStore.getAll();

  all.forEach((record) => {
    const sig = signLocationId(record.location_id);
    assert.strictEqual(sig.length, 32, `sig for ${record.location_id} should be 32 characters`);
    assert.match(sig, /^[0-9a-f]{32}$/, `sig for ${record.location_id} should be lowercase hex`);
  });
});
