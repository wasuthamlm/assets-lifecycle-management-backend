import { ApiProperty } from '@nestjs/swagger';
import { IsInt } from 'class-validator';

export class AdjustStockDto {
  @ApiProperty() @IsInt() stockItemId: number;
  @ApiProperty() @IsInt() locationId: number;
  @ApiProperty({ description: 'จำนวนที่เปลี่ยนแปลง (+ เพิ่ม / - ลด)' }) @IsInt() delta: number;
}
