import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import { Attachment } from './entities/attachment.entity';
import { CreateAttachmentDto } from './dto/create-attachment.dto';
import { UploadAttachmentDto } from './dto/upload-attachment.dto';
import { SupabaseStorageService } from '../storage/supabase-storage.service';

@Injectable()
export class AttachmentsService {
  constructor(
    @InjectRepository(Attachment) private repo: Repository<Attachment>,
    private storage: SupabaseStorageService,
  ) {}

  create(dto: CreateAttachmentDto, uploadedBy: number) {
    return this.repo.save(this.repo.create({ ...dto, uploadedBy }));
  }

  async saveUpload(file: Express.Multer.File, dto: UploadAttachmentDto, uploadedBy: number) {
    // เก็บ path ภายใน bucket ไว้ (ไม่ใช่ URL) — bucket เป็น private ต้องขอ signed URL สดใหม่ทุกครั้งที่อ่าน
    const storagePath = `${dto.referenceType}/${dto.referenceId}/${randomUUID()}${extname(file.originalname)}`;
    await this.storage.upload(storagePath, file.buffer, file.mimetype);

    return this.repo.save(
      this.repo.create({
        referenceType: dto.referenceType,
        referenceId: dto.referenceId,
        fileName: file.originalname,
        fileUrl: storagePath,
        mimeType: file.mimetype,
        fileSizeBytes: file.size,
        uploadedBy,
      }),
    );
  }

  async findByReference(referenceType: string, referenceId: number) {
    const attachments = await this.repo.find({ where: { referenceType, referenceId }, order: { createdAt: 'DESC' } });
    return Promise.all(attachments.map((a) => this.withSignedUrl(a)));
  }

  async remove(id: number) {
    const a = await this.repo.findOne({ where: { attachmentId: id } });
    if (!a) throw new NotFoundException(`ไม่พบไฟล์แนบ id ${id}`);

    // ลบไฟล์จริงเฉพาะไฟล์ที่ระบบนี้อัปโหลดเข้า Supabase Storage เอง (ไม่ใช่ URL ภายนอกจาก create())
    if (!this.isExternalUrl(a.fileUrl)) {
      await this.storage.remove(a.fileUrl);
    }

    await this.repo.remove(a);
    return { success: true };
  }

  private isExternalUrl(fileUrl: string): boolean {
    return /^https?:\/\//.test(fileUrl);
  }

  /** attachment ที่มาจาก create() (URL ภายนอกจริงๆ) คืนตามเดิม — ที่เหลือคือ storage path ต้องแปลงเป็น signed URL ก่อนส่งออก */
  private async withSignedUrl(a: Attachment): Promise<Attachment> {
    if (this.isExternalUrl(a.fileUrl)) return a;
    const signedUrl = await this.storage.createSignedUrl(a.fileUrl);
    return { ...a, fileUrl: signedUrl };
  }
}
