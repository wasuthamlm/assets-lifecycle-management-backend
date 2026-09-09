import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAssignmentIsLateReturn1787900000000 implements MigrationInterface {
    name = 'AddAssignmentIsLateReturn1787900000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "assignments" ADD "is_late_return" boolean NOT NULL DEFAULT false`);

        // backfill: ต่างจาก column ใหม่ทั่วไปที่ backfill ไม่ได้ — "ล่าช้าหรือไม่" ของ assignment ที่คืนไปแล้วก่อนหน้านี้
        // derive ได้ตรงๆ จาก returned_date/due_date ที่มีอยู่แล้ว
        await queryRunner.query(`
            UPDATE "assignments"
            SET "is_late_return" = true
            WHERE "due_date" IS NOT NULL
              AND "returned_date" IS NOT NULL
              AND "returned_date" > "due_date"
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "assignments" DROP COLUMN "is_late_return"`);
    }

}
