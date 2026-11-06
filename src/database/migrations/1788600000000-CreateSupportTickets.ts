import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * ระบบแจ้งปัญหา IT Support (support_tickets) + สิทธิ์ + ชนิดแจ้งเตือน
 * - employee: ticket.create, ticket.view_own (แจ้ง + ดูประวัติของตัวเอง)
 * - hr: ticket.create, ticket.view_own, ticket.view_all (ดูของทุกคนได้ แต่แก้ไม่ได้)
 * - it_admin: ทุกสิทธิ์ รวม ticket.manage
 */
export class CreateSupportTickets1788600000000 implements MigrationInterface {
    name = 'CreateSupportTickets1788600000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."support_tickets_category_enum" AS ENUM('hardware', 'accessory', 'software', 'network', 'account', 'other')`);
        await queryRunner.query(`CREATE TYPE "public"."support_tickets_priority_enum" AS ENUM('low', 'normal', 'high', 'urgent')`);
        await queryRunner.query(`CREATE TYPE "public"."support_tickets_status_enum" AS ENUM('open', 'in_progress', 'waiting_user', 'resolved', 'closed', 'cancelled')`);
        await queryRunner.query(`CREATE TABLE "support_tickets" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP DEFAULT now(), "ticket_id" SERIAL NOT NULL, "ticket_no" character varying NOT NULL, "reported_by" integer NOT NULL, "reporter_info" jsonb NOT NULL, "category" "public"."support_tickets_category_enum" NOT NULL, "subject" character varying NOT NULL, "description" text, "priority" "public"."support_tickets_priority_enum" NOT NULL DEFAULT 'normal', "asset_id" integer, "assignment_id" integer, "status" "public"."support_tickets_status_enum" NOT NULL DEFAULT 'open', "assigned_to" integer, "repair_id" integer, "resolution" text, "resolved_at" TIMESTAMP, "closed_at" TIMESTAMP, CONSTRAINT "UQ_support_tickets_ticket_no" UNIQUE ("ticket_no"), CONSTRAINT "PK_support_tickets" PRIMARY KEY ("ticket_id"))`);
        await queryRunner.query(`COMMENT ON COLUMN "support_tickets"."assignment_id" IS 'การเบิก/ยืมที่ผู้แจ้งถืออยู่ตอนแจ้ง (เช่น ยืมสาย HDMI แล้วใช้ไม่ได้)'`);
        await queryRunner.query(`COMMENT ON COLUMN "support_tickets"."assigned_to" IS 'เจ้าหน้าที่ IT ที่รับงาน'`);
        await queryRunner.query(`COMMENT ON COLUMN "support_tickets"."repair_id" IS 'งานซ่อมที่สร้างจาก ticket นี้ (กด "ส่งซ่อม")'`);
        await queryRunner.query(`CREATE INDEX "IDX_support_tickets_reported_by" ON "support_tickets" ("reported_by")`);
        await queryRunner.query(`CREATE INDEX "IDX_support_tickets_asset_id" ON "support_tickets" ("asset_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_support_tickets_status" ON "support_tickets" ("status")`);
        await queryRunner.query(`ALTER TABLE "support_tickets" ADD CONSTRAINT "FK_support_tickets_reported_by" FOREIGN KEY ("reported_by") REFERENCES "employees"("employee_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "support_tickets" ADD CONSTRAINT "FK_support_tickets_asset_id" FOREIGN KEY ("asset_id") REFERENCES "assets"("asset_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "support_tickets" ADD CONSTRAINT "FK_support_tickets_assignment_id" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("assignment_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "support_tickets" ADD CONSTRAINT "FK_support_tickets_assigned_to" FOREIGN KEY ("assigned_to") REFERENCES "employees"("employee_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "support_tickets" ADD CONSTRAINT "FK_support_tickets_repair_id" FOREIGN KEY ("repair_id") REFERENCES "repairs"("repair_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);

        await queryRunner.query(`INSERT INTO "permissions" ("permission_code", "description") VALUES
            ('ticket.create', 'แจ้งปัญหา IT Support'),
            ('ticket.view_own', 'ดูประวัติการแจ้งปัญหา IT ของตัวเอง'),
            ('ticket.view_all', 'ดู ticket แจ้งปัญหา IT ทั้งหมด'),
            ('ticket.manage', 'รับงาน/เปลี่ยนสถานะ/ส่งซ่อม ticket แจ้งปัญหา IT')
            ON CONFLICT ("permission_code") DO NOTHING`);
        await queryRunner.query(`INSERT INTO "role_permissions" ("role_id", "permission_id") SELECT r."role_id", p."permission_id" FROM "roles" r CROSS JOIN "permissions" p WHERE r."role_name" IN ('employee', 'hr', 'it_admin') AND p."permission_code" IN ('ticket.create', 'ticket.view_own') ON CONFLICT DO NOTHING`);
        await queryRunner.query(`INSERT INTO "role_permissions" ("role_id", "permission_id") SELECT r."role_id", p."permission_id" FROM "roles" r CROSS JOIN "permissions" p WHERE r."role_name" IN ('hr', 'it_admin') AND p."permission_code" = 'ticket.view_all' ON CONFLICT DO NOTHING`);
        await queryRunner.query(`INSERT INTO "role_permissions" ("role_id", "permission_id") SELECT r."role_id", p."permission_id" FROM "roles" r CROSS JOIN "permissions" p WHERE r."role_name" = 'it_admin' AND p."permission_code" = 'ticket.manage' ON CONFLICT DO NOTHING`);

        await queryRunner.query(`ALTER TYPE "public"."notifications_type_enum" ADD VALUE IF NOT EXISTS 'ticket_created'`);
        await queryRunner.query(`ALTER TYPE "public"."notifications_type_enum" ADD VALUE IF NOT EXISTS 'ticket_status_updated'`);
    }

    // ค่าใน notifications_type_enum ไม่ลบ (Postgres ไม่รองรับ DROP VALUE) — role_permissions ลบตามด้วย ON DELETE CASCADE
    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DELETE FROM "permissions" WHERE "permission_code" IN ('ticket.create', 'ticket.view_own', 'ticket.view_all', 'ticket.manage')`);
        await queryRunner.query(`DROP TABLE "support_tickets"`);
        await queryRunner.query(`DROP TYPE "public"."support_tickets_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."support_tickets_priority_enum"`);
        await queryRunner.query(`DROP TYPE "public"."support_tickets_category_enum"`);
    }

}
