import { Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseIdentity {
  supabaseUserId: string;
  email: string;
  /** เช่น 'azure' (Microsoft) หรือ 'email' — ใช้กันคนสมัครตรงผ่าน Supabase email/password แล้วสวมโดเมนที่ allowlist ไว้ */
  provider: string | null;
  /**
   * ชื่อเต็มจาก Azure AD — มีค่าเฉพาะตอนที่ Supabase ขอ scope 'profile' ตอน login (ดู frontend LoginPage)
   * และบัญชี Azure AD นั้นกรอกชื่อไว้ เป็น null ถ้าไม่มีข้อมูลพอจะหาชื่อได้ (ปล่อยให้ fallback ไปใช้ email แทนที่ชั้น caller)
   */
  fullName: string | null;
}

/**
 * ตรวจสอบ access token ที่ Supabase Auth ออกให้ (ตอน login ผ่าน Microsoft SSO) โดยส่งให้ Supabase
 * เป็นคน verify เอง (เรียก auth.getUser ซึ่งยิงไป Supabase Auth server) แทนการ decode/verify signature เอง —
 * เพราะโปรเจกต์ Supabase อาจ sign ด้วย HS256 (shared secret) หรือ ES256 (JWKS) แล้วแต่การตั้งค่า
 * วิธีนี้ไม่ต้องรู้ว่าใช้แบบไหน และได้ identity ที่ยืนยันจาก Supabase ตรงๆ (กัน token ปลอมที่ signature ผ่านแต่ข้อมูลมั่ว)
 */
@Injectable()
export class SupabaseIdentityService {
  private client: SupabaseClient | null = null;

  constructor(private config: ConfigService) {}

  private getClient(): SupabaseClient {
    if (this.client) return this.client;

    const url = this.config.get<string>('SUPABASE_URL');
    const serviceRoleKey = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceRoleKey) {
      throw new InternalServerErrorException(
        'ยังไม่ได้ตั้งค่า SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — ไม่สามารถ login ผ่าน Microsoft SSO ได้',
      );
    }

    this.client = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
    return this.client;
  }

  async verifyAccessToken(accessToken: string): Promise<SupabaseIdentity> {
    const { data, error } = await this.getClient().auth.getUser(accessToken);
    if (error || !data?.user) {
      throw new UnauthorizedException('Microsoft SSO token ไม่ถูกต้องหรือหมดอายุ');
    }

    // Supabase เก็บ full_name ของ Azure AD ไว้ตรงๆ ที่ user_metadata.full_name อยู่แล้ว (มาจาก claim 'name')
    // ส่วน given_name/family_name แยกชิ้นจะซ้อนอยู่ใต้ user_metadata.custom_claims แทน ไม่ใช่ระดับบนสุด —
    // ใช้ full_name เป็นหลักเพราะชัวร์กว่า เผื่อ provider ในอนาคตไม่มี custom_claims ค่อย fallback ไปต่อเอง
    const metadata = (data.user.user_metadata ?? {}) as {
      full_name?: string;
      custom_claims?: { given_name?: string; family_name?: string };
    };
    const fullName =
      metadata.full_name?.trim() ||
      [metadata.custom_claims?.given_name, metadata.custom_claims?.family_name].filter(Boolean).join(' ').trim() ||
      null;

    return {
      supabaseUserId: data.user.id,
      email: data.user.email ?? '',
      provider: (data.user.app_metadata as { provider?: string } | undefined)?.provider ?? null,
      fullName,
    };
  }
}
