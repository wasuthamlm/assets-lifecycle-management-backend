import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateVendorDto {
  @ApiProperty()
  @IsString()
  vendorName: string;

  @ApiPropertyOptional({ description: 'ผู้ขาย / ผู้รับซ่อม / บริษัทประกัน' })
  @IsOptional()
  @IsString()
  vendorType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactInfo?: string;
}
