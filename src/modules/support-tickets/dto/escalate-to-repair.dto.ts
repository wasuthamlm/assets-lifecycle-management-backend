import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class EscalateToRepairDto {
  @ApiPropertyOptional({ description: 'อาการเสียที่ IT ตรวจพบ — ไม่ส่งมาจะใช้เรื่อง/รายละเอียดจาก ticket' })
  @IsOptional()
  @IsString()
  problemDescription?: string;

  @ApiPropertyOptional({ description: 'ผู้รับซ่อม กรณีส่งซ่อมนอก' })
  @IsOptional()
  @IsInt()
  vendorId?: number;
}
