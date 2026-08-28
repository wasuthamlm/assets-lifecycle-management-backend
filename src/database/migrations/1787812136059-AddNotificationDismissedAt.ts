import { MigrationInterface, QueryRunner } from "typeorm";

export class AddNotificationDismissedAt1787812136059 implements MigrationInterface {
    name = 'AddNotificationDismissedAt1787812136059'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "notifications" ADD "dismissed_at" TIMESTAMP`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN "dismissed_at"`);
    }

}
