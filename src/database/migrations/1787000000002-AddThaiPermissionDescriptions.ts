import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddThaiPermissionDescriptions1787000000002 implements MigrationInterface {
  name = 'AddThaiPermissionDescriptions1787000000002';

  private descriptions: Record<string, string> = {
    'master.manage': 'จัดการข้อมูลหลัก (Master Data)',
    'rbac.manage': 'จัดการสิทธิ์การใช้งาน (บทบาทและสิทธิ์)',
    'user.create': 'สร้างผู้ใช้งาน',
    'user.view_all': 'ดูข้อมูลผู้ใช้งานทั้งหมด',
    'user.update': 'แก้ไขข้อมูลผู้ใช้งาน',
    'user.delete': 'ลบผู้ใช้งาน',
    'employee.create': 'สร้างข้อมูลพนักงาน',
    'employee.view_all': 'ดูข้อมูลพนักงานทั้งหมด',
    'employee.update': 'แก้ไขข้อมูลพนักงาน',
    'employee.delete': 'ลบข้อมูลพนักงาน',
    'asset.create': 'ลงทะเบียนทรัพย์สินใหม่',
    'asset.view': 'ดูข้อมูลทรัพย์สิน',
    'asset.update': 'แก้ไขข้อมูลทรัพย์สิน',
    'asset.delete': 'ลบข้อมูลทรัพย์สิน',
    'stock.manage': 'จัดการสต๊อกสินค้า',
    'stock.view': 'ดูข้อมูลสต๊อกสินค้า',
    'po.create': 'สร้างใบสั่งซื้อ (PO)',
    'po.view': 'ดูใบสั่งซื้อ (PO)',
    'po.approve': 'อนุมัติใบสั่งซื้อ (PO)',
    'goods_receipt.create': 'บันทึกรับสินค้าเข้าคลัง',
    'goods_receipt.view': 'ดูข้อมูลการรับสินค้าเข้าคลัง',
    'requisition.create': 'สร้างใบขอเบิก/ยืมทรัพย์สิน',
    'requisition.view_own': 'ดูใบขอเบิก/ยืมของตนเอง',
    'requisition.view_all': 'ดูใบขอเบิก/ยืมทั้งหมด',
    'requisition.approve': 'อนุมัติใบขอเบิก/ยืมทรัพย์สิน',
    'assignment.issue': 'เบิก/จ่ายทรัพย์สินให้ผู้ใช้งาน',
    'assignment.return': 'รับคืนทรัพย์สิน',
    'repair.create': 'แจ้งซ่อมทรัพย์สิน',
    'repair.view': 'ดูข้อมูลการแจ้งซ่อม',
    'repair.update': 'แก้ไขข้อมูลการแจ้งซ่อม',
    'warranty.manage': 'จัดการข้อมูลการรับประกัน',
    'disposal.create': 'สร้างรายการจำหน่ายทรัพย์สิน',
    'disposal.view': 'ดูรายการจำหน่ายทรัพย์สิน',
    'attachment.manage': 'จัดการไฟล์แนบ',
    'attachment.view': 'ดูไฟล์แนบ',
    'dashboard.view': 'ดูแดชบอร์ด',
  };

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [code, description] of Object.entries(this.descriptions)) {
      await queryRunner.query(`UPDATE "permissions" SET "description" = $1 WHERE "permission_code" = $2`, [
        description,
        code,
      ]);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const code of Object.keys(this.descriptions)) {
      await queryRunner.query(`UPDATE "permissions" SET "description" = NULL WHERE "permission_code" = $1`, [code]);
    }
  }
}
