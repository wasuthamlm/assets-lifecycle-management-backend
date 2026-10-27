import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';

export class CreateAssetCategoryDto {
  @ApiProperty()
  @IsString()
  categoryName: string;

  @ApiPropertyOptional({ description: 'hardware / license / vehicle / tool / furniture ...' })
  @IsOptional()
  @IsString()
  assetType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  parentCategoryId?: number;

  @ApiPropertyOptional({ description: 'true = ต้องให้ HR เป็นผู้ทำรายการเบิก/ยืมให้ (พนักงานทั่วไปเลือกเองไม่ได้)' })
  @IsOptional()
  @IsBoolean()
  requiresHrRequest?: boolean;
}
