import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RequestType } from '@common/enums';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

class RequisitionItemInput {
  @ApiPropertyOptional() @IsOptional() @IsInt() assetId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() stockItemId?: number;
  @ApiProperty() @IsInt() @Min(1) quantity: number;
}

export class CreateRequisitionDto {
  @ApiProperty({ enum: RequestType })
  @IsEnum(RequestType)
  requestType: RequestType;

  // บังคับกรอกเฉพาะตอน requestType = borrow — ValidateIf เท่านั้น ไม่ใส่ @IsOptional() เพื่อให้ @IsDateString() ทำงานตอน borrow
  @ApiPropertyOptional({ description: 'บังคับกรอกเมื่อ requestType = borrow' })
  @ValidateIf((o) => o.requestType === RequestType.BORROW)
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;

  @ApiProperty({ type: [RequisitionItemInput] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RequisitionItemInput)
  items: RequisitionItemInput[];

  @ApiProperty({ type: [Number], description: 'employee_id ของผู้อนุมัติแต่ละลำดับชั้น เช่น [หัวหน้างาน, ผจก.] = multi-level' })
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  approverIds: number[];
}
