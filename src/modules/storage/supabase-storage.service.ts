import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// นานพอกันรูปหลุดกลางคันตอนเปิดหน้าค้างไว้ (ไม่มี auto-refresh ฝั่ง frontend) แต่ก็ยังสั้นพอที่จะ
// นับเป็น "signed URL แบบหมดอายุจริง" ตามหลักความปลอดภัยของไฟล์แนบส่วนตัว
const SIGNED_URL_TTL_SECONDS = 15 * 60;

/**
 * ห่อ Supabase Storage (private bucket) ไว้จุดเดียว — ใช้ service role key เพราะ backend
 * เป็นคนเช็ค attachment.view/attachment.manage เองอยู่แล้ว ไม่ต้องพึ่ง RLS ของ Supabase อีกชั้น
 * ไฟล์ในนี้ต้องมีทั้ง SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY ถึงจะใช้งานได้ — ถ้ายังไม่ตั้งค่า
 * จะ throw ตอนเรียกใช้งานจริง (ไม่ throw ตอน boot กัน dev ที่ยังไม่ได้ตั้งค่าใช้ endpoint อื่นไม่ได้)
 */
@Injectable()
export class SupabaseStorageService {
  private client: SupabaseClient | null = null;
  private readonly bucket: string;

  constructor(private config: ConfigService) {
    this.bucket = this.config.get<string>('SUPABASE_STORAGE_BUCKET') || 'attachments';
  }

  private getClient(): SupabaseClient {
    if (this.client) return this.client;

    const url = this.config.get<string>('SUPABASE_URL');
    const serviceRoleKey = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceRoleKey) {
      throw new InternalServerErrorException(
        'ยังไม่ได้ตั้งค่า SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — ไม่สามารถอัปโหลด/ดูไฟล์แนบได้',
      );
    }

    this.client = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
    return this.client;
  }

  async upload(path: string, buffer: Buffer, contentType: string): Promise<void> {
    const { error } = await this.getClient().storage.from(this.bucket).upload(path, buffer, {
      contentType,
      upsert: false,
    });
    if (error) throw new InternalServerErrorException(`อัปโหลดไฟล์ไป Supabase Storage ไม่สำเร็จ: ${error.message}`);
  }

  async remove(path: string): Promise<void> {
    // ลบไฟล์ล้มเหลวไม่ควรบล็อกการลบ record ใน DB — log แล้วปล่อยผ่าน (เหมือน best-effort ของ notification)
    await this.getClient().storage.from(this.bucket).remove([path]);
  }

  async createSignedUrl(path: string): Promise<string> {
    const { data, error } = await this.getClient()
      .storage.from(this.bucket)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (error || !data) throw new InternalServerErrorException(`สร้างลิงก์ดูไฟล์ไม่สำเร็จ: ${error?.message}`);
    return data.signedUrl;
  }
}
