import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * - line_link_codes / line_link_attempts: ย้ายรหัสผูก LINE 6 หลักจากหน่วยความจำมาไว้ใน DB
 *   (เว็บขอรหัสจาก process หนึ่ง แต่ webhook เข้าอีก process → รหัส "ไม่ถูกต้อง" ทั้งที่ยังไม่หมดอายุ)
 * - requisitions.source: ใบขอที่ส่งมาจากแชท LINE — ใช้ตัดสินว่าจะ push แจ้งผู้อนุมัติ/ผู้ขอทาง LINE ไหม
 *   (ใบเดิมทั้งหมดเป็น 'web' ผ่าน DEFAULT)
 */
export class LineLinkCodesAndRequisitionSource1789200000000 implements MigrationInterface {
    name = 'LineLinkCodesAndRequisitionSource1789200000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "line_link_codes" ("code" character varying(6) NOT NULL, "employee_id" integer NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_line_link_codes" PRIMARY KEY ("code"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_line_link_codes_employee_id" ON "line_link_codes" ("employee_id") `);
        await queryRunner.query(`ALTER TABLE "line_link_codes" ADD CONSTRAINT "FK_line_link_codes_employee" FOREIGN KEY ("employee_id") REFERENCES "employees"("employee_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`CREATE TABLE "line_link_attempts" ("line_user_id" character varying(64) NOT NULL, "failed_count" integer NOT NULL DEFAULT 0, "reset_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_line_link_attempts" PRIMARY KEY ("line_user_id"))`);
        await queryRunner.query(`CREATE TYPE "public"."requisitions_source_enum" AS ENUM('web', 'line')`);
        await queryRunner.query(`ALTER TABLE "requisitions" ADD "source" "public"."requisitions_source_enum" NOT NULL DEFAULT 'web'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "requisitions" DROP COLUMN "source"`);
        await queryRunner.query(`DROP TYPE "public"."requisitions_source_enum"`);
        await queryRunner.query(`DROP TABLE "line_link_attempts"`);
        await queryRunner.query(`ALTER TABLE "line_link_codes" DROP CONSTRAINT "FK_line_link_codes_employee"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_line_link_codes_employee_id"`);
        await queryRunner.query(`DROP TABLE "line_link_codes"`);
    }

}
