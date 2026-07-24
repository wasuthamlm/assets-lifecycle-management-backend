import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsInt } from 'class-validator';

export class AssignRolesDto {
  @ApiProperty({ type: [Number], description: 'รายการ role_id ที่จะ set ให้พนักงานคนนี้ (แทนที่ของเดิมทั้งหมด)' })
  @IsArray()
  @IsInt({ each: true })
  roleIds: number[];
}
