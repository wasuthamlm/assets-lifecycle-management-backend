import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class CreateStockItemDto {
  @ApiProperty() @IsInt() categoryId: number;
  @ApiProperty() @IsString() itemName: string;
  @ApiPropertyOptional() @IsOptional() @IsString() unit?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
}
