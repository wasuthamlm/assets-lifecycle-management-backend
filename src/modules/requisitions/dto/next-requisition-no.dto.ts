import { ApiProperty } from '@nestjs/swagger';
import { RequestType } from '@common/enums';
import { IsEnum } from 'class-validator';

export class NextRequisitionNoQueryDto {
  @ApiProperty({ enum: RequestType })
  @IsEnum(RequestType)
  requestType: RequestType;
}
