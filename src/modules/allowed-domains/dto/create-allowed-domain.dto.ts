import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class CreateAllowedDomainDto {
  @ApiProperty({ example: 'millimedthailand.com' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, { message: 'รูปแบบโดเมนไม่ถูกต้อง เช่น millimedthailand.com' })
  domain: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  companyId?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}
