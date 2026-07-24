import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreatePurchaseOrderItemDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() categoryId?: number;
  @ApiProperty() @IsString() itemDescription: string;
  @ApiProperty() @IsInt() quantity: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() unitPrice?: number;
}
