import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAssetSerialNumberUnique1787817375777 implements MigrationInterface {
    name = 'AddAssetSerialNumberUnique1787817375777'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_9da03d06e2af9f607159e88426"`);
        await queryRunner.query(`ALTER TABLE "assets" ADD CONSTRAINT "UQ_assets_serial_number" UNIQUE ("serial_number")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "assets" DROP CONSTRAINT "UQ_assets_serial_number"`);
        await queryRunner.query(`CREATE INDEX "IDX_9da03d06e2af9f607159e88426" ON "assets" ("serial_number")`);
    }

}
