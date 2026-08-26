import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { User } from '../users/entities/user.entity';
import { Employee } from '../employees/entities/employee.entity';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { MailModule } from '../mail/mail.module';
import { AllowedDomainsModule } from '../allowed-domains/allowed-domains.module';
import { SupabaseIdentityService } from './supabase-identity.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Employee]),
    PassportModule,
    ConfigModule,
    MailModule,
    AllowedDomainsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_ACCESS_SECRET'),
        signOptions: { expiresIn: config.get('JWT_ACCESS_EXPIRES_IN') || '15m' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, SupabaseIdentityService],
  exports: [AuthService],
})
export class AuthModule {}
