# TREND F1RST

จอทีวีแสดงเทรนด์ไทย 75% / ต่างประเทศ 25% จาก Google, X, YouTube, Pantip, Blognone, Apple Music
พร้อม YouTube, สภาพอากาศ/ฝุ่น PM2.5 และสไลด์ข่าวสาร

เปิดบนทีวี: https://support-datafirst.github.io/TREND-F1RST/

## แก้เนื้อหาฝั่งซ้าย (แก้บนเว็บ GitHub ได้เลย ทีวีเปลี่ยนตามภายใน ~10 นาที ไม่ต้องรีเฟรช)

| อยากเปลี่ยน | ทำที่ |
|---|---|
| วิดีโอ YouTube | แก้ `"youtube"` ใน [config.json](config.json) วางลิงก์ได้ทั้งคลิป, ไลฟ์ หรือ playlist (เล่นแบบปิดเสียง วนซ้ำ) |
| สไลด์ข่าวสาร | อัปโหลดรูป 16:9 (1920×1080, jpg/png) เข้าโฟลเดอร์ [slides/](slides) เรียงตามชื่อไฟล์ ลบไฟล์เพื่อเอาออก |
| เวลาต่อสไลด์ | `"slideSeconds"` ใน config.json |
| พิกัดอากาศ/ฝุ่น | `"location"` ใน config.json (ใช้สถานี Air4Thai ที่ใกล้ที่สุด) |
| ความถี่ดึงเทรนด์ | `"apiMinutes"` ใน config.json (ค่าเริ่มต้น 180 = ทุก 3 ชม.) |

## ปรับหน้าจอผ่าน URL

`?rows=5&cols=3&speed=5&swap=3` = กริดเทรนด์ 5×3 เปลี่ยนการ์ดทีละ 3 ใบทุก 5 วินาที

## เบื้องหลัง

- **ข้อมูลสด** (เทรนด์ อากาศ ฝุ่น ห้องในออฟฟิศ): หน้าเว็บยิงไปที่ Google Apps Script web app (`"api"` ใน config.json) ทุก `apiMinutes`
  โค้ดอยู่ที่ [gas/Code.gs](gas/Code.gs) · คีย์ YouTube อยู่ใน Script Properties ชื่อ `YT_API_KEY`
  เปิด URL ของ API ในเบราว์เซอร์จะเห็น `"log"` บอกว่าแหล่งไหนดึงได้ (✓) หรือพัง (✗)
- **แก้ gas/Code.gs แล้ว:** วางโค้ดใหม่ใน Apps Script → Deploy → Manage deployments → ✏️ → Version: New version (URL เดิม)
- **YouTube และสไลด์:** GitHub Actions รัน `site.js` เมื่อแก้ config.json หรือ slides/ แล้วเขียน `site.json`
- ทดสอบ: `node gas/test.js --check` · `node gas/test.js` (ดึงจริง) · `node site.js --check`
