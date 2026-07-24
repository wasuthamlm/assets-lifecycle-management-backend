import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DisposalMethod } from '@common/enums';
import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateDisposalDto {
  @ApiProperty() @IsInt() assetId: number;

  @ApiProperty({ enum: DisposalMethod })
  @IsEnum(DisposalMethod)
  disposalMethod: DisposalMethod;

  @ApiProperty() @IsDateString() disposalDate: string;

  @ApiPropertyOptional() @IsOptional() @IsNumber() saleAmount?: number;

  @ApiProperty() @IsInt() approvedBy: number;

  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}
