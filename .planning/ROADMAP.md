# Roadmap: TeamBoard — ระบบแจ้งจุดขยะภายในมหาวิทยาลัย

## Overview

ระบบเริ่มจากการให้ผู้ใช้งานเข้าสู่ฟอร์มแจ้งขยะผ่าน QR/จุดที่ลงทะเบียนไว้โดยไม่ต้อง login (Phase 1) จากนั้นแนบรูปภาพและให้ AI ช่วยจำแนกประเภท/ประเมินความเร่งด่วนพร้อม face-blur อัตโนมัติ ต่อยอดจาก proof-of-concept ที่มีอยู่แล้วใน `src/services/wasteImageClassifier.js` และ `POST /api/waste-reports/classify` (Phase 2) รายการที่ผ่านการตรวจสอบจะถูกบันทึกอย่างปลอดภัยลง `waste-reports.json` พร้อม backup/fallback (Phase 3) เจ้าหน้าที่จึงเห็นรายการเรียงตามความเร่งด่วนและเปลี่ยนสถานะได้โดยไม่ต้อง login (Phase 4) ระบบแจ้งเตือนเข้ากลุ่ม LINE โดยอัตโนมัติเมื่อมีรายการใหม่ (Phase 5) และปิดท้ายด้วยการป้องกันการแจ้งสแปม/ซ้ำเพื่อรักษาคุณภาพข้อมูล (Phase 6)

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Location & Submission Entry** - ผู้ใช้งานเข้าฟอร์มแจ้งขยะผ่าน QR/จุดที่ลงทะเบียนโดยไม่ต้อง login พร้อมกรอกรายละเอียดเพิ่มเติม
- [ ] **Phase 2: Photo Upload, Face-Blur & AI Classification** - ผู้ใช้งานแนบรูปขยะอย่างปลอดภัยและเห็นผลจำแนกประเภท/ความเร่งด่วนจาก AI ทันที
- [ ] **Phase 3: Report Persistence** - รายการแจ้งถูกบันทึกลงไฟล์อย่างปลอดภัยพร้อม backup และ fallback
- [ ] **Phase 4: Officer Queue & Status Management** - เจ้าหน้าที่เห็นรายการเรียงตามความเร่งด่วนและเปลี่ยนสถานะได้โดยไม่ต้อง login
- [ ] **Phase 5: LINE Notification** - เจ้าหน้าที่ได้รับแจ้งเตือนรายการใหม่ผ่าน LINE โดยอัตโนมัติและเชื่อถือได้
- [ ] **Phase 6: Abuse Prevention** - ระบบป้องกันการแจ้งสแปม/ซ้ำโดยไม่ใช้ CAPTCHA

## Phase Details

### Phase 1: Location & Submission Entry
**Goal**: ผู้ใช้งานเข้าสู่ฟอร์มแจ้งขยะผ่าน QR Code หรือจุดที่ลงทะเบียนไว้โดยไม่ต้อง login กรอกรายละเอียดเพิ่มเติมได้ และฟอร์มโหลดเร็ว responsive ทุกขนาดหน้าจอ
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: SUBM-01, SUBM-02, SUBM-03, SUBM-04
**Success Criteria** (what must be TRUE):
  1. ผู้ใช้งานสแกน QR Code ที่ลงทะเบียนแล้วเข้าสู่ฟอร์มแจ้งขยะพร้อม location ที่ถูกต้อง โดยไม่ต้อง login และไม่มีช่อง free-text address
  2. ระบบปฏิเสธ QR ที่ `location_id` ไม่ตรงกับจุดที่ลงทะเบียน พร้อมแสดง error message ที่เข้าใจง่าย
  3. ผู้ใช้งานกรอก `note` เพิ่มเติมได้ไม่เกิน 500 ตัวอักษร (ระบบป้องกัน/แจ้งเตือนเมื่อเกิน)
  4. ฟอร์มแสดงผล FCP ≤2 วินาทีบน 4G และแสดงผลถูกต้อง (responsive) ที่ 375px/768px/1024px
**Plans**: 7 plans (5 waves)
Plans:
- [ ] 01-01-PLAN.md — Walking Skeleton tracer: signed QR URL renders the locked report form end-to-end
- [ ] 01-02-PLAN.md — Dropdown location picker, empty-registry state, and invalid-QR rejection
- [ ] 01-03-PLAN.md — Responsive stylesheet per the UI contract, zero external requests
- [ ] 01-04-PLAN.md — QR generation ops CLI with a mint-then-verify round-trip test
- [ ] 01-05-PLAN.md — "ไม่ใช่จุดนี้" mis-scan recovery and the optional note field with a Thai-correct counter
- [ ] 01-06-PLAN.md — Server-side validate endpoint and CTA wiring with loading/error states
- [ ] 01-07-PLAN.md — FCP measurement under simulated 4G and responsive verification at 375/768/1024px
**UI hint**: yes

### Phase 2: Photo Upload, Face-Blur & AI Classification
**Goal**: ผู้ใช้งานแนบรูปภาพขยะได้อย่างปลอดภัย รูปที่มีใบหน้าถูกเบลออัตโนมัติ และเห็นผลจำแนกประเภทขยะ/ระดับความเร่งด่วนจาก AI ทันทีหลังอัปโหลด — ต่อยอดจาก proof-of-concept ที่มีอยู่แล้ว (`src/services/wasteImageClassifier.js`, `POST /api/waste-reports/classify`, `config/ai-thresholds.json`) ไม่สร้างซ้ำ
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: PHOTO-01, PHOTO-02, AI-01, AI-02, AI-03
**Success Criteria** (what must be TRUE):
  1. ผู้ใช้งานแนบรูปได้ 1-3 รูปต่อรายการ เฉพาะไฟล์ที่ผ่านการตรวจสอบ MIME type จริงจากไฟล์ (.jpg/.jpeg/.png/.webp) และ ≤5MB ต่อไฟล์ มิฉะนั้นระบบปฏิเสธพร้อม error message
  2. รูปภาพที่มีใบหน้าบุคคลติดมาถูกเบลออัตโนมัติก่อนบันทึกไฟล์จริงเสมอ
  3. ผู้ใช้งานเห็นผลจำแนกประเภทขยะ (ทั่วไป/รีไซเคิล/อินทรีย์/อันตราย) แสดงผลทันทีหลังอัปโหลด
  4. ระบบคำนวณระดับความเร่งด่วน (เร่งด่วน/ควรดำเนินการ/ไม่เร่งด่วน) จาก `coverage_percentage` ที่ AI ประเมิน เทียบกับ threshold ใน `config/ai-thresholds.json` ที่ admin ปรับได้โดยไม่ต้องแก้โค้ด
  5. เมื่อ AI จำแนกไม่ได้ รายการถูกบันทึกเป็น `unclassified` และการ submit ยังดำเนินต่อไปได้โดยไม่ถูกบล็อก
**Plans**: TBD
**UI hint**: yes

### Phase 3: Report Persistence
**Goal**: รายการแจ้งขยะที่ผ่านการตรวจสอบถูกบันทึกลง `waste-reports.json` อย่างปลอดภัยแม้มีการแจ้งพร้อมกันหลายคน และกู้คืนได้เมื่อไฟล์หลักเสียหาย
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: STORE-01
**Success Criteria** (what must be TRUE):
  1. รายการที่ submit พร้อมกันหลายรายการถูกเขียนลง `waste-reports.json` ทีละครั้งผ่าน file lock โดยไม่มีข้อมูลเขียนทับกันหรือสูญหายจาก race condition
  2. ระบบสร้างไฟล์สำรอง (backup) ก่อนเขียนทับไฟล์หลักทุกครั้ง
  3. เมื่อไฟล์หลักเสียหาย ระบบ fallback ไปใช้ backup โดยแอปยังทำงานต่อได้โดยไม่ crash
**Plans**: TBD

### Phase 4: Officer Queue & Status Management
**Goal**: เจ้าหน้าที่เห็นรายการแจ้งขยะเรียงตามความเร่งด่วนและเปลี่ยนสถานะได้โดยไม่ต้อง login
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: QUEUE-01, QUEUE-02, QUEUE-03
**Success Criteria** (what must be TRUE):
  1. เจ้าหน้าที่เข้าดูรายการแจ้งทั้งหมดได้โดยไม่ต้อง login
  2. รายการที่ AI วิเคราะห์ว่าเร่งด่วนแสดงเด่นชัด (visual indicator) และเรียงลำดับอยู่บนสุดของรายการเสมอ
  3. เจ้าหน้าที่เปลี่ยนสถานะได้ตามลำดับ รอดำเนินการ → กำลังดำเนินการ → ดำเนินการเสร็จสิ้น เท่านั้น (เปลี่ยนย้อนกลับไม่ได้)
  4. เจ้าหน้าที่กรอก `changed_by` (optional) ได้เมื่อเปลี่ยนสถานะ
**Plans**: TBD
**UI hint**: yes

### Phase 5: LINE Notification
**Goal**: เจ้าหน้าที่ได้รับแจ้งเตือนรายการแจ้งขยะใหม่เข้ากลุ่ม LINE โดยอัตโนมัติและเชื่อถือได้ แม้เครือข่ายไม่เสถียร
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: NOTIFY-01
**Success Criteria** (what must be TRUE):
  1. เมื่อบันทึกรายการสำเร็จ ระบบส่งข้อความแจ้งเตือนเข้ากลุ่ม LINE ของเจ้าหน้าที่ภายใน 10 วินาที (event-based)
  2. หากส่งข้อความไม่สำเร็จ ระบบ retry อัตโนมัติสูงสุด 3 ครั้งแบบ exponential backoff
  3. ความล้มเหลวของการส่งแจ้งเตือน (แม้ retry ครบแล้ว) ไม่ทำให้การบันทึกรายการล้มเหลวหรือ block การ submit ของผู้ใช้
**Plans**: TBD

### Phase 6: Abuse Prevention
**Goal**: ระบบป้องกันการแจ้งสแปม/รายการซ้ำจากผู้ใช้เดิมโดยไม่ต้องพึ่ง CAPTCHA เพื่อรักษาคุณภาพข้อมูลในคิวของเจ้าหน้าที่
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: ABUSE-01, ABUSE-02
**Success Criteria** (what must be TRUE):
  1. ผู้ใช้งาน/IP เดียวกันแจ้งได้ไม่เกิน 5 รายการต่อชั่วโมง เมื่อเกินขีดจำกัดระบบปฏิเสธพร้อม error message
  2. รายการแจ้งซ้ำที่มี `location_id` เดียวกันภายในช่วงเวลา 30 นาที ถูกรวมเข้ารายการเดิมแทนการสร้างรายการใหม่
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Location & Submission Entry | 0/7 | Planned | - |
| 2. Photo Upload, Face-Blur & AI Classification | 0/TBD | Not started | - |
| 3. Report Persistence | 0/TBD | Not started | - |
| 4. Officer Queue & Status Management | 0/TBD | Not started | - |
| 5. LINE Notification | 0/TBD | Not started | - |
| 6. Abuse Prevention | 0/TBD | Not started | - |
