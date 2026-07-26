import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ClsModule } from 'nestjs-cls';
import { randomUUID } from 'crypto';
import { dataSourceOptions } from './config/typeorm.config';
import { envValidationSchema } from './config/env.validation';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { RolesPermissionsModule } from './modules/roles-permissions/roles-permissions.module';
import { VendorsModule } from './modules/vendors/vendors.module';
import { LocationsModule } from './modules/locations/locations.module';
import { AssetCategoriesModule } from './modules/asset-categories/asset-categories.module';
import { AssetsModule } from './modules/assets/assets.module';
import { StockModule } from './modules/stock/stock.module';
import { PurchasingModule } from './modules/purchasing/purchasing.module';
import { GoodsReceiptModule } from './modules/goods-receipt/goods-receipt.module';
import { RequisitionsModule } from './modules/requisitions/requisitions.module';
import { AssignmentsModule } from './modules/assignments/assignments.module';
import { MovementsModule } from './modules/movements/movements.module';
import { RepairsModule } from './modules/repairs/repairs.module';
import { WarrantyModule } from './modules/warranty/warranty.module';
import { DisposalModule } from './modules/disposal/disposal.module';
import { AttachmentsModule } from './modules/attachments/attachments.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { HealthModule } from './modules/health/health.module';

import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { LoggerMiddleware } from './common/middlewares/logger.middleware';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

@Module({
  imports: [
    // ต้อง import ก่อน module อื่นเสมอ เพื่อให้ ClsMiddleware ทำงานก่อน middleware/filter อื่นที่ต้องอ่าน requestId
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        generateId: true,
        idGenerator: (req) => req.headers['x-request-id'] ?? randomUUID(),
      },
    }),
    ConfigModule.forRoot({ isGlobal: true, validationSchema: envValidationSchema }),
    TypeOrmModule.forRoot(dataSourceOptions),

    // Global rate limit: default 60 req / 60s ต่อ client (ปรับ override เฉพาะ endpoint ผ่าน @Throttle)
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),

    // Access control / master data
    AuthModule,
    UsersModule,
    CompaniesModule,
    DepartmentsModule,
    EmployeesModule,
    RolesPermissionsModule,
    VendorsModule,
    LocationsModule,
    AssetCategoriesModule,

    // Core asset lifecycle
    AssetsModule,
    StockModule,
    PurchasingModule,
    GoodsReceiptModule,
    RequisitionsModule,
    AssignmentsModule,
    MovementsModule,
    RepairsModule,
    WarrantyModule,
    DisposalModule,
    AttachmentsModule,

    DashboardModule,
    HealthModule,
  ],
  providers: [
    // Global guard: จำกัดความถี่ request ต่อ client ก่อนเช็คสิทธิ์ใด ๆ (กัน brute-force / flood)
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Global guard: ทุก endpoint ต้อง login ก่อนเสมอ ยกเว้นที่ประกาศ @Public()
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Global guard: ตรวจ @RequirePermissions(...) ถ้ามีประกาศไว้
    { provide: APP_GUARD, useClass: PermissionsGuard },
    // Global filter ผ่าน DI (ต้องใช้ ClsService เพื่อ log requestId)
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
