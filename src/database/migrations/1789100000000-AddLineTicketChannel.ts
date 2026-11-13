import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * แจ้งปัญหา IT ผ่าน LINE (LIFF) — ดู modules/line
 * - support_tickets.source: ticket เดิมทั้งหมดเป็น 'web' ผ่าน DEFAULT
 * - employees.line_user_id: ผูกบัญชี LINE กับพนักงาน (1 LINE ต่อ 1 พนักงาน)
 */
export class AddLineTicketChannel1789100000000 implements MigrationInterface {
    name = 'AddLineTicketChannel1789100000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."support_tickets_source_enum" AS ENUM('web', 'line')`);
        await queryRunner.query(`ALTER TABLE "support_tickets" ADD "source" "public"."support_tickets_source_enum" NOT NULL DEFAULT 'web'`);
        await queryRunner.query(`CREATE INDEX "IDX_support_tickets_source" ON "support_tickets" ("source") `);
        await queryRunner.query(`ALTER TABLE "employees" ADD "line_user_id" character varying(64)`);
        await queryRunner.query(`ALTER TABLE "employees" ADD CONSTRAINT "UQ_4e516155661d68c29678cfddaef" UNIQUE ("line_user_id")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "employees" DROP CONSTRAINT "UQ_4e516155661d68c29678cfddaef"`);
        await queryRunner.query(`ALTER TABLE "employees" DROP COLUMN "line_user_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_support_tickets_source"`);
        await queryRunner.query(`ALTER TABLE "support_tickets" DROP COLUMN "source"`);
        await queryRunner.query(`DROP TYPE "public"."support_tickets_source_enum"`);
    }

}
