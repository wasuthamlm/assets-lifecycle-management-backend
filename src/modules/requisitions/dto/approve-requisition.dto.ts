import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApprovalStatus } from '@common/enums';
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';

export class ApproveRequisitionDto {
  @ApiProperty() @IsInt() approverId: number;

  @ApiProperty({ enum: ApprovalStatus, description: 'approved หรือ rejected เท่านั้น' })
  @IsEnum(ApprovalStatus)
  status: ApprovalStatus;

  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
}
