import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, ValidateIf } from 'class-validator';

/**
 * พนักงานแก้ข้อมูลของตัวเองที่หน้า "บัญชีของฉัน" — ไม่มีชื่อ-นามสกุล (ข้อมูลหลักของ HR ให้ HR แก้ผ่าน employee.update)
 * ช่องที่ไม่ส่งมา = ไม่เปลี่ยน, ส่งสตริงว่าง/null = ล้างค่า (ดู AuthService.updateMyEmployeeProfile)
 */
export class UpdateMyEmployeeProfileDto {
  // เติมได้เฉพาะตอนยังไม่มีรหัส — มีแล้วต้องให้ HR แก้ กันพนักงานเปลี่ยนรหัสไปชนกับข้อมูลที่ HR ใช้อ้างอิง
  @ApiPropertyOptional({ example: 'EMP-0001' })
  @IsOptional()
  @IsString()
  employeeCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  // null = ไม่ระบุแผนก — ถ้าใส่ newDepartmentName มาด้วยจะไม่ใช้ค่านี้ (เหมือน CompleteEmployeeProfileDto)
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  departmentId?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  newDepartmentName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  position?: string;
}
