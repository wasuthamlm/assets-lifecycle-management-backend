import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * แยกคอลัมน์ brand_model (ยี่ห้อ+รุ่นรวมกันในช่องเดียว) เป็น brand / model แยกกัน
 * ข้อมูลเดิม: ย้ายทั้งค่าไปไว้ที่ brand ก่อน (ไม่มีทางแยกยี่ห้อ/รุ่นจาก free-text เดิมได้แม่นยำ)
 * ผู้ดูแลระบบต้องไปแก้ไข model ของทรัพย์สินเก่าเพิ่มเติมเองทีหลัง
 */
export class SplitAssetBrandModel1787000000003 implements MigrationInterface {
    name = 'SplitAssetBrandModel1787000000003'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "assets" ADD "brand" character varying`);
        await queryRunner.query(`ALTER TABLE "assets" ADD "model" character varying`);
        await queryRunner.query(`UPDATE "assets" SET "brand" = "brand_model" WHERE "brand_model" IS NOT NULL`);
        await queryRunner.query(`ALTER TABLE "assets" DROP COLUMN "brand_model"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "assets" ADD "brand_model" character varying`);
        await queryRunner.query(`UPDATE "assets" SET "brand_model" = TRIM(BOTH ' ' FROM CONCAT(COALESCE("brand", ''), ' ', COALESCE("model", '')))`);
        await queryRunner.query(`ALTER TABLE "assets" DROP COLUMN "model"`);
        await queryRunner.query(`ALTER TABLE "assets" DROP COLUMN "brand"`);
    }

}
