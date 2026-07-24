import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';
/** ระบุ permission_code ที่ endpoint นี้ต้องการ เช่น @RequirePermissions('asset.create') */
export const RequirePermissions = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions);
