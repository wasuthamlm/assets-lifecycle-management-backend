import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    @InjectRepository(User) private usersRepo: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: { sub: number; username: string }) {
    const user = await this.usersRepo.findOne({
      where: { userId: payload.sub },
      relations: ['employee', 'employee.employeeRoles', 'employee.employeeRoles.role', 'employee.employeeRoles.role.rolePermissions', 'employee.employeeRoles.role.rolePermissions.permission'],
    });
    if (!user || !user.isActive) throw new UnauthorizedException('บัญชีนี้ถูกระงับการใช้งาน');

    const permissions = new Set<string>();
    for (const er of user.employee?.employeeRoles || []) {
      for (const rp of er.role?.rolePermissions || []) {
        permissions.add(rp.permission.permissionCode);
      }
    }

    return {
      userId: user.userId,
      username: user.username,
      employeeId: user.employeeId,
      permissions: Array.from(permissions),
    };
  }
}
