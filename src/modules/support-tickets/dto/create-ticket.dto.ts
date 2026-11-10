import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { TicketCategory, TicketPriority } from '@common/enums';

export class CreateTicketDto {
  @ApiProperty({ enum: TicketCategory })
  @IsEnum(TicketCategory)
  category: TicketCategory;

  @ApiProperty({ description: 'เรื่องที่แจ้ง เช่น "โน้ตบุ๊กเปิดไม่ติด"' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  subject: string;

  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;

  @ApiPropertyOptional({ enum: TicketPriority })
  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @ApiPropertyOptional({ description: 'ทรัพย์สินที่มีปัญหา — ต้องเป็นของที่ผู้แจ้งถือ/ยืมอยู่ (ดู GET /assignments/mine)' })
  @IsOptional()
  @IsInt()
  assetId?: number;

  @ApiPropertyOptional({ description: 'ชื่ออุปกรณ์ที่ผู้แจ้งพิมพ์เอง เมื่อไม่ใช่ของที่ถือ/ยืมอยู่ในระบบ — ส่ง assetId มาด้วยจะไม่เก็บช่องนี้' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  assetText?: string;

  @ApiPropertyOptional({ description: 'อาคาร/สถานที่ (locations master)' })
  @IsOptional()
  @IsInt()
  locationId?: number;

  @ApiProperty({ description: 'ชั้น/ห้อง/โต๊ะ เช่น "ชั้น 3 ห้องประชุม A"' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  locationDetail: string;

  @ApiPropertyOptional({ description: 'เบอร์ติดต่อกลับ — ไม่ส่งมาจะใช้เบอร์ในข้อมูลพนักงาน' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  contactPhone?: string;
}
