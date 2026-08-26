import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSupabaseAuthSupport1787722243781 implements MigrationInterface {
    name = 'AddSupabaseAuthSupport1787722243781'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "supabase_user_id" uuid`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "UQ_936242eb49f7a22473149590995" UNIQUE ("supabase_user_id")`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "password_hash" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "UQ_936242eb49f7a22473149590995"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "supabase_user_id"`);
    }

}
