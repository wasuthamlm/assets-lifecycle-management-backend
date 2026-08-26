import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SsoExchangeDto {
  @ApiProperty({ description: 'Supabase access token ที่ได้จากการ login ผ่าน Microsoft SSO (frontend อ่านจาก supabase.auth.getSession())' })
  @IsString()
  @IsNotEmpty()
  accessToken: string;
}
