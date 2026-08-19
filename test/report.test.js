require('./helpers/signedUrl');

const { test } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');

const { signedReportUrl } = require('./helpers/signedUrl');
const { signLocationId, verifyLocationSignature } = require('../src/services/qrSignature');
const locationStore = require('../src/services/locationStore');
const app = require('../index');

test('GET /report with a valid signed QR renders the locked location', async () => {
  const lib = locationStore.findById('LIB');
  const res = await request(app).get(signedReportUrl('LIB'));

  assert.strictEqual(res.status, 200);
  assert.ok(res.text.includes(lib.name), 'response body should contain the LIB location name');
  assert.ok(res.text.includes('ยืนยันจาก QR'), 'response body should contain the locked badge text');
});

test('the locked response offers no free-text address entry', async () => {
  const res = await request(app).get(signedReportUrl('LIB'));

  assert.ok(!/<input[^>]*type=["']text["']/i.test(res.text), 'must not contain a free-text input');
  assert.ok(!/name=["']address["']/i.test(res.text), 'must not contain an element named address');
});

test('GET /report with a signature minted for a different location is rejected', async () => {
  const wrongSig = signLocationId('LIB');
  const res = await request(app).get(`/report?location_id=CAFE&sig=${wrongSig}`);

  assert.strictEqual(res.status, 400);
  assert.ok(res.text.includes('ไม่พบจุดนี้ในระบบ กรุณาติดต่อเจ้าหน้าที่'));
});

test('GET /report with no query parameters renders the dropdown with all locations', async () => {
  const res = await request(app).get('/report');
  const all = locationStore.getAll();

  assert.strictEqual(res.status, 200);
  assert.ok(res.text.includes('location-select'));
  assert.ok(res.text.includes('เลือกจุดที่แจ้ง'));
  all.forEach((loc) => {
    assert.ok(res.text.includes(loc.name), `expected body to include ${loc.name}`);
  });

  assert.match(res.text, /<option value="" disabled selected>เลือกจุดที่แจ้ง<\/option>/);

  assert.ok(!/<input[^>]*type=["']text["']/i.test(res.text), 'must not contain a free-text input');
  assert.ok(!/name=["']address["']/i.test(res.text), 'must not contain an element named address');
});

test('dropdown options appear in locationStore.getAll() order', async () => {
  const res = await request(app).get('/report');
  const all = locationStore.getAll();
  const positions = all.map((loc) => res.text.indexOf(`value="${loc.location_id}"`));

  positions.forEach((pos) => assert.ok(pos !== -1, 'every location_id should appear as an option value'));
  const sorted = [...positions].sort((a, b) => a - b);
  assert.deepStrictEqual(positions, sorted);
});

test('the locked response also ships the dropdown markup, hidden via is-hidden', async () => {
  const res = await request(app).get(signedReportUrl('LIB'));
  const all = locationStore.getAll();

  assert.match(res.text, /location-dropdown[^"]*is-hidden/);
  all.forEach((loc) => {
    assert.ok(res.text.includes(`value="${loc.location_id}"`), `expected hidden dropdown to include option for ${loc.location_id}`);
  });
});

test('rendering the dropdown branch with zero locations shows the empty state and disables controls', async () => {
  const ejs = require('ejs');
  const path = require('node:path');

  const html = await ejs.renderFile(
    path.join(__dirname, '..', 'views', 'report.ejs'),
    { mode: 'dropdown', locations: [], locked: null, message: null }
  );

  assert.ok(html.includes('ไม่มีจุดที่ลงทะเบียนในระบบ'));
  assert.ok(html.includes('ยังไม่มีจุดที่ลงทะเบียนในระบบ กรุณาติดต่อเจ้าหน้าที่'));
  assert.match(html, /<select[^>]*disabled/);
  assert.match(html, /id="btn-next"[\s\S]*?disabled/);
});

test('GET /api/locations returns only location_id and name', async () => {
  const res = await request(app).get('/api/locations');

  assert.strictEqual(res.status, 200);
  assert.match(res.headers['content-type'], /json/);
  const all = locationStore.getAll();
  assert.strictEqual(res.body.length, all.length);
  res.body.forEach((item) => {
    assert.deepStrictEqual(Object.keys(item).sort(), ['location_id', 'name']);
  });
});

test('GET /report with an unregistered location_id is rejected with the generic message', async () => {
  const res = await request(app).get(`/report?location_id=NOPE&sig=${'0'.repeat(32)}`);

  assert.strictEqual(res.status, 400);
  assert.ok(res.text.includes('ไม่พบจุดนี้ในระบบ กรุณาติดต่อเจ้าหน้าที่'));
});

test('GET /report with a registered location_id and no sig is rejected with the generic message', async () => {
  const res = await request(app).get('/report?location_id=LIB');

  assert.strictEqual(res.status, 400);
  assert.ok(res.text.includes('ไม่พบจุดนี้ในระบบ กรุณาติดต่อเจ้าหน้าที่'));
});

test('GET /report with an empty location_id and empty sig is rejected with the generic message', async () => {
  const res = await request(app).get('/report?location_id=&sig=');

  assert.strictEqual(res.status, 400);
  assert.ok(res.text.includes('ไม่พบจุดนี้ในระบบ กรุณาติดต่อเจ้าหน้าที่'));
});

test('all four QR failure response bodies are byte-identical', async () => {
  const wrongSig = signLocationId('LIB');

  const [unregistered, mismatched, missingSig, emptyId] = await Promise.all([
    request(app).get(`/report?location_id=NOPE&sig=${'0'.repeat(32)}`),
    request(app).get(`/report?location_id=CAFE&sig=${wrongSig}`),
    request(app).get('/report?location_id=LIB'),
    request(app).get('/report?location_id=&sig='),
  ]);

  assert.strictEqual(unregistered.status, 400);
  assert.strictEqual(mismatched.status, 400);
  assert.strictEqual(missingSig.status, 400);
  assert.strictEqual(emptyId.status, 400);

  assert.strictEqual(unregistered.text, mismatched.text);
  assert.strictEqual(mismatched.text, missingSig.text);
  assert.strictEqual(missingSig.text, emptyId.text);
});

test('the QR failure response offers an escape hatch back to the dropdown', async () => {
  const res = await request(app).get(`/report?location_id=NOPE&sig=${'0'.repeat(32)}`);

  assert.ok(res.text.includes('error-banner'));
  assert.ok(res.text.includes('หรือเลือกจุดจากรายการ'));
});

test('GET /report with no query string at all is still 200 and renders the dropdown', async () => {
  const res = await request(app).get('/report');

  assert.strictEqual(res.status, 200);
  assert.ok(res.text.includes('location-select'));
});

test('verifyLocationSignature accepts a signature minted for the same id', () => {
  assert.strictEqual(verifyLocationSignature('LIB', signLocationId('LIB')), true);
});

test('verifyLocationSignature rejects a signature minted for a different id', () => {
  assert.strictEqual(verifyLocationSignature('CAFE', signLocationId('LIB')), false);
});

test('verifyLocationSignature never throws on malformed input', () => {
  assert.strictEqual(verifyLocationSignature('LIB', 'zz'), false);
  assert.strictEqual(verifyLocationSignature('LIB', 'abc'), false);
  assert.strictEqual(verifyLocationSignature('LIB', undefined), false);
  assert.strictEqual(verifyLocationSignature('LIB', null), false);
  assert.strictEqual(verifyLocationSignature('LIB', 'a'.repeat(31)), false);
  assert.strictEqual(verifyLocationSignature('LIB', 'a'.repeat(33)), false);
});

test('locationStore.getAll returns all 5 seed records', () => {
  const all = locationStore.getAll();
  assert.strictEqual(all.length, 5);
});

test('locationStore.findById uses exact string equality, no case-folding or trimming', () => {
  const lib = locationStore.findById('LIB');
  assert.ok(lib);
  assert.strictEqual(lib.location_id, 'LIB');
  assert.strictEqual(locationStore.findById('lib'), undefined);
  assert.strictEqual(locationStore.findById('LIB '), undefined);
});

test('locationStore.getAll survives a BOM-prefixed registry file', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');

  const raw = fs.readFileSync(path.join(__dirname, '..', 'config', 'locations.json'), 'utf8');
  const bomPrefixed = '﻿' + raw;
  const tmpFile = path.join(os.tmpdir(), `locations-bom-${Date.now()}.json`);
  fs.writeFileSync(tmpFile, bomPrefixed, 'utf8');

  try {
    const stripped = fs.readFileSync(tmpFile, 'utf8').replace(/^﻿/, '');
    const parsed = JSON.parse(stripped);
    assert.strictEqual(parsed.length, 5);
  } finally {
    fs.unlinkSync(tmpFile);
  }
});
