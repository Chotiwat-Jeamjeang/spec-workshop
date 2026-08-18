# TeamBoard — ระบบแจ้งจุดขยะภายในมหาวิทยาลัย

## What This Is

ระบบสำหรับแจ้งจุดที่มีขยะหรือถังขยะเต็มภายในมหาวิทยาลัย ให้เจ้าหน้าที่ได้รับแจ้งและเข้าดำเนินการได้อย่างรวดเร็ว ผู้ใช้งานแจ้งได้โดยไม่ต้อง login ผ่านการสแกน QR Code หรือเลือกจุดจากรายการ พร้อมแนบรูปภาพขยะ โดยมี AI ช่วยจำแนกประเภทขยะและวิเคราะห์ระดับความเร่งด่วนในการจัดเก็บจากรูปภาพที่แนบมา

## Core Value

ผู้ใช้งานแจ้งจุดขยะได้อย่างรวดเร็วโดยไม่ต้อง login และเจ้าหน้าที่เห็นรายการที่เร่งด่วนที่สุดก่อนเสมอ เพื่อให้เข้าดำเนินการจัดเก็บได้เร็วที่สุด — ถ้าสิ่งนี้ไม่ทำงาน ระบบทั้งหมดก็ไม่มีความหมาย

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] ผู้ใช้งานแจ้งจุดขยะได้โดยไม่ต้อง login ผ่านการสแกน QR Code หรือเลือกจุดจากรายการ/แผนที่ที่ลงทะเบียนไว้เท่านั้น
- [ ] ระบบปฏิเสธ QR ที่ `location_id` ไม่ตรงกับจุดที่ลงทะเบียน พร้อม error message
- [ ] ผู้ใช้งานกรอกรายละเอียดเพิ่มเติมได้ (field `note`, optional, ไม่เกิน 500 ตัวอักษร)
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
- [ ] ฟอร์มโหลดเร็ว (FCP ≤2 วินาทีบน 4G) และ responsive ที่ 375px/768px/1024px

### Out of Scope

- Dashboard สรุปจำนวนการแจ้ง/ระดับความเร่งด่วน/ระยะเวลาจัดเก็บ — future scalability item ตาม SPEC ไม่ใช่ scope เริ่มต้น
- การแยกผู้รับผิดชอบแยกตามพื้นที่ — ปัจจุบันแจ้งเตือนรวมเข้ากลุ่มกลางกลุ่มเดียวตาม SPEC
- การวิเคราะห์ข้อมูลจุดที่มีปัญหาขยะสะสมบ่อยเพื่อวางแผนรอบจัดเก็บ — future analytics ตาม SPEC
- ระบบ authentication/login สำหรับผู้ใช้งานทั่วไปและเจ้าหน้าที่ — SPEC ระบุชัดว่าทั้งสองฝั่งไม่ต้อง login

## Context

- Tech stack ตาม SPEC: Node.js + Express, HTML/CSS/JS ฝั่ง frontend, เก็บข้อมูลเป็น JSON (ไม่มี database), QR Code, LINE Messaging API สำหรับแจ้งเตือน
- AI สำหรับจำแนกประเภทขยะและประเมินความเร่งด่วนใช้ Claude API (vision + structured outputs) — เริ่มมี proof-of-concept แล้วที่ `src/services/wasteImageClassifier.js` และ `POST /api/waste-reports/classify` โดยโมเดลคืนค่า waste_type/coverage_percentage และแอปคำนวณ urgency จาก `config/ai-thresholds.json` เอง (ไม่ให้ AI ตัดสิน urgency ตรงๆ) เพื่อให้ตรงกับข้อกำหนดเรื่อง threshold ที่ admin ปรับได้
- Repo ยังอยู่ช่วงเริ่มต้น: มี Express app skeleton, การอัปโหลด/ตรวจสอบไฟล์ภาพ (magic-byte validation) และ endpoint จำแนกภาพเท่านั้น ยังไม่มี QR flow, การบันทึกรายการ, LINE notification, หรือ dashboard เจ้าหน้าที่
- ผลการจำแนกจาก AI เป็นเพียงคำแนะนำ ไม่ใช่ผลตัดสินสุดท้าย — ผู้ใช้งาน/เจ้าหน้าที่แก้ไขได้เสมอ

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
*Last updated: 2026-08-18 after initialization*
