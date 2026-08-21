import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsEmail, IsInt, IsOptional, IsString } from 'class-validator';

export class PreRegisterEmployeeDto {
  @ApiProperty({ example: 'EMP-0010' })
  @IsString()
  employeeCode: string;

  @ApiProperty({ example: 'สมชาย ใจดี' })
  @IsString()
  fullName: string;

  @ApiProperty({
    example: 'somchai.j@millimedthailand.com',
    description: 'ใช้เป็นทั้งอีเมลพนักงานและ username สำหรับ login — ระบบจะส่ง username/รหัสผ่านชั่วคราวไปที่อีเมลนี้',
  })
  @IsEmail()
  email: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  departmentId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  position?: string;

  @ApiProperty({ type: [Number], description: 'role_id ที่จะกำหนดให้พนักงานคนนี้ (อย่างน้อย 1 role)' })
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  roleIds: number[];
}
