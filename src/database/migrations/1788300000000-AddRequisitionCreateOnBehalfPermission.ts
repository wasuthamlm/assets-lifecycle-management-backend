import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * แยกสิทธิ์ "เบิก/ยืมให้พนักงานคนอื่น" ออกจาก requisition.view_all — เดิมผูกกันอยู่ ทำให้ role ไหนได้สิทธิ์ดูใบขอ
 * ทั้งหมดก็เบิกแทนคนอื่นได้ไปด้วยโดยไม่ตั้งใจ ตอนนี้ให้เฉพาะ hr / it_admin (พนักงานทั่วไปเบิกได้แค่ให้ตัวเอง)
 */
export class AddRequisitionCreateOnBehalfPermission1788300000000 implements MigrationInterface {
    name = 'AddRequisitionCreateOnBehalfPermission1788300000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`INSERT INTO "permissions" ("permission_code", "description") VALUES ('requisition.create_on_behalf', 'เบิก/ยืมให้พนักงานคนอื่น (รวมพนักงานใหม่)') ON CONFLICT ("permission_code") DO NOTHING`);
        await queryRunner.query(`INSERT INTO "role_permissions" ("role_id", "permission_id") SELECT r."role_id", p."permission_id" FROM "roles" r CROSS JOIN "permissions" p WHERE r."role_name" IN ('hr', 'it_admin') AND p."permission_code" = 'requisition.create_on_behalf' ON CONFLICT DO NOTHING`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // role_permissions ลบตามด้วย ON DELETE CASCADE
        await queryRunner.query(`DELETE FROM "permissions" WHERE "permission_code" = 'requisition.create_on_behalf'`);
    }

}
