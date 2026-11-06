import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TicketPriority, TicketStatus } from '@common/enums';
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateTicketStatusDto {
  @ApiProperty({ enum: TicketStatus })
  @IsEnum(TicketStatus)
  status: TicketStatus;

  @ApiPropertyOptional({ description: 'employeeId ของเจ้าหน้าที่ IT ที่รับงาน — ไม่ส่งมาตอนรับงาน (open → in_progress) จะใช้คนที่กด' })
  @IsOptional()
  @IsInt()
  assignedTo?: number;

  @ApiPropertyOptional({ enum: TicketPriority })
  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @ApiPropertyOptional({ description: 'วิธีแก้ไข/เหตุผลที่ยกเลิก' })
  @IsOptional()
  @IsString()
  resolution?: string;
}
