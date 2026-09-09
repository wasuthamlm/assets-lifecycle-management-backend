import { ApiPropertyOptional } from '@nestjs/swagger';
import { MovementType } from '@common/enums';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryMovementDto {
  @ApiPropertyOptional({ description: 'ค้นจากชื่อ/เลขทรัพย์สิน, ผู้ทำรายการ, หรือหมายเหตุ' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: MovementType })
  @IsOptional()
  @IsEnum(MovementType)
  movementType?: MovementType;

  @ApiPropertyOptional({ description: 'กรองตั้งแต่วันที่ (createdAt >=), รูปแบบ YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'กรองถึงวันที่ (createdAt <=), รูปแบบ YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

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
