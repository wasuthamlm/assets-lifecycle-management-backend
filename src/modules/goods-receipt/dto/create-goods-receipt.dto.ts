import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

class ReceiptAssetDataInput {
  @ApiProperty() @IsInt() categoryId: number;
  @ApiProperty() @IsString() assetName: string;
  @ApiPropertyOptional() @IsOptional() @IsString() serialNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() brand?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() model?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() vendorId?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) purchaseCost?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() warrantyExpireDate?: string;
}

class ReceiptItemInput {
  @ApiPropertyOptional() @IsOptional() @IsInt() poItemId?: number;

  @ApiPropertyOptional({
    type: ReceiptAssetDataInput,
    description: 'กรณีรับของ serialized (fixed asset) — ระบุ field เหล่านี้เพื่อสร้าง asset ใหม่',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ReceiptAssetDataInput)
  assetData?: ReceiptAssetDataInput;

  @ApiPropertyOptional({ description: 'กรณีรับของ consumable/bulk' })
  @IsOptional()
  @IsInt()
  stockItemId?: number;

  @ApiPropertyOptional({ description: 'ใช้กับ stockItemId เท่านั้น' })
  @IsOptional()
  @IsInt()
  @Min(1)
  receivedQuantity?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() conditionOnReceipt?: string;
}

export class CreateGoodsReceiptDto {
  @ApiProperty({ example: 'GR-2026-0001' })
  @IsString()
  receiptNo: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() poId?: number;

  @ApiPropertyOptional() @IsOptional() @IsDateString() receiptDate?: string;

  @ApiProperty() @IsInt() locationId: number;

  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;

  @ApiProperty({ type: [ReceiptItemInput] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ReceiptItemInput)
  items: ReceiptItemInput[];
}
