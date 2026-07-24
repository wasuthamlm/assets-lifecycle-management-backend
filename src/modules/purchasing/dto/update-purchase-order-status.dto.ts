import { ApiProperty } from '@nestjs/swagger';
import { PoStatus } from '@common/enums';
import { IsEnum, IsInt, IsOptional } from 'class-validator';

export class UpdatePurchaseOrderStatusDto {
  @ApiProperty({ enum: PoStatus })
  @IsEnum(PoStatus)
  status: PoStatus;

  @ApiProperty({ required: false, description: 'ต้องใส่ตอน status = ordered' })
  @IsOptional()
  @IsInt()
  approvedBy?: number;
}
