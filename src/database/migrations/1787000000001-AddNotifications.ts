import { MigrationInterface, QueryRunner } from "typeorm";

export class AddNotifications1787000000001 implements MigrationInterface {
    name = 'AddNotifications1787000000001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."notifications_type_enum" AS ENUM('requisition_pending_approval', 'requisition_approved', 'requisition_rejected', 'warranty_expiring', 'assignment_overdue')`);
        await queryRunner.query(`CREATE TABLE "notifications" ("notification_id" SERIAL NOT NULL, "recipient_employee_id" integer NOT NULL, "type" "public"."notifications_type_enum" NOT NULL, "title" character varying NOT NULL, "message" text NOT NULL, "reference_type" character varying, "reference_id" integer, "is_read" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_notifications_notification_id" PRIMARY KEY ("notification_id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_notifications_recipient" ON "notifications" ("recipient_employee_id", "is_read")`);
        await queryRunner.query(`ALTER TABLE "notifications" ADD CONSTRAINT "FK_notifications_recipient_employee_id" FOREIGN KEY ("recipient_employee_id") REFERENCES "employees"("employee_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "notifications" DROP CONSTRAINT "FK_notifications_recipient_employee_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_notifications_recipient"`);
        await queryRunner.query(`DROP TABLE "notifications"`);
        await queryRunner.query(`DROP TYPE "public"."notifications_type_enum"`);
    }

}
