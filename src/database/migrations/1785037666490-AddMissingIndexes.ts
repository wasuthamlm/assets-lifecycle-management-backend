import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Postgres ไม่สร้าง index ให้ FK column อัตโนมัติ — คอลัมน์เหล่านี้ถูก query/filter บ่อย
 * (เช่น "ประวัติการเคลื่อนไหวของ asset ชิ้นนี้", "ทรัพย์สินที่พนักงานคนนี้ถือครองอยู่") แต่ไม่มี index เลย
 * จะเริ่มเห็นผลกระทบ (sequential scan) ชัดเจนขึ้นเมื่อข้อมูลเยอะขึ้น
 */
export class AddMissingIndexes1785037666490 implements MigrationInterface {
  name = 'AddMissingIndexes1785037666490';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE INDEX "IDX_employees_department_id" ON "employees" ("department_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_requisitions_requested_by" ON "requisitions" ("requested_by")`);
    await queryRunner.query(`CREATE INDEX "IDX_movements_asset_id" ON "movements" ("asset_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_movements_performed_by" ON "movements" ("performed_by")`);
    await queryRunner.query(`CREATE INDEX "IDX_assignments_asset_id" ON "assignments" ("asset_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_assignments_holder_type_holder_id" ON "assignments" ("holder_type", "holder_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_repairs_asset_id" ON "repairs" ("asset_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_warranties_asset_id" ON "warranties" ("asset_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_warranties_asset_id"`);
    await queryRunner.query(`DROP INDEX "IDX_repairs_asset_id"`);
    await queryRunner.query(`DROP INDEX "IDX_assignments_holder_type_holder_id"`);
    await queryRunner.query(`DROP INDEX "IDX_assignments_asset_id"`);
    await queryRunner.query(`DROP INDEX "IDX_movements_performed_by"`);
    await queryRunner.query(`DROP INDEX "IDX_movements_asset_id"`);
    await queryRunner.query(`DROP INDEX "IDX_requisitions_requested_by"`);
    await queryRunner.query(`DROP INDEX "IDX_employees_department_id"`);
  }
}
