import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CompleteEmployeeProfileDto {
  @ApiProperty({ example: 'EMP-0001' })
  @IsString()
  @IsNotEmpty()
  employeeCode: string;

  @ApiProperty({ example: 'สมชาย ใจดี' })
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  // เลือกแผนกที่มีอยู่แล้ว — ถ้าใส่ newDepartmentName มาด้วยจะไม่ใช้ค่านี้ (ดู AuthService.completeEmployeeProfile)
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  departmentId?: number;

  // แผนกที่ยังไม่มีในระบบ — ให้สร้างใหม่ (หรือ reuse ถ้ามีชื่อซ้ำอยู่แล้วแบบไม่สนตัวพิมพ์เล็กใหญ่) แล้วผูกให้เลย
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  newDepartmentName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  position?: string;
}
