import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Attachment } from './entities/attachment.entity';
import { CreateAttachmentDto } from './dto/create-attachment.dto';

@Injectable()
export class AttachmentsService {
  constructor(@InjectRepository(Attachment) private repo: Repository<Attachment>) {}

  create(dto: CreateAttachmentDto) {
    return this.repo.save(this.repo.create(dto));
  }

  findByReference(referenceType: string, referenceId: number) {
    return this.repo.find({ where: { referenceType, referenceId }, order: { createdAt: 'DESC' } });
  }

  async remove(id: number) {
    const a = await this.repo.findOne({ where: { attachmentId: id } });
    if (!a) throw new NotFoundException(`ไม่พบไฟล์แนบ id ${id}`);
    await this.repo.remove(a);
    return { success: true };
  }
}
