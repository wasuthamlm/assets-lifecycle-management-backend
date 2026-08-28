import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPermissionsUpdatedNotificationType1787814592296 implements MigrationInterface {
    name = 'AddPermissionsUpdatedNotificationType1787814592296'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TYPE "public"."notifications_type_enum" ADD VALUE IF NOT EXISTS 'permissions_updated'`);
    }

    // Postgres ไม่รองรับ DROP VALUE ออกจาก enum โดยตรง (ต้องสร้าง type ใหม่ทั้งอันแล้ว migrate column)
    public async down(): Promise<void> {}

}
