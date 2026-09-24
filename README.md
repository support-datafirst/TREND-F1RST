# TREND F1RST

จอทีวีแสดงเทรนด์ไทย 75% / ต่างประเทศ 25% จาก Google, X, YouTube, Pantip, Wikipedia, Apple Music, Hacker News
พร้อม YouTube, สภาพอากาศ/ฝุ่น PM2.5 และสไลด์ข่าวสาร

เปิดบนทีวี: https://support-datafirst.github.io/TREND-F1RST/

## แก้เนื้อหาฝั่งซ้าย (แก้บนเว็บ GitHub ได้เลย ทีวีเปลี่ยนตามภายใน ~5 นาที ไม่ต้องรีเฟรช)

| อยากเปลี่ยน | ทำที่ |
|---|---|
| วิดีโอ YouTube | แก้ `"youtube"` ใน [config.json](config.json) วางลิงก์ได้ทั้งคลิป, ไลฟ์ หรือ playlist (เล่นแบบปิดเสียง วนซ้ำ) |
| สไลด์ข่าวสาร | อัปโหลดรูป 16:9 (1920×1080, jpg/png) เข้าโฟลเดอร์ [slides/](slides) เรียงตามชื่อไฟล์ ลบไฟล์เพื่อเอาออก |
| เวลาต่อสไลด์ | `"slideSeconds"` ใน config.json |
| พิกัดอากาศ/ฝุ่น | `"location"` ใน config.json (ใช้สถานี Air4Thai ที่ใกล้ที่สุด) |

## ปรับหน้าจอผ่าน URL

`?rows=5&cols=3&speed=5&swap=3` = กริดเทรนด์ 5×3 เปลี่ยนการ์ดทีละ 3 ใบทุก 5 วินาที

## เบื้องหลัง

`fetch.js` รันบน GitHub Actions ทุก 30 นาที (และทุกครั้งที่แก้ config.json / slides) แล้วเขียน `trends.json`
คีย์ YouTube อยู่ใน Settings → Secrets → Actions ชื่อ `YT_API_KEY` · ทดสอบ: `node fetch.js --check`
