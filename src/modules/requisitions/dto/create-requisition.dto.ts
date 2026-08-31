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

  // สำหรับ hr เบิก/ยืมแทนพนักงานคนอื่น (เช่น เตรียมอุปกรณ์ให้พนักงานใหม่) — ถ้าใส่มา requestedBy (และผู้ครอบครอง
  // ของหลังอนุมัติ) จะเป็นพนักงานคนนี้แทนคนที่ล็อกอินอยู่ ต้องมี requisition.view_all ถึงจะใช้ฟิลด์นี้ได้
  // (ดู RequisitionsService.create) ไม่งั้น employee ทั่วไปจะสวมรอยเบิกในนามคนอื่นได้
  @ApiPropertyOptional({ description: 'employee_id ของผู้ที่เบิก/ยืมแทน — ต้องมีสิทธิ์ requisition.view_all' })
  @IsOptional()
  @IsInt()
  onBehalfOfEmployeeId?: number;

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
