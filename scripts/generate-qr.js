// Ops CLI — run with: node scripts/generate-qr.js
//
// Reads the registered locations from config/locations.json (via
// locationStore.getAll(), so the BOM-strip and path resolution stay in one
// place), signs each location_id with the same HMAC-SHA256 secret the
// server verifies against, and writes one scannable QR PNG per location
// into the gitignored qr-output/ directory.
//
// This is a dev/ops-time action only — no HTTP route triggers it, and it
// must never gain one. Registering a signed QR-mint endpoint would let
// anyone forge a valid QR for any location_id, defeating the entire
// anti-forgery point of the signed-URL scheme.
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { signLocationId } = require('../src/services/qrSignature');
const locationStore = require('../src/services/locationStore');

const BASE_URL = process.env.QR_BASE_URL || 'http://localhost:3000';
const OUT_DIR = path.join(__dirname, '..', 'qr-output');

async function main() {
  const locations = locationStore.getAll();

  if (!locations || locations.length === 0) {
    console.error('No registered locations found in config/locations.json — nothing to generate.');
    process.exitCode = 1;
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const loc of locations) {
    const sig = signLocationId(loc.location_id);
    const url = `${BASE_URL}/report?location_id=${encodeURIComponent(loc.location_id)}&sig=${sig}`;
    const file = path.join(OUT_DIR, `${loc.location_id}.png`);

    try {
      // errorCorrectionLevel 'H' recovers ~30% of a damaged symbol — the
      // right choice for outdoor, high-wear campus signage (rain, scuffing,
      // sticker peel).
      await QRCode.toFile(file, url, { errorCorrectionLevel: 'H', width: 400, margin: 2 });
    } catch (err) {
      console.error(`Failed to write QR for ${loc.location_id}: ${err.message}`);
      process.exitCode = 1;
      return;
    }

    console.log(`${loc.location_id} -> ${file}\n  ${url}`);
  }
}

main().catch((err) => {
  console.error(`generate-qr failed: ${err.message}`);
  process.exitCode = 1;
});
