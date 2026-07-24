import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RepairResult, RepairStatus } from '@common/enums';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateRepairStatusDto {
  @ApiProperty({ enum: RepairStatus })
  @IsEnum(RepairStatus)
  status: RepairStatus;

  @ApiPropertyOptional({ enum: RepairResult })
  @IsOptional()
  @IsEnum(RepairResult)
  result?: RepairResult;

  @ApiPropertyOptional() @IsOptional() @IsNumber() repairCost?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
