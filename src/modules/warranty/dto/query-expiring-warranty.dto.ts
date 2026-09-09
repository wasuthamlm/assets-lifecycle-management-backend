import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class QueryExpiringWarrantyDto {
  @ApiPropertyOptional({ description: 'จำนวนวันล่วงหน้าที่จะมองหาประกันที่ใกล้หมดอายุ (ค่าเริ่มต้น 30 วัน)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  withinDays?: number;
}
