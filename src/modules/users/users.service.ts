import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private repo: Repository<User>) {}

  async create(dto: CreateUserDto) {
    const existing = await this.repo.findOne({ where: { username: dto.username } });
    if (existing) throw new ConflictException('username นี้ถูกใช้ไปแล้ว');

    const user = this.repo.create({
      username: dto.username,
      email: dto.email,
      employeeId: dto.employeeId,
      isActive: dto.isActive ?? true,
      passwordHash: await argon2.hash(dto.password),
    });
    return this.repo.save(user);
  }

  findAll() {
    return this.repo.find({ relations: ['employee'] });
  }

  async findOne(id: number) {
    const user = await this.repo.findOne({ where: { userId: id }, relations: ['employee'] });
    if (!user) throw new NotFoundException(`ไม่พบ user id ${id}`);
    return user;
  }

  async update(id: number, dto: UpdateUserDto) {
    const user = await this.findOne(id);
    Object.assign(user, dto);
    return this.repo.save(user);
  }

  async remove(id: number) {
    const user = await this.findOne(id);
    await this.repo.remove(user);
    return { success: true };
  }
}
