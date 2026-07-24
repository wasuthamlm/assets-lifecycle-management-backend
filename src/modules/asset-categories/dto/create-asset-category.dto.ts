import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';

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
}
