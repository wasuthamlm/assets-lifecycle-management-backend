import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { dataSourceOptions } from './config/typeorm.config';

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

import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(dataSourceOptions),

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
  ],
  providers: [
    // Global guard: ทุก endpoint ต้อง login ก่อนเสมอ ยกเว้นที่ประกาศ @Public()
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Global guard: ตรวจ @RequirePermissions(...) ถ้ามีประกาศไว้
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
