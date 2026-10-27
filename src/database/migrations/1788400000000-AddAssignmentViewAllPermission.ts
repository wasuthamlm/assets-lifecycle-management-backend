import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * สิทธิ์ดูประวัติการเบิก-จ่าย/รับคืนทั้งหมดของทุกคน (หน้า /assignments) — แยกจาก assignment.return
 * เพราะ HR ต้องดูประวัติได้ แต่ไม่ได้เป็นคนรับคืนของ ให้เฉพาะ hr / it_admin
 */
export class AddAssignmentViewAllPermission1788400000000 implements MigrationInterface {
    name = 'AddAssignmentViewAllPermission1788400000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`INSERT INTO "permissions" ("permission_code", "description") VALUES ('assignment.view_all', 'ดูประวัติการเบิก-จ่าย/รับคืนทั้งหมด') ON CONFLICT ("permission_code") DO NOTHING`);
        await queryRunner.query(`INSERT INTO "role_permissions" ("role_id", "permission_id") SELECT r."role_id", p."permission_id" FROM "roles" r CROSS JOIN "permissions" p WHERE r."role_name" IN ('hr', 'it_admin') AND p."permission_code" = 'assignment.view_all' ON CONFLICT DO NOTHING`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // role_permissions ลบตามด้วย ON DELETE CASCADE
        await queryRunner.query(`DELETE FROM "permissions" WHERE "permission_code" = 'assignment.view_all'`);
    }

}
