import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreatePermissionDto {
  @ApiProperty({ example: 'asset.create' })
  @IsString()
  permissionCode: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}
