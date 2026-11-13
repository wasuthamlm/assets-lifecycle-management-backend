import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * line_chat_sessions: แจ้งปัญหาทาง LINE แบบทีละขั้น (ประเภท → อาการ → สถานที่ → ยืนยัน)
 * แทนแบบเดิมที่ข้อความอะไรก็ตามกลายเป็น ticket — ดู LineTicketFlowService
 */
export class LineChatSessions1789300000000 implements MigrationInterface {
    name = 'LineChatSessions1789300000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "line_chat_sessions" ("line_user_id" character varying(64) NOT NULL, "flow" character varying(20) NOT NULL, "step" character varying(20) NOT NULL, "data" jsonb NOT NULL DEFAULT '{}', "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_line_chat_sessions" PRIMARY KEY ("line_user_id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "line_chat_sessions"`);
    }
}
