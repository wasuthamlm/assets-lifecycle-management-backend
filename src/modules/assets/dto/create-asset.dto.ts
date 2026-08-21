import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AssetStatus, HolderType } from '@common/enums';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateAssetDto {
  @ApiProperty({ example: 'FA-2026-00123' })
  @IsString()
  assetNo: string;

  @ApiProperty()
  @IsInt()
  categoryId: number;

  @ApiProperty()
  @IsString()
  assetName: string;

  @ApiProperty()
  @IsString()
  serialNumber: string;

  @ApiProperty()
  @IsString()
  brand: string;

  @ApiProperty()
  @IsString()
  model: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  vendorId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  purchaseDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  purchaseCost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  warrantyExpireDate?: string;

  @ApiPropertyOptional({ enum: AssetStatus })
  @IsOptional()
  @IsEnum(AssetStatus)
  currentStatus?: AssetStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  currentLocationId?: number;

  @ApiPropertyOptional({ enum: HolderType })
  @IsOptional()
  @IsEnum(HolderType)
  currentHolderType?: HolderType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  currentHolderId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  attributes?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
