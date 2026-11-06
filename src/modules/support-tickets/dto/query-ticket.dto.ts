import { ApiPropertyOptional } from '@nestjs/swagger';
import { TicketCategory, TicketStatus } from '@common/enums';
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class QueryTicketDto {
  @ApiPropertyOptional({ description: 'ค้นจากเลขที่ ticket, เรื่องที่แจ้ง, ชื่อผู้แจ้ง หรือเลขทรัพย์สิน' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'สถานะเดียว หรือหลายสถานะคั่นด้วยคอมมา เช่น resolved,closed' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  @IsEnum(TicketStatus, { each: true })
  status?: TicketStatus[];

  @ApiPropertyOptional({ enum: TicketCategory })
  @IsOptional()
  @IsEnum(TicketCategory)
  category?: TicketCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number = 1;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number = 20;
}
