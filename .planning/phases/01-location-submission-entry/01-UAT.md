---
status: complete
phase: 01-location-submission-entry
source: [01-VERIFICATION.md]
started: 2026-08-20T12:05:00Z
updated: 2026-08-20T12:30:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Visual/UX quality in a real browser
expected: The locked and dropdown states are visually unmistakable at a glance in the same DOM position; no layout shift; Thai text renders with real glyphs; all controls are comfortably tappable at 375px/768px/1024px.
result: pass

### 2. Physical QR phone-camera scan
expected: |
  Print or display qr-output/LIB.png (or another seed location's PNG) on a screen, scan it with
  a phone camera app while the dev server is running (npm start), and confirm the phone opens
  the report form with the correct location locked and the ยืนยันจาก QR badge — then repeat with
  a second location (e.g. qr-output/DORM-1.png) to confirm ids are not cross-wired. The phone's
  native camera should recognise the QR and offer to open the URL with no manual typing; the
  opened page should show the correct location locked, not the error state.
result: pass

### 3. Live CTA loading/offline-failure behavior
expected: |
  With npm start running, open /report, choose a location, type a note, click ถัดไป and confirm
  the button reads กำลังตรวจสอบ... and is disabled while the request is in flight and returns to
  ถัดไป on success. Then set DevTools' network profile to Offline and click ถัดไป again — confirm
  the banner reads เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง, the button re-enables, and the chosen
  location and typed note are still exactly as entered. Loading state should be visible and the
  button unusable while in flight; a network failure should show the failure banner without
  discarding the user's selection or note; the button should always recover.
result: pass

## Summary

total: 3
passed: 3
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
