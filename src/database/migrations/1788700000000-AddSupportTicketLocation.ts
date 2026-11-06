import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * สถานที่ของ ticket แจ้งปัญหา IT — ทีม IT จะได้รู้ว่าต้องเดินไปห้องไหน ชั้นไหน
 * location_detail บังคับกรอก: ใส่ DEFAULT '' ชั่วคราวให้แถวเดิม (ถ้ามี) ผ่าน NOT NULL แล้วถอด default ออก
 */
export class AddSupportTicketLocation1788700000000 implements MigrationInterface {
    name = 'AddSupportTicketLocation1788700000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "support_tickets" ADD "location_id" integer`);
        await queryRunner.query(`ALTER TABLE "support_tickets" ADD "location_detail" character varying NOT NULL DEFAULT ''`);
        await queryRunner.query(`ALTER TABLE "support_tickets" ALTER COLUMN "location_detail" DROP DEFAULT`);
        await queryRunner.query(`COMMENT ON COLUMN "support_tickets"."location_detail" IS 'ชั้น/ห้อง/โต๊ะ ที่ทีม IT ต้องเดินไป'`);
        await queryRunner.query(`ALTER TABLE "support_tickets" ADD CONSTRAINT "FK_support_tickets_location_id" FOREIGN KEY ("location_id") REFERENCES "locations"("location_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "support_tickets" DROP CONSTRAINT "FK_support_tickets_location_id"`);
        await queryRunner.query(`ALTER TABLE "support_tickets" DROP COLUMN "location_detail"`);
        await queryRunner.query(`ALTER TABLE "support_tickets" DROP COLUMN "location_id"`);
    }

}
