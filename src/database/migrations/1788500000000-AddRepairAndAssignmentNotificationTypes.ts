import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * ชนิดแจ้งเตือนใหม่: แจ้งซ่อม (ถึงผู้มีสิทธิ์ repair.update), สถานะงานซ่อมเปลี่ยน (ถึงผู้แจ้งซ่อม),
 * เบิก-จ่าย/รับคืนด้วยมือผ่านหน้า /assignments (ถึงผู้ถือครอง)
 */
export class AddRepairAndAssignmentNotificationTypes1788500000000 implements MigrationInterface {
    name = 'AddRepairAndAssignmentNotificationTypes1788500000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TYPE "public"."notifications_type_enum" ADD VALUE IF NOT EXISTS 'repair_reported'`);
        await queryRunner.query(`ALTER TYPE "public"."notifications_type_enum" ADD VALUE IF NOT EXISTS 'repair_status_updated'`);
        await queryRunner.query(`ALTER TYPE "public"."notifications_type_enum" ADD VALUE IF NOT EXISTS 'assignment_issued'`);
        await queryRunner.query(`ALTER TYPE "public"."notifications_type_enum" ADD VALUE IF NOT EXISTS 'assignment_returned'`);
    }

    // Postgres ไม่รองรับ DROP VALUE ออกจาก enum โดยตรง (ต้องสร้าง type ใหม่ทั้งอันแล้ว migrate column)
    public async down(): Promise<void> {}

}
