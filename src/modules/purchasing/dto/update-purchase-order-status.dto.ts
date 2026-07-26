import { ApiProperty } from '@nestjs/swagger';
import { PoStatus } from '@common/enums';
import { IsEnum } from 'class-validator';

export class UpdatePurchaseOrderStatusDto {
  @ApiProperty({ enum: PoStatus })
  @IsEnum(PoStatus)
  status: PoStatus;
}
