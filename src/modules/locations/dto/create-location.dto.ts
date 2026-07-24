import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class CreateLocationDto {
  @ApiProperty()
  @IsString()
  locationName: string;

  @ApiPropertyOptional({ description: 'คลัง / office / factory / ห้องเก็บของ' })
  @IsOptional()
  @IsString()
  locationType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  companyId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  site?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  parentLocationId?: number;
}
