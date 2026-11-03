# TREND F1RST

จอทีวีแสดงเทรนด์ไทย 75% / ต่างประเทศ 25% จาก Google, X, YouTube, Pantip, Blognone, Apple Music
พร้อม YouTube, สภาพอากาศ/ฝุ่น PM2.5 และสไลด์ข่าวสาร

เปิดบนทีวี: https://support-datafirst.github.io/TREND-F1RST/

## แก้เนื้อหาฝั่งซ้าย (แก้บนเว็บ GitHub ได้เลย ทีวีเปลี่ยนตามภายใน ~10 นาที ไม่ต้องรีเฟรช)

| อยากเปลี่ยน | ทำที่ |
|---|---|
| วิดีโอ YouTube | แก้ `"youtube"` ใน [config.json](config.json) วางลิงก์ได้ทั้งคลิป, ไลฟ์ หรือ playlist (เล่นแบบปิดเสียง วนซ้ำ) |
| ประกาศด่วน (แทนวิดีโอมุมบนซ้าย) | อัปโหลดรูปเข้าโฟลเดอร์ [notice/](notice) · ใส่วันหมดอายุในชื่อไฟล์ เช่น `ประกาศ-until-2026-11-08-1700.jpg` (เวลาไทย, ไม่ใส่เวลา = ถึง 23:59) แล้วประกาศจะหายเอง · ไม่ใส่วันที่ = แสดงจนกว่าจะลบไฟล์ |
| สไลด์ข่าวสาร | อัปโหลดรูป 16:9 (1920×1080, jpg/png) เข้าโฟลเดอร์ [slides/](slides) เรียงตามชื่อไฟล์ ลบไฟล์เพื่อเอาออก |
| เวลาต่อสไลด์ | `"slideSeconds"` ใน config.json |
| พิกัดอากาศ/ฝุ่น | `"location"` ใน config.json (ใช้สถานี Air4Thai ที่ใกล้ที่สุด) |
| ความถี่ดึงเทรนด์ | `"apiMinutes"` ใน config.json (ค่าเริ่มต้น 180 = ทุก 3 ชม.) |

## ปรับหน้าจอผ่าน URL

`?rows=5&cols=3&speed=5` = กริดเทรนด์ 5×3 สุ่มเปลี่ยนการ์ด 3–5 ใบทุก 5 วินาที (ใส่ `&swap=3` ถ้าอยากให้เปลี่ยนเท่ากันทุกรอบ)
`&every=12` = ทุก 12 รอบที่เปลี่ยนการ์ด จะขึ้นการ์ดใหญ่ Top (Google → X → YouTube) ค้าง 30 วินาที

## คลิกบน header

- **TREND F1RST** = ดึงข้อมูลใหม่ทันที (มีวงกลมหมุนหน้าคำว่า อัปเดต)
- **เทรนด์ตอนนี้** = แสดงการ์ดใหญ่ Top ทันที / คลิกอีกครั้งเพื่อข้ามไปการ์ดถัดไป

## เบื้องหลัง

- **ข้อมูลสด** (เทรนด์ อากาศ ฝุ่น ห้องในออฟฟิศ): หน้าเว็บยิงไปที่ Google Apps Script web app (`"api"` ใน config.json) ทุก `apiMinutes`
  โค้ดอยู่ที่ [gas/Code.gs](gas/Code.gs) · คีย์ YouTube อยู่ใน Script Properties ชื่อ `YT_API_KEY`
  เปิด URL ของ API ในเบราว์เซอร์จะเห็น `"log"` บอกว่าแหล่งไหนดึงได้ (✓) หรือพัง (✗)
- **แก้ gas/Code.gs แล้ว:** วางโค้ดใหม่ใน Apps Script → Deploy → Manage deployments → ✏️ → Version: New version (URL เดิม)
- **YouTube และสไลด์:** GitHub Actions รัน `site.js` เมื่อแก้ config.json หรือ slides/ แล้วเขียน `site.json`
- ทดสอบ: `node gas/test.js --check` · `node gas/test.js` (ดึงจริง) · `node site.js --check`
