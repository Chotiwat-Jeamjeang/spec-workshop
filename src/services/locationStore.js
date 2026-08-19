const fs = require('fs');
const path = require('path');

const LOCATIONS_PATH = path.join(__dirname, '..', '..', 'config', 'locations.json');

/**
 * Reads config/locations.json at request time (no caching, matching the
 * existing config-read convention). Strips a leading UTF-8 byte-order mark
 * before parsing — D-03 hands this file to a non-developer to hand-edit,
 * and a Windows editor that writes a BOM would otherwise make JSON.parse
 * throw "Unexpected token".
 * @returns {Array<{location_id: string, name: string, lat: number, lng: number}>}
 */
function getAll() {
  let raw;
  try {
    raw = fs.readFileSync(LOCATIONS_PATH, 'utf8');
  } catch (err) {
    err.message = `Failed to read location registry at ${LOCATIONS_PATH}: ${err.message}`;
    throw err;
  }

  const stripped = raw.replace(/^﻿/, '');

  try {
    return JSON.parse(stripped);
  } catch (err) {
    err.message = `Failed to parse location registry at ${LOCATIONS_PATH}: ${err.message}`;
    throw err;
  }
}

/**
 * Exact === match on location_id — no case-folding, no trimming, no
 * normalization. location_id is a URL-contract token that must round-trip
 * byte-identically through the QR.
 * @param {string} locationId
 * @returns {{location_id: string, name: string, lat: number, lng: number}|undefined}
 */
function findById(locationId) {
  return getAll().find((record) => record.location_id === locationId);
}

module.exports = { getAll, findById };
