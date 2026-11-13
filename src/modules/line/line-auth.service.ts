import { Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const LINE_VERIFY_ID_TOKEN_URL = 'https://api.line.me/oauth2/v2.1/verify';

/**
 * ตรวจ LIFF ID token กับ LINE โดยตรง (ให้ LINE เป็นคน verify ลายเซ็น/วันหมดอายุ/audience เอง ไม่ต้องถือ secret)
 * ได้ `sub` = LINE userId ซึ่งคงที่ต่อ provider — ใช้เป็น key ผูกกับ employees.line_user_id
 */
@Injectable()
export class LineAuthService {
  private readonly logger = new Logger(LineAuthService.name);

  constructor(private config: ConfigService) {}

  get isEnabled(): boolean {
    return !!this.config.get<string>('LINE_LOGIN_CHANNEL_ID');
  }

  /** แชทบอทต้องมีทั้ง secret (ตรวจ webhook) และ access token (ตอบกลับ) — ไม่ขึ้นกับ LINE Login/LIFF */
  get isChatEnabled(): boolean {
    return !!this.channelSecret && !!this.config.get<string>('LINE_MESSAGING_ACCESS_TOKEN');
  }

  get channelSecret(): string | null {
    return this.config.get<string>('LINE_MESSAGING_CHANNEL_SECRET') || null;
  }

  /** ลิงก์เพิ่มเพื่อน OA จาก Basic ID (เช่น @123abcde) */
  get addFriendUrl(): string | null {
    const id = this.config.get<string>('LINE_OA_BASIC_ID')?.trim();
    if (!id) return null;
    return `https://line.me/R/ti/p/${encodeURIComponent(id.startsWith('@') ? id : `@${id}`)}`;
  }

  get liffId(): string | null {
    return this.config.get<string>('LINE_LIFF_ID') || null;
  }

  async verifyIdToken(idToken: string): Promise<string> {
    const channelId = this.config.get<string>('LINE_LOGIN_CHANNEL_ID');
    if (!channelId) throw new ServiceUnavailableException('ยังไม่ได้เปิดใช้งานการแจ้งปัญหาผ่าน LINE');

    let res: Response;
    try {
      res = await fetch(LINE_VERIFY_ID_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      this.logger.error(`เรียก LINE verify ไม่สำเร็จ: ${(err as Error).message}`);
      throw new ServiceUnavailableException('ติดต่อ LINE ไม่ได้ กรุณาลองใหม่อีกครั้ง');
    }

    // 400 = token หมดอายุ/ปลอม/ไม่ได้ออกให้ channel นี้ — frontend ต้อง liff.login() ใหม่
    if (!res.ok) throw new UnauthorizedException('LINE ID token ไม่ถูกต้องหรือหมดอายุ');
    const body = (await res.json()) as { sub?: string };
    if (!body.sub) throw new UnauthorizedException('LINE ID token ไม่ถูกต้องหรือหมดอายุ');
    return body.sub;
  }
}
