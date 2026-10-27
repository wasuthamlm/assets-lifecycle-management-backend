import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsEmail, IsInt } from 'class-validator';

export class UpsertRolePreassignmentDto {
  @ApiProperty({
    example: 'somchai.j@millimedthailand.com',
    description: 'อีเมลบริษัทที่จะ login ผ่าน Microsoft SSO — ไม่มีการสร้างบัญชีหรือส่งรหัสผ่าน',
  })
  @IsEmail()
  email: string;

  @ApiProperty({ type: [Number], description: 'role_id ที่จะได้ทันทีเมื่ออีเมลนี้ login ครั้งแรก (แทนที่ของเดิมถ้ามีอยู่แล้ว)' })
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  roleIds: number[];
}
