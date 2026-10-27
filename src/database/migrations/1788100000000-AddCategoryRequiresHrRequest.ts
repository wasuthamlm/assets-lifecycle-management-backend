import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCategoryRequiresHrRequest1788100000000 implements MigrationInterface {
    name = 'AddCategoryRequiresHrRequest1788100000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "asset_categories" ADD "requires_hr_request" boolean NOT NULL DEFAULT false`);
        // ตั้งค่าเริ่มต้นให้หมวด notebook / tablet ที่มีอยู่แล้ว — แอดมินปรับเพิ่ม/ลดเองได้ที่หน้าตั้งค่าหมวดหมู่
        await queryRunner.query(`UPDATE "asset_categories" SET "requires_hr_request" = true WHERE "category_name" ILIKE '%notebook%' OR "category_name" ILIKE '%laptop%' OR "category_name" ILIKE '%tablet%'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "asset_categories" DROP COLUMN "requires_hr_request"`);
    }

}
