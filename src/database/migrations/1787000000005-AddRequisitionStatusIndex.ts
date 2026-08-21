import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * รองรับ filter สถานะบนหน้า list ใบเบิก/ยืม (QueryRequisitionDto.status) ที่เพิ่งเพิ่ม —
 * ไม่มี index บนคอลัมน์นี้มาก่อน จะเริ่มเห็น sequential scan ชัดเจนขึ้นเมื่อข้อมูลเยอะขึ้น
 */
export class AddRequisitionStatusIndex1787000000005 implements MigrationInterface {
  name = 'AddRequisitionStatusIndex1787000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE INDEX "IDX_requisitions_overall_status" ON "requisitions" ("overall_status")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_requisitions_overall_status"`);
  }
}
