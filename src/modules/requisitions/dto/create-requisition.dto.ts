import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RequestType } from '@common/enums';
import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';

class RequisitionItemInput {
  @ApiPropertyOptional() @IsOptional() @IsInt() assetId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() stockItemId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() quantity?: number;
}

export class CreateRequisitionDto {
  @ApiProperty({ example: 'REQ-2026-0001' })
  @IsString()
  requisitionNo: string;

  @ApiProperty() @IsInt() requestedBy: number;

  @ApiProperty({ enum: RequestType })
  @IsEnum(RequestType)
  requestType: RequestType;

  @ApiPropertyOptional() @IsOptional() @IsDateString() dueDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;

  @ApiProperty({ type: [RequisitionItemInput] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RequisitionItemInput)
  items: RequisitionItemInput[];

  @ApiProperty({ type: [Number], description: 'employee_id ของผู้อนุมัติแต่ละลำดับชั้น เช่น [หัวหน้างาน, ผจก.] = multi-level' })
  @IsArray()
  @IsInt({ each: true })
  approverIds: number[];
}
