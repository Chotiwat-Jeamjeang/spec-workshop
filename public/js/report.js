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
})();
