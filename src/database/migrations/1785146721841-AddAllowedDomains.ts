import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAllowedDomains1785146721841 implements MigrationInterface {
    name = 'AddAllowedDomains1785146721841'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "allowed_domains" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP DEFAULT now(), "allowed_domain_id" SERIAL NOT NULL, "domain" character varying NOT NULL, "company_id" integer, "is_enabled" boolean NOT NULL DEFAULT true, CONSTRAINT "UQ_86b4911fa565246f2094cda75c7" UNIQUE ("domain"), CONSTRAINT "PK_1f709598f1eddf8d0bd89132089" PRIMARY KEY ("allowed_domain_id")); COMMENT ON COLUMN "allowed_domains"."domain" IS 'เช่น millimedthailand.com (ไม่รวม @)'`);
        await queryRunner.query(`ALTER TABLE "allowed_domains" ADD CONSTRAINT "FK_3a8bd632e54b50f608964e6a37f" FOREIGN KEY ("company_id") REFERENCES "companies"("company_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "allowed_domains" DROP CONSTRAINT "FK_3a8bd632e54b50f608964e6a37f"`);
        await queryRunner.query(`DROP TABLE "allowed_domains"`);
    }

}
