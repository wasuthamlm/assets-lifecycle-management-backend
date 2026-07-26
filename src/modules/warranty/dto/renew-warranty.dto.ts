import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

export class RenewWarrantyDto {
  @ApiProperty() @IsDateString() newEndDate: string;
}
