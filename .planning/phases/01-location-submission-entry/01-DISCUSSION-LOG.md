# Phase 1: Location & Submission Entry - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-19
**Phase:** 1-Location & Submission Entry
**Areas discussed:** Location registry source, Manual location picker UI

---

## Location registry source

### Q1: Phase 1 นี้ รายชื่อจุดขยะที่ "ลงทะเบียนไว้ล่วงหน้า" จะมาจากไหน?

| Option | Description | Selected |
|--------|-------------|----------|
| ไฟล์ locations.json ตัวอย่าง | `config/locations.json` แบบเดียวกับ `ai-thresholds.json` ใส่จุดตัวอย่าง 5-10 จุด แก้ไขได้ด้วยมือ ไม่ต้องมี UI/auth | ✓ |
| ผู้ใช้ให้รายชื่อจุดจริงมา | คุณมีรายชื่อจุดขยะจริงในมหาวิทยาลัยที่ต้องการให้ใส่ในไฟล์ตั้งแต่ Phase 1 เลย | |
| อื่นๆ | ระบุแนวทางอื่น | |

**User's choice:** ไฟล์ locations.json ตัวอย่าง (แนะนำ)

### Q2: แต่ละ location ใน locations.json ควรมีข้อมูลอะไรบ้าง?

| Option | Description | Selected |
|--------|-------------|----------|
| location_id, name, lat, lng | เก็บเท่าที่ SPEC ระบุไว้ชัดเจน | ✓ |
| เพิ่ม building/zone ด้วย | เพิ่มชื่ออาคาร/โซน เพื่อใช้จัดกลุ่มใน dropdown | |
| อื่นๆ | ระบุเอง | |

**User's choice:** location_id, name, lat, lng (ขั้นต่ำตาม SPEC)

### Q3: ข้อมูลตัวอย่างใน locations.json ควรเป็นแบบไหน?

| Option | Description | Selected |
|--------|-------------|----------|
| ชื่อสมมติ (จุด A, จุด B, หอพัก 1) | ใช้ชื่อสมมติ/placeholder เพราะยังไม่มีข้อมูลอาคารจริงของมหาวิทยาลัย | ✓ |
| คุณจะให้รายชื่อจุดจริงทีหลัง | จะส่งรายชื่ออาคาร/จุดจริงในมหาวิทยาลัยมาให้ทีหลัง | ✓ (as note) |

**User's choice:** คุณจะให้รายชื่อจุดจริงทีหลัง (ใช้ชื่อสมมติในไฟล์ seed ก่อน)
**Notes:** ไฟล์ seed ควรออกแบบให้แก้ไข/แทนที่ด้วยข้อมูลจริงได้ง่ายในภายหลัง โดยไม่ต้องแก้โค้ด

### Q4: จะใส่จุดตัวอย่างกี่จุดใน locations.json ตอนเริ่มต้น?

| Option | Description | Selected |
|--------|-------------|----------|
| 5 จุด (เพียงพอทดสอบ) | เพียงพอให้ทดสอบ dropdown/QR ได้ เพิ่มทีหลังได้ง่ายจากแก้ config | ✓ |
| 10 จุด | มีตัวอย่างเยอะขึ้นสำหรับทดสอบ dropdown ที่มีรายการยาวขึ้น | |
| คุณตัดสินเอง | ให้ Claude เลือกจำนวนที่เหมาะสมตอนวางแผน/เขียน test | |

**User's choice:** 5 จุด (เพียงพอทดสอบ)

---

## Manual location picker UI

### Q1: กรณีผู้ใช้เข้าฟอร์มตรงๆ (ไม่ได้สแกน QR) จะให้เลือกจุดแบบไหน?

| Option | Description | Selected |
|--------|-------------|----------|
| Dropdown รายการ | เบา เร็ว ตรงกับเกณฑ์ FCP ≤2s บน 4G ไม่ต้องใช้ map library เหมาะกับจำนวนจุดน้อย (5 จุดตอนเริ่มต้น) | ✓ |
| ปักหมุดบนแผนที่ | ต้องใช้ map library (เช่น Leaflet) เพิ่มน้ำหนัก JS และซับซ้อนกว่า แต่เห็นภาพรวมเป็นกว่า | |
| ทำทั้งสองอย่าง | มี dropdown เป็นหลัก + ลิงก์/ปุ่มสลับไปดูแผนที่เสริม (ซับซ้อนขึ้น) | |

**User's choice:** Dropdown รายการ (แนะนำ)

### Q2: ใน dropdown แต่ละจุดควรแสดงข้อมูลอะไรให้ผู้ใช้เห็น?

| Option | Description | Selected |
|--------|-------------|----------|
| ชื่อจุดอย่างเดียว | แสดงแค่ name ของแต่ละ location — เรียบง่ายสุด เหมาะกับ schema ที่มีแค่ location_id/name/lat/lng | ✓ |
| ชื่อจุด + พิกัดย่อ | แสดงชื่อพร้อม lat/lng ย่อๆ ต่อท้าย — ช่วยยืนยันตำแหน่ง แต่รกรุงรังขึ้น | |

**User's choice:** ชื่อจุดอย่างเดียว

### Q3: ถ้าผู้ใช้สแกน QR สำเร็จ กับเข้าฟอร์มตรงๆแล้วเลือกจาก dropdown — UI ของส่วน "สถานที่" ก่อนกรอก note ควรต่างกันหรือเหมือนกัน?

| Option | Description | Selected |
|--------|-------------|----------|
| เหมือนกัน — สแกน QR = auto-fill แล้วล็อค | field สถานที่ถูก auto-fill จาก QR แล้วแสดงเป็น read-only ในตำแหน่งเดียวกับที่ dropdown จะอยู่ ไม่ได้สแกน = เห็น dropdown ให้เลือกเอง | ✓ |
| อื่นๆ | ระบุ UI ที่ต่างกันไปเลย | |

**User's choice:** เหมือนกัน — สแกน QR = auto-fill แล้วล็อค

### Q4: เมื่อสแกน QR สำเร็จแล้ว field สถานที่ถูกล็อค — ผู้ใช้ควรเปลี่ยนจุดเองได้ไหม ถ้าสแกนผิดจุด?

| Option | Description | Selected |
|--------|-------------|----------|
| เปลี่ยนไม่ได้ ต้องสแกนใหม่/เข้ามาเลือกเอง | เข้มงวดตาม intent ของ QR-lock ที่สุด แต่ผู้ใช้ที่สแกนผิดจุดต้องเริ่มใหม่ทั้งหมด | |
| มีปุ่ม "ไม่ใช่จุดนี้" ให้เปลี่ยนเป็น dropdown | เพิ่มทางออกให้ผู้ใช้ที่สแกนผิดจุด โดยสลับจากโหมด QR-lock ไปเป็น dropdown เลือกเอง | ✓ |

**User's choice:** มีปุ่ม "ไม่ใช่จุดนี้" ให้เปลี่ยนเป็น dropdown

---

## Claude's Discretion

- **QR payload format & tamper protection** — ไม่ได้ถูกเลือกมาคุยในรอบนี้ ปล่อยให้ research/planning ตัดสินใจ (bare `location_id` เทียบ registry เทียบกับ signed URL + HMAC ตามที่ระบุใน `.claude/CLAUDE.md`) โดยต้องตอบโจทย์ SPEC.md ที่ห้าม QR ปลอม/โคลนไปจุดอื่น
- **Form validation & error UX** — ไม่ได้ถูกเลือกมาคุยในรอบนี้เช่นกัน (การนับตัวอักษร note, การบล็อก submit เมื่อไม่มีจุด, รูปแบบการแสดง error ของ QR ผิด) ปล่อยให้ planning ออกแบบตาม edge cases ที่ SPEC.md ระบุไว้แล้ว

## Deferred Ideas

None — discussion stayed within phase scope.
