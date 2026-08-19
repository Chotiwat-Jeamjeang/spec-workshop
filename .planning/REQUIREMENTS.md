# Requirements: TeamBoard — ระบบแจ้งจุดขยะภายในมหาวิทยาลัย

**Defined:** 2026-08-18
**Core Value:** ผู้ใช้งานแจ้งจุดขยะได้อย่างรวดเร็วโดยไม่ต้อง login และเจ้าหน้าที่เห็นรายการที่เร่งด่วนที่สุดก่อนเสมอ

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Submission (SUBM)

- [x] **SUBM-01**: ผู้ใช้งานแจ้งจุดขยะได้โดยไม่ต้อง login ผ่านการสแกน QR Code หรือเลือกจุดจากรายการ/แผนที่ที่ลงทะเบียนไว้เท่านั้น (ไม่มี free-text address)
- [x] **SUBM-02**: ระบบปฏิเสธ QR ที่ `location_id` ไม่ตรงกับจุดที่ลงทะเบียน พร้อม error message
- [ ] **SUBM-03**: ผู้ใช้งานกรอกรายละเอียดเพิ่มเติมได้ (field `note`, optional, ไม่เกิน 500 ตัวอักษร)
- [x] **SUBM-04**: ฟอร์มโหลดเร็ว (FCP ≤2 วินาทีบน 4G) และ responsive ที่ 375px/768px/1024px

### Photo Upload (PHOTO)

- [ ] **PHOTO-01**: ผู้ใช้งานแนบรูปภาพขยะได้ 1-3 รูปต่อรายการ (.jpg/.jpeg/.png/.webp เท่านั้น, ≤5MB ต่อไฟล์) โดยตรวจสอบ MIME type จริงจากไฟล์ ไม่ใช่แค่นามสกุล
- [ ] **PHOTO-02**: ระบบทำ face-blur อัตโนมัติก่อนบันทึกไฟล์ หากภาพที่อัปโหลดมีใบหน้าบุคคลติดมา

### AI Classification (AI)

- [ ] **AI-01**: AI จำแนกประเภทขยะจากภาพ (ขยะทั่วไป / รีไซเคิล / อินทรีย์ / อันตราย) และแสดงผลทันทีหลังอัปโหลด
- [ ] **AI-02**: AI ประเมินระดับความเร่งด่วนจากสัดส่วนพื้นที่ขยะปกคลุมในภาพ โดย threshold (เร่งด่วน/ควรดำเนินการ/ไม่เร่งด่วน) ปรับได้ผ่านไฟล์ config โดย admin ไม่ hardcode ในโค้ด
- [ ] **AI-03**: หาก AI จำแนกไม่ได้ ให้บันทึกเป็น `unclassified` ไม่บล็อกการ submit ให้เจ้าหน้าที่ตรวจสอบภายหลัง

### Storage (STORE)

- [ ] **STORE-01**: บันทึกรายการแจ้งลง `waste-reports.json` ผ่าน file lock ทีละครั้ง พร้อมสำรองข้อมูลก่อนเขียนทับทุกครั้ง และ fallback ไปใช้ backup หากไฟล์หลักเสียหาย

### Status & Queue (QUEUE)

- [ ] **QUEUE-01**: แต่ละรายการมีสถานะ รอดำเนินการ → กำลังดำเนินการ → ดำเนินการเสร็จสิ้น เปลี่ยนได้ทางเดียวเท่านั้น
- [ ] **QUEUE-02**: รายการที่ AI วิเคราะห์ว่าเร่งด่วนต้องแสดงเด่นชัดและเรียงลำดับบนสุดให้เจ้าหน้าที่เห็น
- [ ] **QUEUE-03**: เจ้าหน้าที่ดูรายการแจ้งและเปลี่ยนสถานะได้โดยไม่ต้อง login พร้อมกรอก `changed_by` (optional)

### Notification (NOTIFY)

- [ ] **NOTIFY-01**: ระบบส่งแจ้งเตือนเข้ากลุ่ม LINE ของเจ้าหน้าที่ภายใน 10 วินาทีหลังบันทึกสำเร็จ (event-based) พร้อม retry 3 ครั้งแบบ exponential backoff เมื่อส่งไม่สำเร็จ

### Abuse Prevention (ABUSE)

- [ ] **ABUSE-01**: จำกัดอัตราการแจ้งจากผู้ใช้แต่ละคน/IP ไม่เกิน 5 รายการต่อชั่วโมง
- [ ] **ABUSE-02**: ตรวจจับรายการแจ้งซ้ำด้วย dedup key (`location_id` + ช่วงเวลา 30 นาที) และรวมเข้ารายการเดิมแทนการสร้างใหม่

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Analytics (deferred)

- **ANLY-01**: Dashboard สรุปจำนวนการแจ้ง/ระดับความเร่งด่วน/ระยะเวลาจัดเก็บ
- **ANLY-02**: การวิเคราะห์ข้อมูลจุดที่มีปัญหาขยะสะสมบ่อยเพื่อวางแผนรอบจัดเก็บ

### Routing (deferred)

- **ROUTE-01**: การแยกผู้รับผิดชอบแยกตามพื้นที่ (แทนกลุ่ม LINE กลางกลุ่มเดียว)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Authentication/login สำหรับผู้ใช้งานทั่วไปและเจ้าหน้าที่ | SPEC ระบุชัดว่าทั้งสองฝั่งไม่ต้อง login — เป็น Core Value ของระบบ |
| Free-text address | เป็นสาเหตุหลักของข้อมูลคุณภาพต่ำใน 311 apps ทั่วไป — ใช้ QR/dropdown ที่ลงทะเบียนไว้แทน |
| Status reopen / undo | เป็นการตัดสินใจโดยเจตนาเพื่อความง่ายและ audit trail |
| CAPTCHA | เพิ่มความฝืดใจโดยไม่จำเป็นสำหรับ flow ที่ผูกกับ QR ในสถานที่จริง — ใช้ rate limit + dedup แทน |
| Reporter contact field | ขัดกับหลักการไม่เก็บ PII ที่ไม่จำเป็นของระบบ |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SUBM-01 | Phase 1 | Complete |
| SUBM-02 | Phase 1 | Complete |
| SUBM-03 | Phase 1 | Pending |
| SUBM-04 | Phase 1 | Complete |
| PHOTO-01 | Phase 2 | Pending |
| PHOTO-02 | Phase 2 | Pending |
| AI-01 | Phase 2 | Pending |
| AI-02 | Phase 2 | Pending |
| AI-03 | Phase 2 | Pending |
| STORE-01 | Phase 3 | Pending |
| QUEUE-01 | Phase 4 | Pending |
| QUEUE-02 | Phase 4 | Pending |
| QUEUE-03 | Phase 4 | Pending |
| NOTIFY-01 | Phase 5 | Pending |
| ABUSE-01 | Phase 6 | Pending |
| ABUSE-02 | Phase 6 | Pending |

**Coverage:**

- v1 requirements: 16 total
- Mapped to phases: 16 (roadmap created)
- Unmapped: 0 ✓

---
*Requirements defined: 2026-08-18*
*Last updated: 2026-08-18 after roadmap creation*
