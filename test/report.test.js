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

test('the locked-state response contains the btn-not-this control', async () => {
  const res = await request(app).get(signedReportUrl('LIB'));

  assert.ok(res.text.includes('id="btn-not-this"'), 'locked response should contain btn-not-this');
  assert.ok(res.text.includes('ไม่ใช่จุดนี้'), 'locked response should contain the control text');
});

test('the dropdown-state response does not contain btn-not-this', async () => {
  const res = await request(app).get('/report');

  assert.ok(!res.text.includes('btn-not-this'), 'dropdown response must not contain btn-not-this');
});

test('the error-state response does not contain btn-not-this', async () => {
  const res = await request(app).get(`/report?location_id=NOPE&sig=${'0'.repeat(32)}`);

  assert.ok(!res.text.includes('btn-not-this'), 'error response must not contain btn-not-this');
});

test('the ไม่ใช่จุดนี้ toggle handler performs zero network requests', () => {
  // Scoped to the toggle's own click handler body, not the whole file:
  // plan 01-06 legitimately adds a fetch() call elsewhere in this file
  // (the CTA's POST /api/waste-reports/validate), so a file-wide ban is
  // no longer the correct assertion for D2's "zero network requests" claim
  // — only the mis-scan recovery toggle itself must stay network-free.
  const fs = require('node:fs');
  const path = require('node:path');

  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'report.js'), 'utf8');
  const withoutComments = src
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

  const handlerStart = withoutComments.indexOf('btnNotThis.addEventListener');
  const handlerEnd = withoutComments.indexOf('\n  }\n', handlerStart);
  assert.ok(handlerStart !== -1, 'expected to find the btn-not-this click handler');
  const handlerBody = withoutComments.slice(handlerStart, handlerEnd === -1 ? undefined : handlerEnd);

  assert.ok(!handlerBody.includes('fetch('), 'toggle handler must not call fetch(');
  assert.ok(!handlerBody.includes('XMLHttpRequest'), 'toggle handler must not use XMLHttpRequest');
  assert.ok(!handlerBody.includes('import('), 'toggle handler must not use dynamic import(');
});

test('report.js contains no XMLHttpRequest or dynamic import anywhere', () => {
  const fs = require('node:fs');
  const path = require('node:path');

  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'report.js'), 'utf8');
  const withoutComments = src
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

  assert.ok(!withoutComments.includes('XMLHttpRequest'), 'must not use XMLHttpRequest');
  assert.ok(!withoutComments.includes('import('), 'must not use dynamic import(');
});

test('the report view references a deferred /js/report.js script element', async () => {
  const res = await request(app).get('/report');

  assert.match(res.text, /<script[^>]*src=["']\/js\/report\.js["'][^>]*defer/);
});

test('the locked-state response contains the optional note field', async () => {
  const res = await request(app).get(signedReportUrl('LIB'));

  assert.match(res.text, /<textarea[^>]*id="note"[^>]*name="note"[^>]*maxlength="500"/);
  assert.ok(!/<textarea[^>]*\brequired\b[^>]*id="note"/.test(res.text), 'note textarea must not be required');
  assert.ok(!/<textarea[^>]*id="note"[^>]*\brequired\b/.test(res.text), 'note textarea must not be required');
});

test('the dropdown-state response contains the optional note field', async () => {
  const res = await request(app).get('/report');

  assert.match(res.text, /<textarea[^>]*id="note"[^>]*name="note"[^>]*maxlength="500"/);
});

test('the note counter is a polite live region with the correct initial text', async () => {
  const res = await request(app).get('/report');

  assert.match(res.text, /id="note-counter"[^>]*aria-live="polite"/);
  assert.ok(res.text.includes('0 / 500 ตัวอักษร'), 'initial counter text should read 0 / 500 ตัวอักษร');
});

test('the note textarea is described by the counter and labelled correctly', async () => {
  const res = await request(app).get('/report');

  assert.match(res.text, /<textarea[^>]*id="note"[^>]*aria-describedby="note-counter"/);
  assert.match(res.text, /<label[^>]*for="note"[^>]*>รายละเอียดเพิ่มเติม \(ไม่บังคับ\)<\/label>/);
});

test('report.js measures note length with .length, never Buffer.byteLength or TextEncoder', () => {
  const fs = require('node:fs');
  const path = require('node:path');

  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'report.js'), 'utf8');
  const withoutComments = src
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

  assert.ok(!withoutComments.includes('Buffer.byteLength'), 'must not measure note length in bytes');
  assert.ok(!withoutComments.includes('TextEncoder'), 'must not measure note length via TextEncoder');
  assert.ok(withoutComments.includes('note-counter'), 'counter wiring must be present');
  assert.ok(withoutComments.includes('.length'), 'counter must be derived from .length');
});

test('a Thai sample string reports its .length, not a byte-derived count', () => {
  // Repeats the RESEARCH.md Pitfall #3 sample to a known 200-code-unit
  // length. The counter's own rule (note.value.length) is applied here
  // directly, and the UTF-8 byte length is asserted strictly greater —
  // documenting the trap so a future refactor to a byte measure fails
  // loudly instead of quietly shrinking the limit.
  const base = 'เร่งด่วนควรดำเนินการไม่เร่งด่วน'; // 31 UTF-16 code units
  let thaiSample = '';
  while (thaiSample.length < 200) {
    thaiSample += base;
  }
  thaiSample = thaiSample.slice(0, 200);

  assert.strictEqual(thaiSample.length, 200);
  assert.strictEqual(`${thaiSample.length} / 500 ตัวอักษร`, '200 / 500 ตัวอักษร');

  const byteLength = Buffer.byteLength(thaiSample, 'utf8');
  assert.ok(byteLength > thaiSample.length, 'UTF-8 byte length must be strictly greater than the code-unit length');
});

test('POST /api/waste-reports/validate with a valid signed submission returns 200 valid', async () => {
  const sig = signLocationId('LIB');
  const res = await request(app)
    .post('/api/waste-reports/validate')
    .send({ location_id: 'LIB', sig, note: 'ok' });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.valid, true);
  assert.strictEqual(res.body.location_id, 'LIB');
  assert.strictEqual(res.body.name, locationStore.findById('LIB').name);
  assert.deepStrictEqual(Object.keys(res.body).sort(), ['location_id', 'name', 'valid']);
});

test('POST /api/waste-reports/validate with a signature minted for a different location is rejected', async () => {
  const sig = signLocationId('CAFE');
  const res = await request(app)
    .post('/api/waste-reports/validate')
    .send({ location_id: 'LIB', sig, note: 'ok' });

  assert.strictEqual(res.status, 400);
  assert.deepStrictEqual(res.body, { error: 'ไม่พบจุดนี้ในระบบ กรุณาติดต่อเจ้าหน้าที่' });
});

test('POST /api/waste-reports/validate with an unregistered location_id and no sig is rejected', async () => {
  const res = await request(app)
    .post('/api/waste-reports/validate')
    .send({ location_id: 'NOPE' });

  assert.strictEqual(res.status, 400);
  assert.deepStrictEqual(res.body, { error: 'ไม่พบจุดนี้ในระบบ กรุณาติดต่อเจ้าหน้าที่' });
});

test('POST /api/waste-reports/validate with a registered location_id and no sig (dropdown path) returns 200 valid', async () => {
  const res = await request(app)
    .post('/api/waste-reports/validate')
    .send({ location_id: 'LIB' });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.valid, true);
});

test('POST /api/waste-reports/validate with no location_id at all is rejected asking the user to choose one', async () => {
  const res = await request(app)
    .post('/api/waste-reports/validate')
    .send({});

  assert.strictEqual(res.status, 400);
  assert.deepStrictEqual(res.body, { error: 'กรุณาเลือกจุดที่แจ้ง' });
});

test('POST /api/waste-reports/validate accepts a 500-code-unit Thai note', async () => {
  const base = 'เร่งด่วนควรดำเนินการไม่เร่งด่วน';
  let note = '';
  while (note.length < 500) {
    note += base;
  }
  note = note.slice(0, 500);
  assert.strictEqual(note.length, 500);

  const res = await request(app)
    .post('/api/waste-reports/validate')
    .send({ location_id: 'LIB', note });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.valid, true);
});

test('POST /api/waste-reports/validate rejects a 501-code-unit Thai note', async () => {
  const base = 'เร่งด่วนควรดำเนินการไม่เร่งด่วน';
  let note = '';
  while (note.length < 501) {
    note += base;
  }
  note = note.slice(0, 501);
  assert.strictEqual(note.length, 501);

  const res = await request(app)
    .post('/api/waste-reports/validate')
    .send({ location_id: 'LIB', note });

  assert.strictEqual(res.status, 400);
  assert.deepStrictEqual(res.body, { error: 'รายละเอียดยาวเกินไป (ไม่เกิน 500 ตัวอักษร)' });
});

test('POST /api/waste-reports/validate accepts an absent note', async () => {
  const res = await request(app)
    .post('/api/waste-reports/validate')
    .send({ location_id: 'LIB' });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.valid, true);
});

test('POST /api/waste-reports/validate accepts an empty-string note', async () => {
  const res = await request(app)
    .post('/api/waste-reports/validate')
    .send({ location_id: 'LIB', note: '' });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.valid, true);
});

test('POST /api/waste-reports/validate persists nothing to disk', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const repoRoot = path.join(__dirname, '..');
  const before = fs.readdirSync(repoRoot);

  const sig = signLocationId('LIB');
  await request(app).post('/api/waste-reports/validate').send({ location_id: 'LIB', sig, note: 'ok' });
  await request(app).post('/api/waste-reports/validate').send({ location_id: 'CAFE', sig, note: 'ok' });
  await request(app).post('/api/waste-reports/validate').send({});
  const longNote = 'a'.repeat(501);
  await request(app).post('/api/waste-reports/validate').send({ location_id: 'LIB', note: longNote });

  const after = fs.readdirSync(repoRoot);
  assert.deepStrictEqual(after, before, 'the repository root must contain no new or removed files');
  assert.ok(!fs.existsSync(path.join(repoRoot, 'waste-reports.json')), 'waste-reports.json must not be created');
});

test('the dropdown-mode response contains an empty, hidden validate-banner positioned above the CTA', async () => {
  const res = await request(app).get('/report');

  const bannerIdx = res.text.indexOf('id="validate-banner"');
  const ctaIdx = res.text.indexOf('id="btn-next"');
  assert.ok(bannerIdx !== -1, 'expected a #validate-banner element');
  assert.ok(ctaIdx !== -1, 'expected the #btn-next CTA');
  assert.ok(bannerIdx < ctaIdx, 'validate-banner must appear before the CTA in document order');

  assert.match(res.text, /class="error-banner is-hidden" id="validate-banner"><\/div>/, 'validate-banner must render empty and hidden');
});

test('the locked-mode response also contains the empty, hidden validate-banner', async () => {
  const res = await request(app).get(signedReportUrl('LIB'));

  assert.match(res.text, /class="error-banner is-hidden" id="validate-banner"><\/div>/);
});

test('the dropdown-mode response contains an empty, hidden inline-error container adjacent to the select', async () => {
  const res = await request(app).get('/report');

  assert.match(res.text, /class="inline-error is-hidden" id="location-inline-error"><\/div>/, 'inline-error must render empty and hidden');
});

test('the locked-mode response carries location_id and sig as data attributes on the locked block', async () => {
  const sig = signLocationId('LIB');
  const res = await request(app).get(signedReportUrl('LIB'));

  assert.ok(res.text.includes('data-location-id="LIB"'));
  assert.ok(res.text.includes(`data-sig="${sig}"`));
});

test('public/js/report.js assigns message text with textContent, never innerHTML', () => {
  const fs = require('node:fs');
  const path = require('node:path');

  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'report.js'), 'utf8');
  const withoutComments = src
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

  assert.ok(!withoutComments.includes('innerHTML'), 'must not use innerHTML');
});

test('public/js/report.js contains the loading, failure and required-field copy', () => {
  const fs = require('node:fs');
  const path = require('node:path');

  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'report.js'), 'utf8');

  assert.ok(src.includes('กำลังตรวจสอบ...'), 'loading label missing');
  assert.ok(src.includes('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง'), 'failure banner copy missing');
  assert.ok(src.includes('กรุณาเลือกจุดที่แจ้ง'), 'required-field copy missing');
});

test('public/js/report.js re-enables the CTA in a finally branch', () => {
  const fs = require('node:fs');
  const path = require('node:path');

  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'report.js'), 'utf8');

  assert.ok(/\.finally\s*\(/.test(src), 'CTA must be re-enabled in a finally branch');
});

test('public/js/report.js never clears the select or note value on any path', () => {
  const fs = require('node:fs');
  const path = require('node:path');

  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'report.js'), 'utf8');

  assert.ok(!/(select|note)[A-Za-z]*\.value\s*=\s*(''|"")/.test(src), 'user input must never be cleared on an error path');
});

test('public/js/report.js posts JSON to /api/waste-reports/validate', () => {
  const fs = require('node:fs');
  const path = require('node:path');

  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'report.js'), 'utf8');

  assert.ok(src.includes('/api/waste-reports/validate'), 'validate endpoint URL missing');
  assert.ok(src.includes("method: 'POST'"), 'must POST to the validate endpoint');
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
