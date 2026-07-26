import { BadRequestException } from '@nestjs/common';

/**
 * บัญชี login บางบัญชี (เช่น system admin) อาจไม่ผูกกับ employee record
 * endpoint ที่ต้องบันทึกว่า "พนักงานคนไหนเป็นคนทำ" ต้อง reject ถ้าไม่มี employeeId แทนที่จะปล่อยผ่าน
 */
export function requireEmployeeId(user: { employeeId: number | null }): number {
  if (!user.employeeId) {
    throw new BadRequestException('บัญชีนี้ไม่ได้ผูกกับข้อมูลพนักงาน ไม่สามารถทำรายการนี้ได้');
  }
  return user.employeeId;
}
