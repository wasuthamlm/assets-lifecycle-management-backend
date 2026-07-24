import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class CreateAttachmentDto {
  @ApiProperty({ description: 'asset / requisition / repair / goods_receipt / disposal ...' })
  @IsString()
  referenceType: string;

  @ApiProperty() @IsInt() referenceId: number;

  @ApiProperty() @IsString() fileName: string;

  @ApiProperty({ description: 'URL ของไฟล์บน object storage (S3/MinIO) — endpoint นี้ไม่รับ binary โดยตรง' })
  @IsString()
  fileUrl: string;

  @ApiPropertyOptional() @IsOptional() @IsString() mimeType?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() fileSizeBytes?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() uploadedBy?: number;
}
