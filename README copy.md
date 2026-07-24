# IT Asset Lifecycle Management — Backend

NestJS + PostgreSQL + TypeORM backend สำหรับระบบทรัพย์สิน IT
ครอบคลุม: ซื้อ → รับของ → เบิก/ยืม → ส่งมอบ/รับคืน → ซ่อม → ประกัน → จำหน่ายทิ้ง

> ✅ โปรเจกต์นี้ผ่านการทดสอบจริงแล้ว: build สำเร็จ, migration รันขึ้น/ลงได้ (verified กับ Postgres จริง),
> seed script รันได้, boot server และยิง login/CRUD endpoint จริงได้ผลลัพธ์ถูกต้อง

## เริ่มต้นใช้งาน

```bash
npm install
cp .env.example .env
# แก้ .env ให้ตรงกับ Postgres ของคุณ (DB_HOST, DB_USERNAME, DB_PASSWORD, DB_DATABASE)

createdb it_asset_management   # หรือสร้างผ่าน psql/GUI

npm run migration:run   # สร้างตารางทั้งหมด (27 ตาราง)
npm run seed             # seed permissions/roles/company/admin user

npm run start:dev        # http://localhost:3000/api/v1
# Swagger docs: http://localhost:3000/api/docs
```

**Login เริ่มต้นจาก seed:** `admin` / `Admin@12345` (⚠️ เปลี่ยนรหัสผ่านทันทีในระบบจริง)

## คำสั่งที่ใช้บ่อย

| คำสั่ง | ใช้ทำอะไร |
|---|---|
| `npm run start:dev` | รัน dev server พร้อม watch mode |
| `npm run build` | compile TypeScript → `dist/` |
| `npm run migration:generate -- src/database/migrations/ชื่อ` | generate migration ใหม่จาก entity ที่แก้ |
| `npm run migration:run` | apply migration ที่ยังไม่รัน |
| `npm run migration:revert` | ย้อน migration ล่าสุด 1 ขั้น |
| `npm run seed` | seed ข้อมูลเริ่มต้น (rerun ได้ปลอดภัย) |

## โครงสร้างโปรเจกต์

แบ่งแบบ **feature module** (1 module ต่อ 1 โดเมนธุรกิจ) — ดูรายละเอียดเต็มใน `PROJECT_STRUCTURE.md`

```
src/
├── common/         # decorator, guard, filter, enum กลาง — ใช้ร่วมกันทุก module
├── config/         # typeorm datasource config (ใช้ร่วมกันทั้ง runtime และ CLI)
├── database/
│   ├── migrations/ # migration ที่ generate จาก entity จริง (verified แล้ว)
│   └── seeds/      # seed script
└── modules/        # 20 feature module (ดูรายชื่อด้านล่าง)
```

### รายชื่อ module (20)

| Module | หน้าที่ |
|---|---|
| `auth` | login, JWT access/refresh token |
| `users` | บัญชี login (แยกจาก employees) |
| `companies`, `departments`, `employees` | master data องค์กร |
| `roles-permissions` | RBAC — role, permission, mapping |
| `vendors`, `locations`, `asset-categories` | master data อื่นๆ |
| `assets` | ทรัพย์สินแบบ serialized (มี polymorphic holder) |
| `stock` | ของ consumable/bulk (stock item + level) |
| `purchasing` | ใบสั่งซื้อ (PO) |
| `goods-receipt` | รับของเข้าคลัง (ผูก assets/stock/movements/PO อัตโนมัติ) |
| `requisitions` | ใบขอเบิก/ยืม พร้อม multi-level approval |
| `assignments` | ส่งมอบ/รับคืนทรัพย์สิน |
| `movements` | audit trail กลาง (append-only) |
| `repairs`, `warranty`, `disposal` | ซ่อม / ประกัน / จำหน่ายทิ้ง |
| `attachments` | ไฟล์แนบ (polymorphic) |

## ⚠️ หมายเหตุสำคัญ

ไฟล์ DBML ต้นฉบับที่ให้มาถูกตัดจบที่ตาราง `goods_receipt_items` แต่มี enum ประกาศไว้ล่วงหน้าสำหรับ
`requisitions`, `assignments`, `movements`, `repairs`, `warranty`, `disposal` — entity ของตารางเหล่านี้
จึงถูกออกแบบขึ้นจาก enum + Note ต้นไฟล์ (ไม่ใช่จาก DBML ที่ระบุ schema ตรงๆ) ทุกไฟล์ที่เป็นสมมติฐาน
มีคอมเมนต์ ⚠️ กำกับไว้ในโค้ดชัดเจน — แนะนำให้ตรวจทานกับ DBML ฉบับเต็มก่อนใช้งานจริง

ตารางเพิ่มเติมที่ไม่ได้อยู่ใน DBML แต่จำเป็นต่อระบบ auth: `users` และ `attachments`
