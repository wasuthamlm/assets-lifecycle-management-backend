import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRolePreassignments1788000000000 implements MigrationInterface {
    name = 'AddRolePreassignments1788000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "role_preassignments" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP DEFAULT now(), "role_preassignment_id" SERIAL NOT NULL, "email" character varying NOT NULL, "role_ids" integer array NOT NULL, "created_by_user_id" integer, CONSTRAINT "UQ_role_preassignments_email" UNIQUE ("email"), CONSTRAINT "PK_role_preassignments" PRIMARY KEY ("role_preassignment_id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "role_preassignments"`);
    }

}
