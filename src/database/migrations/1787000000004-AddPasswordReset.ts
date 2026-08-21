import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPasswordReset1787000000004 implements MigrationInterface {
    name = 'AddPasswordReset1787000000004'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "reset_password_token_hash" character varying`);
        await queryRunner.query(`ALTER TABLE "users" ADD "reset_password_expires_at" TIMESTAMP`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "reset_password_expires_at"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "reset_password_token_hash"`);
    }

}
