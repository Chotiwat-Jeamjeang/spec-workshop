# Smart Waste Alert — ระบบแจ้งจุดขยะภายในมหาวิทยาลัย

## What This Is

ระบบสำหรับแจ้งจุดที่มีขยะหรือถังขยะเต็มภายในมหาวิทยาลัย ให้เจ้าหน้าที่ได้รับแจ้งและเข้าดำเนินการได้อย่างรวดเร็ว ผู้ใช้งานแจ้งได้โดยไม่ต้อง login ผ่านการสแกน QR Code หรือเลือกจุดจากรายการ พร้อมแนบรูปภาพขยะ โดยมี AI ช่วยจำแนกประเภทขยะและวิเคราะห์ระดับความเร่งด่วนในการจัดเก็บจากรูปภาพที่แนบมา

## Core Value

ผู้ใช้งานแจ้งจุดขยะได้อย่างรวดเร็วโดยไม่ต้อง login และเจ้าหน้าที่เห็นรายการที่เร่งด่วนที่สุดก่อนเสมอ เพื่อให้เข้าดำเนินการจัดเก็บได้เร็วที่สุด — ถ้าสิ่งนี้ไม่ทำงาน ระบบทั้งหมดก็ไม่มีความหมาย

## Requirements

### Validated

- ✓ ผู้ใช้งานแจ้งจุดขยะได้โดยไม่ต้อง login ผ่านการสแกน QR Code หรือเลือกจุดจากรายการที่ลงทะเบียนไว้เท่านั้น (SUBM-01) — Phase 1
- ✓ ระบบปฏิเสธ QR ที่ `location_id` ไม่ตรงกับจุดที่ลงทะเบียน พร้อม error message (SUBM-02) — Phase 1
- ✓ ผู้ใช้งานกรอกรายละเอียดเพิ่มเติมได้ (field `note`, optional, ไม่เกิน 500 ตัวอักษร) (SUBM-03) — Phase 1
- ✓ ฟอร์มโหลดเร็ว (FCP ≤2 วินาทีบน 4G) และ responsive ที่ 375px/768px/1024px (SUBM-04) — Phase 1

### Active

- [ ] ผู้ใช้งานแนบรูปภาพขยะได้ 1-3 รูปต่อรายการ (.jpg/.jpeg/.png/.webp เท่านั้น, ≤5MB ต่อไฟล์) โดยตรวจสอบ MIME type จริงจากไฟล์ ไม่ใช่แค่นามสกุล
- [ ] AI จำแนกประเภทขยะจากภาพ (ขยะทั่วไป / รีไซเคิล / อินทรีย์ / อันตราย) และแสดงผลทันทีหลังอัปโหลด
- [ ] AI ประเมินระดับความเร่งด่วนจากสัดส่วนพื้นที่ขยะปกคลุมในภาพ โดย threshold (เร่งด่วน/ควรดำเนินการ/ไม่เร่งด่วน) ปรับได้ผ่านไฟล์ config โดย admin ไม่ hardcode ในโค้ด
- [ ] หาก AI จำแนกไม่ได้ ให้บันทึกเป็น `unclassified` ไม่บล็อกการ submit ให้เจ้าหน้าที่ตรวจสอบภายหลัง
- [ ] บันทึกรายการแจ้งลง `waste-reports.json` ผ่าน file lock ทีละครั้ง พร้อมสำรองข้อมูลก่อนเขียนทับทุกครั้ง และ fallback ไปใช้ backup หากไฟล์หลักเสียหาย
- [ ] แต่ละรายการมีสถานะ รอดำเนินการ → กำลังดำเนินการ → ดำเนินการเสร็จสิ้น เปลี่ยนได้ทางเดียวเท่านั้น
- [ ] ระบบส่งแจ้งเตือนเข้ากลุ่ม LINE ของเจ้าหน้าที่ภายใน 10 วินาทีหลังบันทึกสำเร็จ (event-based) พร้อม retry 3 ครั้งแบบ exponential backoff เมื่อส่งไม่สำเร็จ
- [ ] รายการที่ AI วิเคราะห์ว่าเร่งด่วนต้องแสดงเด่นชัดและเรียงลำดับบนสุดให้เจ้าหน้าที่เห็น
- [ ] เจ้าหน้าที่ดูรายการแจ้งและเปลี่ยนสถานะได้โดยไม่ต้อง login พร้อมกรอก `changed_by` (optional)
- [ ] ระบบทำ face-blur อัตโนมัติก่อนบันทึกไฟล์ หากภาพที่อัปโหลดมีใบหน้าบุคคลติดมา
- [ ] จำกัดอัตราการแจ้งจากผู้ใช้แต่ละคน/IP ไม่เกิน 5 รายการต่อชั่วโมง
- [ ] ตรวจจับรายการแจ้งซ้ำด้วย dedup key (`location_id` + ช่วงเวลา 30 นาที) และรวมเข้ารายการเดิมแทนการสร้างใหม่

### Out of Scope

- Dashboard สรุปจำนวนการแจ้ง/ระดับความเร่งด่วน/ระยะเวลาจัดเก็บ — future scalability item ตาม SPEC ไม่ใช่ scope เริ่มต้น
- การแยกผู้รับผิดชอบแยกตามพื้นที่ — ปัจจุบันแจ้งเตือนรวมเข้ากลุ่มกลางกลุ่มเดียวตาม SPEC
- การวิเคราะห์ข้อมูลจุดที่มีปัญหาขยะสะสมบ่อยเพื่อวางแผนรอบจัดเก็บ — future analytics ตาม SPEC
- ระบบ authentication/login สำหรับผู้ใช้งานทั่วไปและเจ้าหน้าที่ — SPEC ระบุชัดว่าทั้งสองฝั่งไม่ต้อง login

## Context

- Tech stack ตาม SPEC: Node.js + Express, HTML/CSS/JS ฝั่ง frontend, เก็บข้อมูลเป็น JSON (ไม่มี database), QR Code, LINE Messaging API สำหรับแจ้งเตือน
- AI สำหรับจำแนกประเภทขยะและประเมินความเร่งด่วนใช้ Claude API (vision + structured outputs) — เริ่มมี proof-of-concept แล้วที่ `src/services/wasteImageClassifier.js` และ `POST /api/waste-reports/classify` โดยโมเดลคืนค่า waste_type/coverage_percentage และแอปคำนวณ urgency จาก `config/ai-thresholds.json` เอง (ไม่ให้ AI ตัดสิน urgency ตรงๆ) เพื่อให้ตรงกับข้อกำหนดเรื่อง threshold ที่ admin ปรับได้
- ผลการจำแนกจาก AI เป็นเพียงคำแนะนำ ไม่ใช่ผลตัดสินสุดท้าย — ผู้ใช้งาน/เจ้าหน้าที่แก้ไขได้เสมอ
- **Phase 1 เสร็จแล้ว (2026-08-20):** ฟอร์มแจ้งจุดขยะ (`GET /report`) ใช้งานได้จริงทั้ง 3 สถานะ — QR ที่ลงทะเบียน (signed URL, HMAC-SHA256 ผ่าน `src/services/qrSignature.js`), เลือกจากรายการ dropdown (ไม่มี QR), และสถานะ error เมื่อ QR ไม่ถูกต้อง พร้อม `POST /api/waste-reports/validate` ตรวจซ้ำฝั่ง server (ยังไม่บันทึกจริง — persistence เป็นงานของ Phase 3) รายชื่อจุดอยู่ใน `config/locations.json` (ยังเป็นชื่อสมมติ รอผู้ใช้ให้ชื่อจริง) สคริปต์ปั๊ม QR อยู่ที่ `scripts/generate-qr.js`
- Repo ตอนนี้: มี Express app skeleton + endpoint จำแนกภาพ (Phase 2 ยังไม่แตะ) และฟอร์มแจ้งจุดขยะที่สมบูรณ์จาก Phase 1 ยังไม่มีการบันทึกรายการจริง (`waste-reports.json`), LINE notification, หรือ dashboard เจ้าหน้าที่

## Constraints

- **Tech stack**: Node.js + Express, JSON file storage (`waste-reports.json`) — ไม่ใช้ database ตาม SPEC
- **Security**: ต้องตรวจสอบ MIME type จริงของไฟล์ภาพ (ไม่เชื่อนามสกุลไฟล์อย่างเดียว), จำกัดขนาดไฟล์ 5MB, ไม่ serve `waste-reports.json` เป็น static file, sanitize ทุก field ข้อความก่อนแสดงผล (ป้องกัน stored XSS)
- **AI Ethics**: ผลจำแนกจาก AI เป็นคำแนะนำเท่านั้น การตัดสินใจสุดท้ายเป็นหน้าที่เจ้าหน้าที่เสมอ ต้องทำ face-blur อัตโนมัติเพื่อไม่เก็บข้อมูลส่วนบุคคลที่ไม่จำเป็น
- **Compatibility**: ต้องรองรับโทรศัพท์มือถือและ responsive ตาม breakpoint ที่ระบุใน SPEC

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| ใช้ Claude API (`claude-opus-5`) พร้อม structured outputs (`output_config.format` json_schema) สำหรับจำแนกภาพขยะ | ได้ผลลัพธ์ JSON ที่ตรง schema เสมอ ไม่ต้อง parse ข้อความอิสระหรือเสี่ยง format ผิดพลาด | ✓ Good |
| คำนวณระดับความเร่งด่วนจาก `coverage_percentage` ที่ AI ประเมิน โดยเทียบกับ threshold ในโค้ดแอป ไม่ให้ AI ตอบ urgency ตรงๆ | ตรงตามข้อกำหนดใน SPEC ที่ต้องการให้ threshold ปรับได้ผ่านไฟล์ config โดย admin โดยไม่ hardcode ในโค้ด | ✓ Good |
| ตรวจสอบชนิดไฟล์ภาพด้วย magic bytes แทนการเชื่อ MIME type/extension ที่ client ส่งมา | SPEC กำหนดชัดว่าต้องตรวจสอบ MIME type จริง ไม่เชื่อนามสกุลไฟล์อย่างเดียว | ✓ Good |
| QR payload เป็น HMAC-SHA256-signed URL (ไม่ใช่ bare `location_id`) | one-way door — สติกเกอร์ QR พิมพ์จริงติดถังขยะแล้วเปลี่ยนรูปแบบทีหลังต้องพิมพ์/ติดใหม่ทั้งมหาวิทยาลัย ผู้ใช้ยืนยันเลือก signed-url เพื่อพิสูจน์ว่า QR มาจากระบบจริง ป้องกันการปลอม/เดา location_id | ✓ Good — Phase 1 |
| `config/locations.json` เป็นไฟล์ hand-edited ธรรมดา (ไม่มี admin UI) ใส่ 5 จุดตัวอย่างชื่อสมมติไปก่อน | ตรงกับ scope Phase 1 ที่ยังไม่มี admin UI ตาม SPEC ผู้ใช้จะให้ชื่อจุดจริงมาแทนที่ทีหลัง | ✓ Good — Phase 1, รอชื่อจุดจริงจากผู้ใช้ |
| เลือกจุดแบบ dropdown ธรรมดา ไม่ใช้แผนที่/pin | รักษา FCP ≤2s บน 4G โดยไม่ต้องโหลด map library | ✓ Good — Phase 1 |
| `POST /api/waste-reports/validate` ตรวจสอบ QR/note ซ้ำฝั่ง server แต่ไม่บันทึกอะไรเลย | ปิดช่องโหว่ที่ client-side validation เพียงอย่างเดียวสามารถถูกข้ามได้ (curl/devtools) โดยยังไม่ผูกกับ persistence ที่เป็นงาน Phase 3 | ✓ Good — Phase 1 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-08-20 after Phase 1*
