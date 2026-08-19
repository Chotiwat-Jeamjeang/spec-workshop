const crypto = require('crypto');

/**
 * Reads QR_SIGNING_SECRET at call time (not module load time) so require()
 * order never matters for tests, while still failing loudly and by name
 * when the secret is missing.
 * @returns {string}
 */
function getSecret() {
  const secret = process.env.QR_SIGNING_SECRET;
  if (!secret) {
    throw new Error('QR_SIGNING_SECRET is not set — see .env.example');
  }
  return secret;
}

/**
 * Deterministic HMAC-SHA256 over locationId, truncated to 16 bytes
 * (128 bits), hex-encoded (32 hex characters).
 * @param {string} locationId
 * @returns {string}
 */
function signLocationId(locationId) {
  return crypto.createHmac('sha256', getSecret()).update(locationId).digest('hex').slice(0, 32);
}

/**
 * Constant-time verification. Never throws on malformed/garbage input —
 * always returns false instead.
 * @param {string} locationId
 * @param {unknown} providedSig
 * @returns {boolean}
 */
function verifyLocationSignature(locationId, providedSig) {
  // Buffer.from(str, 'hex') silently truncates malformed hex instead of
  // throwing, so the length guard must happen before any decoding.
  if (typeof providedSig !== 'string' || providedSig.length !== 32) return false;

  const expected = signLocationId(locationId);
  const expectedBuf = Buffer.from(expected, 'hex');
  const providedBuf = Buffer.from(providedSig, 'hex');

  // crypto.timingSafeEqual throws RangeError on length-mismatched buffers —
  // guard before calling it, never after.
  if (expectedBuf.length !== providedBuf.length) return false;

  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

module.exports = { signLocationId, verifyLocationSignature };
