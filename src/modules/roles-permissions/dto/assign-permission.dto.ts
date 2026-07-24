import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsInt } from 'class-validator';

export class AssignPermissionsDto {
  @ApiProperty({ type: [Number], description: 'รายการ permission_id ที่จะ set ให้ role นี้ (แทนที่ของเดิมทั้งหมด)' })
  @IsArray()
  @IsInt({ each: true })
  permissionIds: number[];
}
