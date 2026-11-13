import { HttpException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ApprovalStatus, AssetStatus, RequestType, TicketSource } from '@common/enums';
import { Asset } from '../assets/entities/asset.entity';
import { Attachment } from '../attachments/entities/attachment.entity';
import { SupabaseStorageService } from '../storage/supabase-storage.service';
import { Employee } from '../employees/entities/employee.entity';
import { Requisition } from '../requisitions/entities/requisition.entity';
import { RequisitionsService } from '../requisitions/requisitions.service';
import {
  BorrowSummary,
  LineMessage,
  borrowApproverMessage,
  borrowAssetsMessage,
  borrowCategoriesMessage,
  borrowConfirmMessage,
  borrowTypeMessage,
  requisitionCreatedMessage,
  textMessage,
} from './line-flex';

/** ข้อมูลผู้ใช้ที่ผูก LINE แล้ว (จาก JwtStrategy.validate) เท่าที่ flow นี้ใช้ */
export interface BorrowUser {
  employeeId: number;
  permissions: string[];
  roles: string[];
}

const ASSETS_PER_PAGE = 9; // carousel ได้สูงสุด 12 — เหลือที่ให้การ์ด "ดูเพิ่ม"
const LINE_REASON = 'ส่งคำขอผ่าน LINE';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LINE_IMAGE_TYPES = ['image/jpeg', 'image/png'];
const IMAGE_URL_TTL_SECONDS = 7 * 24 * 3600;

/** วันที่ปัจจุบันตามเวลาไทยแบบ YYYY-MM-DD (process TZ เป็น UTC) */
export function bangkokToday(now = new Date(), addDays = 0): string {
  const d = new Date(now.getTime() + 7 * 3600_000 + addDays * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/**
 * เบิก/ยืมอุปกรณ์ผ่านแชท: ประเภท → เครื่อง → ยืม(เลือกวันคืน)/เบิก → ผู้อนุมัติ → ยืนยัน
 *
 * ไม่เก็บ state ฝั่ง server — ทุกขั้นพกค่าที่เลือกไว้ไปใน postback data ของปุ่มถัดไป (Render free tier
 * หลับ/deploy ใหม่ได้ตลอด session ในหน่วยความจำจะหายกลางทาง) แต่ data มาจากฝั่ง client จึงต้อง
 * ตรวจซ้ำทุกขั้น และกฎจริงทั้งหมด (ของต้องว่าง, หมวด HR-only, ผู้อนุมัติต้องเป็น it_admin, ยืมต้องมีวันคืน)
 * ยังบังคับโดย RequisitionsService.create ตัวเดียวกับเว็บ
 *
 * ข้อจำกัดโดยตั้งใจ: 1 คำขอ = 1 เครื่อง (serialized asset) และผู้อนุมัติ 1 ระดับ — หลายรายการ/หลายระดับ/วัสดุสิ้นเปลือง ให้ใช้เว็บ
 */
@Injectable()
export class LineBorrowService {
  constructor(
    private requisitions: RequisitionsService,
    @InjectRepository(Asset) private assets: Repository<Asset>,
    @InjectRepository(Employee) private employees: Repository<Employee>,
    @InjectRepository(Requisition) private requisitionRepo: Repository<Requisition>,
    @InjectRepository(Attachment) private attachments: Repository<Attachment>,
    private storage: SupabaseStorageService,
  ) {}

  async handle(user: BorrowUser, params: URLSearchParams, webUrl?: string): Promise<LineMessage[]> {
    if (!user.permissions.includes('requisition.create')) {
      return [textMessage('บัญชีของคุณไม่มีสิทธิ์เบิก/ยืมอุปกรณ์ กรุณาติดต่อฝ่าย IT', true)];
    }
    const action = params.get('a');
    if (action === 'bx') return [textMessage('ยกเลิกการเบิก/ยืมแล้วครับ', true)];
    if (action === 'menu') return [await this.categories(user, webUrl)];
    if (action === 'bc') return [await this.assetPage(user, num(params.get('c')), num(params.get('p')) || 1)];

    // ขั้นที่เหลือต้องมีเครื่องที่เลือกเสมอ — ตรวจซ้ำทุกครั้งว่ายังว่างและผู้ใช้มีสิทธิ์ขอหมวดนี้
    const asset = await this.loadSelectableAsset(user, num(params.get('as')));
    if (typeof asset === 'string') return [textMessage(asset, true)];
    const summary: BorrowSummary = { assetName: asset.assetName };
    // รูปแสดงเฉพาะการ์ดเลือกประเภทและการ์ดยืนยัน — ขั้นอื่นไม่ต้องเสียเวลาขอ signed URL
    if (action === 'ba' || action === 'bt' || action === 'bp') {
      summary.imageUrl = (await this.assetImageUrls([asset.assetId])).get(asset.assetId) ?? null;
    }

    if (action === 'ba') {
      return [borrowTypeMessage(summary, asset.assetId, bangkokToday(new Date(), 1), bangkokToday(new Date(), 7))];
    }

    const type = params.get('t') === 'b' ? RequestType.BORROW : params.get('t') === 'w' ? RequestType.WITHDRAW : null;
    if (!type) return [textMessage('ข้อมูลไม่ครบ กรุณาเริ่มเบิก/ยืมใหม่อีกครั้ง', true)];
    // datetimepicker ส่งวันที่มาใน postback.params.date ครั้งแรก — ขั้นถัดไปพกต่อใน data เป็น d
    const due = type === RequestType.BORROW ? (params.get('date') ?? params.get('d')) : null;
    if (type === RequestType.BORROW && (!due || !DATE_RE.test(due) || due <= bangkokToday())) {
      return [textMessage('วันคืนต้องเป็นวันพรุ่งนี้หรือหลังจากนั้น กรุณาเลือกใหม่', true)];
    }
    summary.requestType = type;
    summary.dueDate = due;
    const base = `as=${asset.assetId}&t=${type === RequestType.BORROW ? 'b' : 'w'}${due ? `&d=${due}` : ''}`;

    // it_admin ขอเองจะอนุมัติอัตโนมัติ (กฎใน RequisitionsService.create) ไม่ต้องเลือกผู้อนุมัติ
    const isAdmin = user.roles.includes('it_admin');
    const admins = isAdmin ? [] : await this.itAdmins();
    if (!isAdmin && !admins.length) return [textMessage('ยังไม่มีผู้ดูแลระบบ IT ในระบบที่อนุมัติได้ กรุณาติดต่อฝ่าย IT', true)];

    if (action === 'bt') {
      if (isAdmin) return [borrowConfirmMessage({ ...summary, approverName: null }, `a=bs&${base}`)];
      // มีผู้อนุมัติได้คนเดียว ไม่ต้องให้เลือก
      if (admins.length === 1) {
        return [borrowConfirmMessage({ ...summary, approverName: admins[0].fullName }, `a=bs&${base}&ap=${admins[0].employeeId}`)];
      }
      return [borrowApproverMessage(summary, admins, `a=bp&${base}`)];
    }

    const approverId = isAdmin ? null : num(params.get('ap'));
    const approver = admins.find((a) => a.employeeId === approverId);
    if (!isAdmin && !approver) return [textMessage('ผู้อนุมัติไม่ถูกต้อง กรุณาเริ่มเบิก/ยืมใหม่อีกครั้ง', true)];
    summary.approverName = approver?.fullName ?? null;

    if (action === 'bp') return [borrowConfirmMessage(summary, `a=bs&${base}${approver ? `&ap=${approver.employeeId}` : ''}`)];
    if (action === 'bs') return [await this.submit(user, asset, summary, type, due, approver?.employeeId ?? null, webUrl)];
    return [textMessage('ไม่รู้จักคำสั่งนี้ กรุณาเริ่มใหม่จากเมนู', true)];
  }

  private canRequestHrOnly(user: BorrowUser) {
    return user.permissions.includes('requisition.create_on_behalf');
  }

  private async categories(user: BorrowUser, webUrl?: string): Promise<LineMessage> {
    const hrFlag = 'COALESCE(c.requiresHrRequest, false) OR COALESCE(p.requiresHrRequest, false)';
    const rows = await this.assets
      .createQueryBuilder('a')
      .innerJoin('a.category', 'c')
      .leftJoin('c.parent', 'p')
      .select('c.categoryId', 'categoryId')
      .addSelect('c.categoryName', 'name')
      .addSelect(`BOOL_OR(${hrFlag})`, 'hrOnly')
      .addSelect('COUNT(*)', 'count')
      .where('a.currentStatus = :status', { status: AssetStatus.IN_STOCK })
      .groupBy('c.categoryId')
      .addGroupBy('c.categoryName')
      .orderBy('c.categoryName', 'ASC')
      .getRawMany<{ categoryId: number; name: string; hrOnly: boolean; count: string }>();

    const allowed = this.canRequestHrOnly(user) ? rows : rows.filter((r) => !r.hrOnly);
    return borrowCategoriesMessage(
      allowed.map((r) => ({ categoryId: Number(r.categoryId), name: r.name, count: Number(r.count) })),
      allowed.length < rows.length,
      webUrl,
    );
  }

  private async assetPage(user: BorrowUser, categoryId: number, page: number): Promise<LineMessage> {
    const rows = await this.assets.find({
      where: { categoryId, currentStatus: AssetStatus.IN_STOCK },
      relations: { category: { parent: true }, currentLocation: true },
      order: { assetName: 'ASC', assetId: 'ASC' },
      skip: (page - 1) * ASSETS_PER_PAGE,
      take: ASSETS_PER_PAGE + 1,
    });
    const category = rows[0]?.category;
    if (!category) return textMessage('อุปกรณ์ประเภทนี้ไม่มีเครื่องว่างแล้ว ลองเลือกประเภทอื่นครับ', true);
    if (!this.canRequestHrOnly(user) && isHrOnly(rows[0])) {
      return textMessage(`"${category.categoryName}" ต้องให้ HR เป็นผู้ทำรายการเบิก/ยืมให้ กรุณาติดต่อ HR`, true);
    }
    const shown = rows.slice(0, ASSETS_PER_PAGE);
    const images = await this.assetImageUrls(shown.map((a) => a.assetId));
    return borrowAssetsMessage(
      category.categoryName,
      categoryId,
      shown.map((a) => ({
        assetId: a.assetId,
        assetName: a.assetName,
        brand: a.brand,
        model: a.model,
        locationName: a.currentLocation?.locationName,
        imageUrl: images.get(a.assetId) ?? null,
      })),
      page,
      rows.length > ASSETS_PER_PAGE,
    );
  }

  /**
   * รูปแรกที่อัปโหลดไว้ของแต่ละทรัพย์สิน (attachments referenceType = 'asset' — หน้าเพิ่มทรัพย์สินบนเว็บ)
   * bucket เป็น private จึงต้องใช้ signed URL; ตั้งอายุ 7 วันเพราะผู้ใช้อาจเลื่อนกลับมาดูการ์ดเดิมทีหลัง
   * LINE แสดงได้เฉพาะ jpeg/png; ขอ URL ไม่สำเร็จก็แค่ไม่มีรูป ไม่ทำให้ flow พัง
   */
  private async assetImageUrls(assetIds: number[]): Promise<Map<number, string>> {
    const result = new Map<number, string>();
    if (!assetIds.length) return result;
    try {
      const rows = await this.attachments.find({
        where: { referenceType: 'asset', referenceId: In(assetIds), mimeType: In(LINE_IMAGE_TYPES) },
        order: { createdAt: 'ASC', attachmentId: 'ASC' },
      });
      const firstPerAsset = new Map<number, string>();
      for (const r of rows) if (!firstPerAsset.has(r.referenceId)) firstPerAsset.set(r.referenceId, r.fileUrl);
      await Promise.all(
        [...firstPerAsset].map(async ([assetId, fileUrl]) => {
          const url = /^https:\/\//.test(fileUrl) ? fileUrl : await this.storage.createSignedUrl(fileUrl, IMAGE_URL_TTL_SECONDS).catch(() => null);
          if (url?.startsWith('https://')) result.set(assetId, url);
        }),
      );
    } catch {
      // ไม่มีรูปก็ยังเบิก/ยืมได้ตามปกติ
    }
    return result;
  }

  /** คืนข้อความ error เป็น string ถ้าเลือกเครื่องนี้ไม่ได้ */
  private async loadSelectableAsset(user: BorrowUser, assetId: number): Promise<Asset | string> {
    if (!assetId) return 'ข้อมูลไม่ครบ กรุณาเริ่มเบิก/ยืมใหม่อีกครั้ง';
    const asset = await this.assets.findOne({ where: { assetId }, relations: { category: { parent: true } } });
    if (!asset) return 'ไม่พบอุปกรณ์นี้แล้ว กรุณาเลือกใหม่';
    if (!this.canRequestHrOnly(user) && isHrOnly(asset)) {
      return `"${asset.assetName}" ต้องให้ HR เป็นผู้ทำรายการเบิก/ยืมให้ กรุณาติดต่อ HR`;
    }
    if (asset.currentStatus !== AssetStatus.IN_STOCK) return `"${asset.assetName}" ไม่ว่างแล้ว กรุณาเลือกเครื่องอื่น`;
    return asset;
  }

  private async itAdmins(): Promise<{ employeeId: number; fullName: string }[]> {
    const rows = await this.employees
      .createQueryBuilder('e')
      .innerJoin('e.employeeRoles', 'er')
      .innerJoin('er.role', 'r')
      .where('r.roleName = :roleName', { roleName: 'it_admin' })
      .orderBy('e.fullName', 'ASC')
      .getMany();
    return rows.map((e) => ({ employeeId: e.employeeId, fullName: e.fullName }));
  }

  private async submit(
    user: BorrowUser,
    asset: Asset,
    summary: BorrowSummary,
    type: RequestType,
    due: string | null,
    approverId: number | null,
    webUrl?: string,
  ): Promise<LineMessage> {
    // กดยืนยันซ้ำ (เน็ตช้า/กดสองที) — ไม่เปิดใบซ้ำ ตอบเลขใบเดิมกลับไป
    const existing = await this.requisitionRepo
      .createQueryBuilder('r')
      .innerJoin('r.items', 'i')
      .where('r.requestedBy = :me', { me: user.employeeId })
      .andWhere('r.overallStatus = :pending', { pending: ApprovalStatus.PENDING })
      .andWhere('i.assetId = :assetId', { assetId: asset.assetId })
      .getOne();
    if (existing) return textMessage(`คุณส่งคำขอเครื่องนี้ไว้แล้ว (${existing.requisitionNo}) รออนุมัติอยู่ครับ`, true);

    try {
      const created = await this.requisitions.create(
        {
          requestType: type,
          dueDate: due ?? undefined,
          reason: LINE_REASON,
          items: [{ assetId: asset.assetId, quantity: 1 }],
          approverIds: approverId != null ? [approverId] : undefined,
        },
        { employeeId: user.employeeId, permissions: user.permissions },
        { source: TicketSource.LINE },
      );
      return requisitionCreatedMessage(created, summary, webUrl);
    } catch (err) {
      // กฎธุรกิจจาก RequisitionsService (ของไม่ว่าง/ไม่มีสิทธิ์ ฯลฯ) — ข้อความไทยอ่านรู้เรื่องอยู่แล้ว ส่งต่อให้ผู้ใช้
      if (err instanceof HttpException) return textMessage(`ส่งคำขอไม่สำเร็จ: ${err.message}`, true);
      throw err;
    }
  }
}

const num = (v: string | null) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 0;
};

const isHrOnly = (asset: Asset) => !!(asset.category?.requiresHrRequest || asset.category?.parent?.requiresHrRequest);
