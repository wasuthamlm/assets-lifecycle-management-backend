import { ApiPropertyOptional } from '@nestjs/swagger';
import { RepairStatus } from '@common/enums';
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryRepairDto {
  @ApiPropertyOptional({ description: 'ค้นจากชื่อ/เลขทรัพย์สิน หรือรายละเอียดปัญหา' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: RepairStatus })
  @IsOptional()
  @IsEnum(RepairStatus)
  status?: RepairStatus;

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
