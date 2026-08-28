import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserFullName1787801967132 implements MigrationInterface {
    name = 'AddUserFullName1787801967132'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "full_name" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "full_name"`);
    }

}
