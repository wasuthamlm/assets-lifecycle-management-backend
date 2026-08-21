import { SetMetadata } from '@nestjs/common';

export const ALLOW_PENDING_PASSWORD_CHANGE_KEY = 'allowPendingPasswordChange';
/** ใช้กับ endpoint ที่ user ที่ mustChangePassword=true ยังต้องเรียกได้ (เช่น /auth/me, /auth/logout, /auth/change-password) */
export const AllowPendingPasswordChange = () => SetMetadata(ALLOW_PENDING_PASSWORD_CHANGE_KEY, true);
