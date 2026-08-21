import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { PreRegisterEmployeeDto } from './dto/pre-register-employee.dto';
import { RequirePermissions } from '@common/decorators/permissions.decorator';

@ApiTags('employees')
@ApiBearerAuth()
@Controller('employees')
export class EmployeesController {
  constructor(private service: EmployeesService) {}

  @Post()
  @RequirePermissions('employee.create')
  create(@Body() dto: CreateEmployeeDto) {
    return this.service.create(dto);
  }

  // ลงทะเบียนพนักงานใหม่ล่วงหน้า: สร้าง employee + user login + assign role ในทีเดียว
  // ต้องมีสิทธิ์ครบทั้ง 3 อย่างเพราะทำ 3 การกระทำนี้พร้อมกัน
  @Post('pre-register')
  @RequirePermissions('employee.create', 'user.create', 'rbac.manage')
  preRegister(@Body() dto: PreRegisterEmployeeDto) {
    return this.service.preRegister(dto);
  }

  @Get()
  @RequirePermissions('employee.view_all')
  findAll() {
    return this.service.findAll();
  }

  // รายชื่อพนักงานแบบย่อ (id + ชื่อ) ไว้ใช้เลือกผู้ขอเบิก/ผู้อนุมัติในฟอร์ม —
  // เปิดให้ user ที่ login แล้วทุกคนเรียกได้ ไม่ต้องมีสิทธิ์ employee.view_all
  @Get('directory')
  directory() {
    return this.service.findDirectory();
  }

  @Get(':id')
  @RequirePermissions('employee.view_all')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('employee.update')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateEmployeeDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('employee.delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
