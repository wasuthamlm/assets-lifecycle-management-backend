import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt } from 'class-validator';
import { ATTACHMENT_REFERENCE_TYPES } from './create-attachment.dto';

// multipart/form-data ทุก field มาเป็น string เสมอ ต้อง @Type(() => Number) แปลง referenceId เอง
export class UploadAttachmentDto {
  @ApiProperty({ enum: ATTACHMENT_REFERENCE_TYPES })
  @IsIn(ATTACHMENT_REFERENCE_TYPES)
  referenceType: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  referenceId: number;
}
