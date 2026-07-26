import { ConflictException } from '@nestjs/common';
import { AssetStatus } from '@common/enums';

/**
 * เช็คว่า asset อยู่ในสถานะที่อนุญาตให้ทำ action นี้ได้หรือไม่ ก่อนเปลี่ยนสถานะ/สร้าง record ที่เกี่ยวข้อง
 * ใช้ร่วมกันในหลาย module (disposal, repairs, assignments) เพื่อให้ guard/ข้อความ error เป็นแบบเดียวกันทั้งระบบ
 */
export function assertAssetStatus(
  asset: { assetId: number; currentStatus: AssetStatus },
  allowed: AssetStatus[],
  actionLabel: string,
): void {
  if (!allowed.includes(asset.currentStatus)) {
    throw new ConflictException(
      `ไม่สามารถ${actionLabel}ได้ เนื่องจากทรัพย์สิน id ${asset.assetId} มีสถานะปัจจุบันเป็น '${asset.currentStatus}'`,
    );
  }
}
