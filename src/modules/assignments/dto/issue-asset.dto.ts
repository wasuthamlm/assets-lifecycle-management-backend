import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AssignmentType, HolderType } from '@common/enums';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString } from 'class-validator';

export class IssueAssetDto {
  @ApiProperty() @IsInt() assetId: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() requisitionId?: number;

  @ApiProperty({ enum: AssignmentType })
  @IsEnum(AssignmentType)
  assignmentType: AssignmentType;

  @ApiProperty({ enum: HolderType })
  @IsEnum(HolderType)
  holderType: HolderType;

  @ApiProperty()
  @IsInt()
  holderId: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
