/** ใช้ร่วมกันระหว่าง endpoint upload ไฟล์แนบทุกจุด (generic /attachments/upload และ /requisitions/:id/attachments)
 * กันรายการ mime type / ขนาดไฟล์ ดริฟท์ไม่ตรงกันระหว่างจุดที่รับไฟล์ */
export const ALLOWED_ATTACHMENT_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

export function maxAttachmentSizeBytes(): number {
  return parseInt(process.env.MAX_UPLOAD_SIZE_MB || '10', 10) * 1024 * 1024;
}
