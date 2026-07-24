import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString } from 'class-validator';

export class CreateWarrantyDto {
  @ApiProperty() @IsInt() assetId: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() vendorId?: number;
  @ApiProperty() @IsDateString() startDate: string;
  @ApiProperty() @IsDateString() endDate: string;
  @ApiPropertyOptional() @IsOptional() @IsString() coverageDetail?: string;
}
