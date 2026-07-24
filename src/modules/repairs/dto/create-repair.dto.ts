import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class CreateRepairDto {
  @ApiProperty() @IsInt() assetId: number;
  @ApiProperty() @IsInt() reportedBy: number;
  @ApiPropertyOptional() @IsOptional() @IsString() problemDescription?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() vendorId?: number;
}
