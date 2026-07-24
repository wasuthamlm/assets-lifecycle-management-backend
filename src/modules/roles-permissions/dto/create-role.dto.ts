import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({ example: 'it_admin' })
  @IsString()
  roleName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}
