import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RequestType } from '@common/enums';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
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

  // หมายเหตุต่อรายการ แสดงในใบส่งมอบ-ส่งคืนทรัพย์สิน (ดู requisitions.controller.ts :id/document)
  @ApiPropertyOptional({ description: 'หมายเหตุต่อรายการ สำหรับพิมพ์ในใบส่งมอบ-ส่งคืนทรัพย์สิน' })
  @IsOptional()
  @IsString()
  note?: string;
}

class AccessoriesInput {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() adapter?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() mouse?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() pen?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() bag?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() other?: string;
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

  // ฟิลด์สำหรับพิมพ์ใบส่งมอบ-ส่งคืนทรัพย์สิน (ดู GET /requisitions/:id/document) — ไม่ระบุมาจะ default
  // จากข้อมูล employee ที่มีอยู่แล้วแทน (position, department, เบอร์ติดต่อ) ยกเว้น employeeNameEn/startDate
  // ที่ไม่มีในระบบ employee จึงต้องกรอกตอนสร้างคำขอถ้าต้องการให้ขึ้นในเอกสาร
  @ApiPropertyOptional({ description: 'ชื่อ-นามสกุลผู้รับทรัพย์สิน (ภาษาอังกฤษ) สำหรับพิมพ์ในเอกสาร' })
  @IsOptional()
  @IsString()
  employeeNameEn?: string;

  @ApiPropertyOptional({ description: 'วันที่เริ่มงาน สำหรับพิมพ์ในเอกสาร' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'ตำแหน่ง สำหรับพิมพ์ในเอกสาร — ไม่ระบุจะ default จาก employee.position' })
  @IsOptional()
  @IsString()
  position?: string;

  @ApiPropertyOptional({ description: 'ฝ่าย สำหรับพิมพ์ในเอกสาร — ไม่ระบุจะ default จาก employee.department' })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional({ description: 'เบอร์ติดต่อ สำหรับพิมพ์ในเอกสาร — ไม่ระบุจะ default จาก employee.phone' })
  @IsOptional()
  @IsString()
  contactPhone?: string;

  @ApiPropertyOptional({ type: AccessoriesInput, description: 'อุปกรณ์ต่อพ่วงที่มอบให้พร้อมทรัพย์สิน' })
  @IsOptional()
  @ValidateNested()
  @Type(() => AccessoriesInput)
  accessories?: AccessoriesInput;

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
