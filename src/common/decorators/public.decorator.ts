import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
/** ใช้กับ endpoint ที่ไม่ต้อง login เช่น POST /auth/login */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
