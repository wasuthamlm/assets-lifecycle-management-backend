import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class CreateCompanyDto {
  @ApiProperty({ example: 'MLM' })
  @IsString()
  @IsNotEmpty()
  companyCode: string;

  @ApiProperty({ example: 'Millimed Co., Ltd.' })
  @IsString()
  @IsNotEmpty()
  companyName: string;
}
