import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';

class ReceiptItemInput {
  @ApiPropertyOptional() @IsOptional() @IsInt() poItemId?: number;

  @ApiPropertyOptional({ description: 'กรณีรับของ serialized (fixed asset) — ระบุ field เหล่านี้เพื่อสร้าง asset ใหม่' })
  @IsOptional()
  assetData?: {
    assetNo: string;
    categoryId: number;
    assetName: string;
    serialNumber?: string;
    brandModel?: string;
    vendorId?: number;
    purchaseCost?: number;
    warrantyExpireDate?: string;
  };

  @ApiPropertyOptional({ description: 'กรณีรับของ consumable/bulk' })
  @IsOptional()
  @IsInt()
  stockItemId?: number;

  @ApiPropertyOptional({ description: 'ใช้กับ stockItemId เท่านั้น' })
  @IsOptional()
  @IsInt()
  receivedQuantity?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() conditionOnReceipt?: string;
}

export class CreateGoodsReceiptDto {
  @ApiProperty({ example: 'GR-2026-0001' })
  @IsString()
  receiptNo: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() poId?: number;

  @ApiPropertyOptional() @IsOptional() @IsDateString() receiptDate?: string;

  @ApiProperty() @IsInt() receivedBy: number;

  @ApiProperty() @IsInt() locationId: number;

  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;

  @ApiProperty({ type: [ReceiptItemInput] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiptItemInput)
  items: ReceiptItemInput[];
}
