import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HolderType, MovementType } from '@common/enums';
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';

export class CreateMovementDto {
  @ApiProperty()
  @IsInt()
  assetId: number;

  @ApiProperty({ enum: MovementType })
  @IsEnum(MovementType)
  movementType: MovementType;

  @ApiPropertyOptional() @IsOptional() @IsInt() fromLocationId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() toLocationId?: number;

  @ApiPropertyOptional({ enum: HolderType }) @IsOptional() @IsEnum(HolderType) fromHolderType?: HolderType | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() fromHolderId?: number | null;

  @ApiPropertyOptional({ enum: HolderType }) @IsOptional() @IsEnum(HolderType) toHolderType?: HolderType | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() toHolderId?: number | null;

  @ApiPropertyOptional() @IsOptional() @IsString() referenceType?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() referenceId?: number;

  @ApiProperty()
  @IsInt()
  performedBy: number;

  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
