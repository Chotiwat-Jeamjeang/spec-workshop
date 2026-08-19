/*
 * public/js/report.js
 * Plain browser JavaScript — no modules, no framework, no build step.
 * Served as-is via express.static from public/js/report.js.
 *
 * This script is loaded on every rendered mode (locked, dropdown, error),
 * so every element lookup is guarded: a missing node is a no-op, never a
 * thrown error, since #btn-not-this and #note genuinely do not exist in
 * every mode.
 */

(function () {
  'use strict';

  var btnNotThis = document.getElementById('btn-not-this');
  var locationLocked = document.querySelector('.location-locked');
  var locationDropdown = document.querySelector('.location-dropdown');
  var locationSelect = document.getElementById('location-select');

  if (btnNotThis && locationLocked && locationDropdown && locationSelect) {
    btnNotThis.addEventListener('click', function (event) {
      event.preventDefault();

      locationDropdown.classList.remove('is-hidden');
      locationLocked.classList.add('is-hidden');
      btnNotThis.classList.add('is-hidden');

      locationSelect.focus();

      document.body.setAttribute('data-mode', 'dropdown');
    });
  }

  var note = document.getElementById('note');
  var noteCounter = document.getElementById('note-counter');

  if (note && noteCounter) {
    note.addEventListener('input', function () {
      // Measure with .length (UTF-16 code units) — the same rule the
      // browser's own maxlength attribute uses. Never Buffer.byteLength
      // or TextEncoder: Thai script has no precomposed characters, so a
      // byte-based measure would cap Thai notes at roughly a third of
      // the stated 500-character limit.
      noteCounter.textContent = note.value.length + ' / 500 ตัวอักษร';
    });
  }

  // ---------------------------------------------------------------------
  // CTA submit handler: POST /api/waste-reports/validate
  // ---------------------------------------------------------------------

  var btnNext = document.getElementById('btn-next');
  var validateBanner = document.getElementById('validate-banner');
  var locationInlineError = document.getElementById('location-inline-error');

  var REQUIRED_FIELD_MESSAGE = 'กรุณาเลือกจุดที่แจ้ง';
  var NETWORK_FAILURE_MESSAGE = 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
  var CTA_DEFAULT_LABEL = 'ถัดไป';
  var CTA_LOADING_LABEL = 'กำลังตรวจสอบ...';

  function hideMessage(el) {
    if (!el) return;
    el.textContent = '';
    el.classList.add('is-hidden');
  }

  function showMessage(el, text) {
    if (!el) return;
    // Assigned with textContent, never innerHTML, so a server-supplied
    // string can never be parsed as markup on the client (T-01-21).
    el.textContent = text;
    el.classList.remove('is-hidden');
  }

  if (locationSelect && locationInlineError) {
    // Clear the inline required-field message as soon as a selection is
    // made, so it never lingers after the user fixes the problem.
    locationSelect.addEventListener('change', function () {
      hideMessage(locationInlineError);
    });
  }

  if (btnNext) {
    btnNext.addEventListener('click', function () {
      // Determine the submitted location from what is currently visible in
      // the DOM (not the server-rendered mode, which may be stale after the
      // "ไม่ใช่จุดนี้" toggle flips locked -> dropdown client-side).
      var lockedVisible = locationLocked && !locationLocked.classList.contains('is-hidden');

      var locationId = null;
      var sig = null;

      if (lockedVisible) {
        locationId = locationLocked.getAttribute('data-location-id');
        sig = locationLocked.getAttribute('data-sig');
      } else if (locationSelect) {
        locationId = locationSelect.value || null;
      }

      if (!locationId) {
        showMessage(locationInlineError, REQUIRED_FIELD_MESSAGE);
        if (locationSelect) {
          locationSelect.focus();
        }
        return;
      }

      hideMessage(locationInlineError);
      hideMessage(validateBanner);

      btnNext.disabled = true;
      btnNext.textContent = CTA_LOADING_LABEL;

      var payload = {
        location_id: locationId,
        sig: sig || undefined,
        note: note ? note.value : undefined,
      };

      fetch('/api/waste-reports/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(function (res) {
          if (res.status >= 500) {
            throw new Error('server error');
          }
          return res.json().then(function (data) {
            return { ok: res.status < 300, status: res.status, data: data };
          });
        })
        .then(function (result) {
          if (!result.ok) {
            // Server-supplied error string, never the user's own input —
            // neither the select value nor the note value is touched here.
            showMessage(validateBanner, (result.data && result.data.error) || NETWORK_FAILURE_MESSAGE);
          }
          // A successful (2xx) verdict simply re-enables the CTA in the
          // finally branch below and leaves everything the user entered
          // exactly as it was.
        })
        .catch(function () {
          showMessage(validateBanner, NETWORK_FAILURE_MESSAGE);
        })
        .finally(function () {
          // Re-enabled on every path (success, 400, network failure, 5xx)
          // so no failure path can leave the button permanently dead.
          btnNext.disabled = false;
          btnNext.textContent = CTA_DEFAULT_LABEL;
        });
    });
  }
})();
