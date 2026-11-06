import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * เอาสถานะ waiting_user ออก — ผู้แจ้งตอบกลับในระบบไม่ได้อยู่แล้ว ถ้าต้องถามเพิ่ม IT โทรหาแล้วคงสถานะ in_progress ไว้
 * ticket ที่ค้างสถานะนี้ย้ายไปเป็น in_progress (down ไม่คืนแถวเหล่านี้กลับ เพราะแยกไม่ออกจาก in_progress เดิม)
 */
export class RemoveTicketWaitingUserStatus1788800000000 implements MigrationInterface {
    name = 'RemoveTicketWaitingUserStatus1788800000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`UPDATE "support_tickets" SET "status" = 'in_progress' WHERE "status" = 'waiting_user'`);
        await this.replaceStatusEnum(queryRunner, `'open', 'in_progress', 'resolved', 'closed', 'cancelled'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await this.replaceStatusEnum(queryRunner, `'open', 'in_progress', 'waiting_user', 'resolved', 'closed', 'cancelled'`);
    }

    private async replaceStatusEnum(queryRunner: QueryRunner, values: string): Promise<void> {
        await queryRunner.query(`ALTER TYPE "public"."support_tickets_status_enum" RENAME TO "support_tickets_status_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."support_tickets_status_enum" AS ENUM(${values})`);
        await queryRunner.query(`ALTER TABLE "support_tickets" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "support_tickets" ALTER COLUMN "status" TYPE "public"."support_tickets_status_enum" USING "status"::text::"public"."support_tickets_status_enum"`);
        await queryRunner.query(`ALTER TABLE "support_tickets" ALTER COLUMN "status" SET DEFAULT 'open'`);
        await queryRunner.query(`DROP TYPE "public"."support_tickets_status_enum_old"`);
    }
}
