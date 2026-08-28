import { MigrationInterface, QueryRunner } from "typeorm";

export class AddEmployeeProfileCompletedNotificationType1787811677468 implements MigrationInterface {
    name = 'AddEmployeeProfileCompletedNotificationType1787811677468'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TYPE "public"."notifications_type_enum" ADD VALUE IF NOT EXISTS 'employee_profile_completed'`);
    }

    // Postgres ไม่รองรับ DROP VALUE ออกจาก enum โดยตรง (ต้องสร้าง type ใหม่ทั้งอันแล้ว migrate column)
    // ปล่อยว่างไว้ — ถ้าต้อง revert จริงๆ ให้จัดการ manual แทน
    public async down(): Promise<void> {}

}
