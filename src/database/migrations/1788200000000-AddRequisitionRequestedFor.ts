import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRequisitionRequestedFor1788200000000 implements MigrationInterface {
    name = 'AddRequisitionRequestedFor1788200000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "requisitions" ADD "requested_for" integer`);
        await queryRunner.query(`CREATE INDEX "IDX_requisitions_requested_for" ON "requisitions" ("requested_for") `);
        await queryRunner.query(`ALTER TABLE "requisitions" ADD CONSTRAINT "FK_requisitions_requested_for" FOREIGN KEY ("requested_for") REFERENCES "employees"("employee_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "requisitions" DROP CONSTRAINT "FK_requisitions_requested_for"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_requisitions_requested_for"`);
        await queryRunner.query(`ALTER TABLE "requisitions" DROP COLUMN "requested_for"`);
    }

}
