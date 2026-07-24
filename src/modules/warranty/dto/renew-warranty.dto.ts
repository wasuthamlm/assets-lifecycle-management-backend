import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsInt } from 'class-validator';

export class RenewWarrantyDto {
  @ApiProperty() @IsDateString() newEndDate: string;
  @ApiProperty() @IsInt() performedBy: number;
}
