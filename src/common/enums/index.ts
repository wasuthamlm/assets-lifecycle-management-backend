// ============================================================
// Enum กลางของระบบ — mirror จาก DBML ทุกตัว
// ใช้ค่าเดียวกันทั้งฝั่ง TypeORM @Column({type:'enum'}) และฝั่ง DTO validation
// ============================================================

export enum HolderType {
  EMPLOYEE = 'employee',
  DEPARTMENT = 'department',
  LOCATION = 'location',
  VENDOR = 'vendor',
}

export enum AssetStatus {
  IN_STOCK = 'in_stock',
  ASSIGNED = 'assigned',
  UNDER_REPAIR = 'under_repair',
  IN_TRANSIT = 'in_transit',
  DISPOSED = 'disposed',
  EXPIRED = 'expired',
}

export enum PoStatus {
  DRAFT = 'draft',
  ORDERED = 'ordered',
  PARTIALLY_RECEIVED = 'partially_received',
  RECEIVED = 'received',
  CANCELLED = 'cancelled',
}

export enum RequestType {
  WITHDRAW = 'withdraw',
  BORROW = 'borrow',
}

export enum ApprovalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum AssignmentType {
  PERMANENT = 'permanent',
  TEMPORARY_LOAN = 'temporary_loan',
  REPLACEMENT = 'replacement',
}

export enum ReturnCondition {
  NORMAL = 'normal',
  DAMAGED = 'damaged',
  LOST = 'lost',
}

export enum RepairStatus {
  REPORTED = 'reported',
  REPAIRING = 'repairing',
  SENT_TO_VENDOR = 'sent_to_vendor',
  REPAIRED = 'repaired',
  CLOSED = 'closed',
}

export enum RepairResult {
  FIXED = 'fixed',
  UNREPAIRABLE = 'unrepairable',
  WAITING_PARTS = 'waiting_parts',
}

export enum WarrantyStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  RENEWED = 'renewed',
}

export enum DisposalMethod {
  SOLD = 'sold',
  DONATED = 'donated',
  DESTROYED = 'destroyed',
  WRITTEN_OFF = 'written_off',
}

export enum MovementType {
  RECEIVED_TO_STOCK = 'received_to_stock',
  ISSUED = 'issued',
  RETURNED = 'returned',
  TRANSFERRED_DEPARTMENT = 'transferred_department',
  TRANSFERRED_LOCATION = 'transferred_location',
  SENT_TO_REPAIR = 'sent_to_repair',
  RETURNED_FROM_REPAIR = 'returned_from_repair',
  WARRANTY_RENEWED = 'warranty_renewed',
  DISPOSED = 'disposed',
}

// ไม่มีใน DBML — เพิ่มเข้ามารองรับการแจ้งเตือนในระบบ (ดู modules/notifications)
export enum NotificationType {
  REQUISITION_PENDING_APPROVAL = 'requisition_pending_approval',
  REQUISITION_APPROVED = 'requisition_approved',
  REQUISITION_REJECTED = 'requisition_rejected',
  WARRANTY_EXPIRING = 'warranty_expiring',
  ASSIGNMENT_OVERDUE = 'assignment_overdue',
}
