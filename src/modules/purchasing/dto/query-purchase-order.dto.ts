import { ApiPropertyOptional } from '@nestjs/swagger';
import { PoStatus } from '@common/enums';
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryPurchaseOrderDto {
  @ApiPropertyOptional({ description: 'ค้นจากเลขที่ใบสั่งซื้อหรือชื่อผู้ขาย' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: PoStatus })
  @IsOptional()
  @IsEnum(PoStatus)
  status?: PoStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number = 1;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number = 20;
}
