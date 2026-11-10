import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * รหัสพนักงานไม่บังคับแล้ว — user ที่ login ผ่าน Microsoft SSO (อีเมลบริษัท) ครั้งแรกกรอกโปรไฟล์ได้โดยยังไม่ต้องรู้รหัส
 * HR ค่อยเติมให้ทีหลังผ่านหน้าพนักงาน ส่วน UNIQUE ยังอยู่ (Postgres ให้ NULL ซ้ำกันได้)
 * down จะล้มถ้ามีแถวที่ยังไม่มีรหัส — ต้องเติมรหัสให้ครบก่อน
 */
export class MakeEmployeeCodeNullable1788900000000 implements MigrationInterface {
    name = 'MakeEmployeeCodeNullable1788900000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "employees" ALTER COLUMN "employee_code" DROP NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "employees" ALTER COLUMN "employee_code" SET NOT NULL`);
    }
}
