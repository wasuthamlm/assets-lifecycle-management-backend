import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRequisitionDocumentFields1787820000000 implements MigrationInterface {
    name = 'AddRequisitionDocumentFields1787820000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "requisitions" ADD "document_info" jsonb`);
        await queryRunner.query(`ALTER TABLE "requisition_items" ADD "note" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "requisition_items" DROP COLUMN "note"`);
        await queryRunner.query(`ALTER TABLE "requisitions" DROP COLUMN "document_info"`);
    }

}
