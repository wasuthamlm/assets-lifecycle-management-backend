import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * อุปกรณ์ที่มีปัญหาพิมพ์เองได้ — เช่น เครื่องพิมพ์ส่วนกลาง หรือของที่ไม่ได้เบิก/ยืมผ่านระบบ
 * ถ้าเลือกจากของที่ถือ/ยืมอยู่ จะใช้ asset_id เหมือนเดิม และช่องนี้เป็น NULL
 */
export class AddSupportTicketAssetText1789000000000 implements MigrationInterface {
    name = 'AddSupportTicketAssetText1789000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "support_tickets" ADD "asset_text" character varying(200)`);
        await queryRunner.query(`COMMENT ON COLUMN "support_tickets"."asset_text" IS 'ชื่ออุปกรณ์ที่ผู้แจ้งพิมพ์เอง (ไม่ได้เลือกจากของที่ถือ/ยืมอยู่)'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "support_tickets" DROP COLUMN "asset_text"`);
    }

}
