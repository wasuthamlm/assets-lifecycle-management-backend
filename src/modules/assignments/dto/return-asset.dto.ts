import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReturnCondition } from '@common/enums';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class ReturnAssetDto {
  @ApiProperty({ enum: ReturnCondition })
  @IsEnum(ReturnCondition)
  returnCondition: ReturnCondition;

  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
