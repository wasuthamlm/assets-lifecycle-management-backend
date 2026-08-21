import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, IsUrl } from 'class-validator';

export const ATTACHMENT_REFERENCE_TYPES = [
  'asset',
  'requisition',
  'repair',
  'goods_receipt',
  'disposal',
  'warranty',
  'purchase_order',
] as const;

export class CreateAttachmentDto {
  @ApiProperty({ enum: ATTACHMENT_REFERENCE_TYPES })
  @IsIn(ATTACHMENT_REFERENCE_TYPES)
  referenceType: string;

  @ApiProperty() @IsInt() referenceId: number;

  @ApiProperty() @IsString() fileName: string;

  @ApiProperty({ description: 'URL ของไฟล์บน object storage (S3/MinIO) — endpoint นี้ไม่รับ binary โดยตรง' })
  // require_protocol กัน javascript:/data: URI ที่อาจโดน render ตรงๆ ฝั่ง frontend จนเกิด stored-XSS
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  fileUrl: string;

  @ApiPropertyOptional() @IsOptional() @IsString() mimeType?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() fileSizeBytes?: number;
}
