import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LinkLineDto {
  @ApiProperty({ description: 'ID token จาก liff.getIDToken()' })
  @IsString()
  @IsNotEmpty()
  idToken: string;
}
