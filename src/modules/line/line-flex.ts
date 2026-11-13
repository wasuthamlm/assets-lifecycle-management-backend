import { ApprovalStatus, RequestType, TicketCategory, TicketStatus } from '@common/enums';

/**
 * ตัวสร้าง Flex Message ของแชทบอท LINE — pure function ล้วน (ไม่มี DI) ให้ทั้ง LineChatService
 * และ SupportTicketsService (push แจ้งสถานะ) เรียกใช้ได้โดยไม่ import module วนกัน
 * ลองดูหน้าตาได้ที่ https://developers.line.biz/flex-simulator/ (copy `contents` ไปวาง)
 *
 * ข้อจำกัด LINE ที่ต้องระวัง: carousel ≤ 12 bubble, postback data ≤ 300 ตัวอักษร, quick reply ≤ 13 ปุ่ม,
 * label ของปุ่ม ≤ 40 ตัวอักษร (quick reply ≤ 20), altText ≤ 400
 */
export type LineMessage = Record<string, unknown>;
type FlexNode = Record<string, unknown>;

const C = {
  ticket: '#4F46E5',
  ticketSoft: '#EEF2FF',
  borrow: '#0E7490',
  borrowSoft: '#ECFEFF',
  text: '#0F172A',
  sub: '#64748B',
  faint: '#94A3B8',
  line: '#E2E8F0',
  ok: '#16A34A',
  warn: '#D97706',
  danger: '#DC2626',
  gray: '#64748B',
};

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  [TicketStatus.OPEN]: 'รอดำเนินการ',
  [TicketStatus.IN_PROGRESS]: 'กำลังดำเนินการ',
  [TicketStatus.RESOLVED]: 'แก้ไขแล้ว',
  [TicketStatus.CLOSED]: 'ปิดงาน',
  [TicketStatus.CANCELLED]: 'ยกเลิก',
};
const TICKET_STATUS_COLOR: Record<TicketStatus, string> = {
  [TicketStatus.OPEN]: C.warn,
  [TicketStatus.IN_PROGRESS]: C.ticket,
  [TicketStatus.RESOLVED]: C.ok,
  [TicketStatus.CLOSED]: C.gray,
  [TicketStatus.CANCELLED]: C.danger,
};
export const TICKET_CATEGORY_LABEL: Record<TicketCategory, string> = {
  [TicketCategory.HARDWARE]: 'ฮาร์ดแวร์',
  [TicketCategory.ACCESSORY]: 'อุปกรณ์เสริม',
  [TicketCategory.SOFTWARE]: 'ซอฟต์แวร์',
  [TicketCategory.NETWORK]: 'เครือข่าย/อินเทอร์เน็ต',
  [TicketCategory.ACCOUNT]: 'บัญชี/รหัสผ่าน',
  [TicketCategory.OTHER]: 'อื่นๆ',
};
const APPROVAL_LABEL: Record<ApprovalStatus, string> = {
  [ApprovalStatus.PENDING]: 'รออนุมัติ',
  [ApprovalStatus.APPROVED]: 'อนุมัติแล้ว',
  [ApprovalStatus.REJECTED]: 'ไม่อนุมัติ',
};
const APPROVAL_COLOR: Record<ApprovalStatus, string> = {
  [ApprovalStatus.PENDING]: C.warn,
  [ApprovalStatus.APPROVED]: C.ok,
  [ApprovalStatus.REJECTED]: C.danger,
};
export const REQUEST_TYPE_LABEL: Record<RequestType, string> = {
  [RequestType.BORROW]: 'ยืมชั่วคราว',
  [RequestType.WITHDRAW]: 'เบิกใช้งานประจำ',
};

// ───────────────────────── helpers ─────────────────────────

const clip = (s: string | null | undefined, max: number) => {
  const v = (s ?? '').trim() || '-';
  return v.length > max ? `${v.slice(0, max - 1)}…` : v;
};

/** วันที่แบบไทย เช่น "20 พ.ย. 2569" — รับทั้ง Date และ 'YYYY-MM-DD' (คอลัมน์ type date ของ pg คืนเป็น string) */
export function thaiDate(value: Date | string | null | undefined): string {
  if (!value) return '-';
  const d = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00+07:00`) : new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric' });
}

const text = (t: string, extra: FlexNode = {}): FlexNode => ({ type: 'text', text: t, wrap: true, size: 'sm', color: C.text, ...extra });

const row = (label: string, value: string, valueColor = C.text): FlexNode => ({
  type: 'box',
  layout: 'horizontal',
  spacing: 'md',
  contents: [
    text(label, { color: C.sub, flex: 3, wrap: false }),
    text(value, { color: valueColor, flex: 7, weight: 'bold' }),
  ],
});

const pill = (label: string, color: string): FlexNode => ({
  type: 'box',
  layout: 'baseline',
  backgroundColor: `${color}1F`,
  cornerRadius: '999px',
  paddingStart: '10px',
  paddingEnd: '10px',
  paddingTop: '3px',
  paddingBottom: '3px',
  flex: 0,
  contents: [text(label, { size: 'xxs', color, weight: 'bold', wrap: false })],
});

const separator = (): FlexNode => ({ type: 'separator', color: C.line, margin: 'lg' });

/** postback ที่ไม่ส่งข้อความเข้าแชท (ใช้กับปุ่มที่กดซ้ำได้ เช่น ดูเพิ่ม) หรือส่งข้อความที่อ่านเข้าใจได้แทน */
const postback = (label: string, data: string, displayText?: string): FlexNode => ({
  type: 'postback',
  label: clip(label, 40),
  data,
  ...(displayText ? { displayText } : {}),
});

const button = (action: FlexNode, style: 'primary' | 'secondary' | 'link' = 'secondary', color?: string): FlexNode => ({
  type: 'button',
  style,
  height: 'sm',
  action,
  ...(color ? { color } : {}),
});

const uriButton = (label: string, uri: string, color = C.sub): FlexNode =>
  button({ type: 'uri', label, uri }, 'link', color);

/** หัวการ์ดแบบแถบสี — ใช้สีแยกงาน: ม่วง = แจ้งปัญหา, เขียวน้ำทะเล = เบิก/ยืม */
const header = (eyebrow: string, title: string, color: string): FlexNode => ({
  type: 'box',
  layout: 'vertical',
  backgroundColor: color,
  paddingAll: '18px',
  spacing: 'xs',
  contents: [
    text(eyebrow, { size: 'xxs', color: '#FFFFFFB3', weight: 'bold', wrap: false }),
    text(title, { size: 'lg', color: '#FFFFFF', weight: 'bold' }),
  ],
});

const bubble = (parts: { header?: FlexNode; body: FlexNode[]; footer?: FlexNode[]; size?: string }): FlexNode => ({
  type: 'bubble',
  size: parts.size ?? 'mega',
  ...(parts.header ? { header: parts.header } : {}),
  body: { type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '18px', contents: parts.body },
  ...(parts.footer?.length
    ? { footer: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '14px', paddingTop: '0px', contents: parts.footer } }
    : {}),
});

const flex = (altText: string, contents: FlexNode, quickReply?: FlexNode[]): LineMessage => ({
  type: 'flex',
  altText: clip(altText, 400),
  contents,
  ...(quickReply?.length ? { quickReply: { items: quickReply } } : {}),
});

const quickPostback = (label: string, data: string, displayText: string): FlexNode => ({
  type: 'action',
  action: { type: 'postback', label: clip(label, 20), data, displayText },
});

/** ปุ่มลัดใต้ข้อความ — ให้ทุกคำตอบมีทางไปต่อเสมอ ไม่ต้องพึ่ง rich menu อย่างเดียว */
export const MENU_QUICK_REPLY: FlexNode[] = [
  quickPostback('🛠 แจ้งปัญหา IT', 'a=menu&m=ticket', 'แจ้งปัญหา IT'),
  quickPostback('📦 เบิก/ยืมอุปกรณ์', 'a=menu&m=borrow', 'เบิก/ยืมอุปกรณ์'),
  quickPostback('📋 ติดตามสถานะ', 'a=menu&m=status', 'ติดตามสถานะ'),
  quickPostback('💻 อุปกรณ์ของฉัน', 'a=menu&m=assets', 'อุปกรณ์ของฉัน'),
];

export const textMessage = (t: string, withMenu = false): LineMessage => ({
  type: 'text',
  text: t.slice(0, 5000),
  ...(withMenu ? { quickReply: { items: MENU_QUICK_REPLY } } : {}),
});

// เฉพาะ https — ค่า default ของ FRONTEND_URL คือ http://localhost:5173 ซึ่งเปิดจากมือถือไม่ได้
const webLink = (webUrl: string | undefined, path: string) => (webUrl?.startsWith('https://') ? `${webUrl.replace(/\/$/, '')}${path}` : null);

// ───────────────────────── เมนู / ช่วยเหลือ ─────────────────────────

export function helpMessage(name: string | null, webUrl?: string): LineMessage {
  const item = (icon: string, title: string, desc: string) => ({
    type: 'box',
    layout: 'horizontal',
    spacing: 'md',
    contents: [
      text(icon, { size: 'xl', flex: 0, wrap: false }),
      { type: 'box', layout: 'vertical', contents: [text(title, { weight: 'bold' }), text(desc, { size: 'xs', color: C.sub })] },
    ],
  });
  const web = webLink(webUrl, '/');
  return flex(
    'เมนูช่วยเหลือฝ่าย IT',
    bubble({
      header: header('IT SERVICE DESK', name ? `สวัสดีคุณ${name} 👋` : 'สวัสดีครับ 👋', C.ticket),
      body: [
        text('เลือกจากเมนูด้านล่าง หรือพิมพ์อาการที่พบมาได้เลย', { color: C.sub }),
        item('🛠', 'แจ้งปัญหา IT', 'พิมพ์อาการ 1 ข้อความ = 1 เรื่อง แนบรูปตามได้'),
        item('📦', 'เบิก/ยืมอุปกรณ์', 'เลือกอุปกรณ์ที่ว่างอยู่ แล้วส่งให้ IT อนุมัติ'),
        item('📋', 'ติดตามสถานะ', 'ดูเรื่องที่แจ้งและคำขอล่าสุด'),
        item('💻', 'อุปกรณ์ของฉัน', 'เครื่องที่ถืออยู่และกำหนดคืน'),
      ],
      footer: web ? [uriButton('เปิดระบบบนเว็บ', web, C.ticket)] : [],
    }),
    MENU_QUICK_REPLY,
  );
}

export function notLinkedMessage(webUrl?: string): LineMessage {
  const profile = webLink(webUrl, '/profile');
  return flex(
    'กรุณาเชื่อมบัญชีพนักงานก่อนใช้งาน',
    bubble({
      header: header('เริ่มต้นใช้งาน', 'เชื่อมบัญชีพนักงาน', C.ticket),
      body: [
        text('ทำครั้งเดียว ใช้ได้ตลอด', { color: C.sub }),
        text('1. เข้าเว็บระบบทรัพย์สิน IT → เมนู "โปรไฟล์"'),
        text('2. กด "ขอรหัสเชื่อมต่อ"'),
        text('3. พิมพ์รหัส 6 หลักที่ได้ ส่งในแชทนี้'),
      ],
      footer: profile ? [button({ type: 'uri', label: 'เปิดหน้าโปรไฟล์', uri: profile }, 'primary', C.ticket)] : [],
    }),
  );
}

// ───────────────────────── แจ้งปัญหา IT ─────────────────────────

export function ticketPromptMessage(): LineMessage {
  return flex(
    'พิมพ์อาการที่พบส่งมาได้เลย',
    bubble({
      header: header('แจ้งปัญหา IT', 'พิมพ์อาการที่พบส่งมาได้เลย', C.ticket),
      body: [
        text('1 ข้อความ = 1 เรื่อง ระบบจะเปิดใบแจ้งให้ทันที', { color: C.sub }),
        {
          type: 'box',
          layout: 'vertical',
          backgroundColor: C.ticketSoft,
          cornerRadius: '12px',
          paddingAll: '12px',
          spacing: 'xs',
          contents: [
            text('ตัวอย่าง', { size: 'xxs', color: C.ticket, weight: 'bold' }),
            text('"โน้ตบุ๊กเปิดไม่ติด ไฟไม่ขึ้น\nอยู่ชั้น 3 ห้องบัญชี โทร 1234"', { size: 'sm' }),
          ],
        },
        text('💡 บอกอาการ + ที่อยู่/ห้อง + เบอร์ติดต่อ จะช่วยให้ IT ไปถึงเร็วขึ้น', { size: 'xs', color: C.sub }),
        text('📷 มีรูปประกอบ ส่งตามมาได้ภายใน 15 นาที', { size: 'xs', color: C.sub }),
      ],
    }),
  );
}

export interface TicketCardInput {
  ticketId: number;
  ticketNo: string;
  subject: string;
  category: TicketCategory;
  status: TicketStatus;
  resolution?: string | null;
  createdAt?: Date | string;
}

/** การ์ดยืนยันรับเรื่อง — ถ้ายังเป็นหมวด "อื่นๆ" แนบปุ่มลัดให้ผู้แจ้งเลือกประเภทได้ (ไม่บังคับ IT จัดหมวดเองได้) */
export function ticketCreatedMessage(t: TicketCardInput, webUrl?: string): LineMessage {
  const detail = webLink(webUrl, `/support-tickets/${t.ticketId}`);
  const categoryQuick =
    t.category === TicketCategory.OTHER
      ? (Object.values(TicketCategory) as TicketCategory[])
          .filter((c) => c !== TicketCategory.OTHER)
          .map((c) => quickPostback(TICKET_CATEGORY_LABEL[c], `a=tc&id=${t.ticketId}&c=${c}`, `ประเภท: ${TICKET_CATEGORY_LABEL[c]}`))
      : [];
  return flex(
    `รับเรื่องแล้ว ${t.ticketNo}`,
    bubble({
      header: header('✅ รับเรื่องแล้ว', t.ticketNo, C.ticket),
      body: [
        text(clip(t.subject, 120), { weight: 'bold', size: 'md' }),
        { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [pill(TICKET_STATUS_LABEL[t.status], TICKET_STATUS_COLOR[t.status]), pill(TICKET_CATEGORY_LABEL[t.category], C.gray)] },
        separator(),
        text('ทีม IT จะแจ้งความคืบหน้าทางแชทนี้', { size: 'xs', color: C.sub }),
        text('📷 ส่งรูปประกอบตามมาได้ภายใน 15 นาที', { size: 'xs', color: C.sub }),
        ...(categoryQuick.length ? [text('👇 ช่วยเลือกประเภทปัญหาด้านล่าง (ไม่บังคับ)', { size: 'xs', color: C.ticket, weight: 'bold' })] : []),
      ],
      footer: detail ? [uriButton('ดูรายละเอียดบนเว็บ', detail, C.ticket)] : [],
    }),
    categoryQuick.length ? categoryQuick : MENU_QUICK_REPLY,
  );
}

/** push ตอน IT เปลี่ยนสถานะ — ส่งเฉพาะ ticket ที่แจ้งมาทาง LINE (ดู SupportTicketsService) */
export function ticketStatusMessage(t: TicketCardInput, webUrl?: string): LineMessage {
  const label = TICKET_STATUS_LABEL[t.status];
  const detail = webLink(webUrl, `/support-tickets/${t.ticketId}`);
  const showResolution = t.resolution && t.status !== TicketStatus.IN_PROGRESS;
  return flex(
    `${t.ticketNo}: ${label}`,
    bubble({
      header: header('อัปเดตสถานะ', t.ticketNo, TICKET_STATUS_COLOR[t.status]),
      body: [
        text(clip(t.subject, 120), { weight: 'bold', size: 'md' }),
        { type: 'box', layout: 'horizontal', contents: [pill(label, TICKET_STATUS_COLOR[t.status])] },
        ...(showResolution
          ? [separator(), text('ผลการดำเนินการ', { size: 'xs', color: C.sub }), text(clip(t.resolution, 500))]
          : []),
      ],
      footer: detail ? [uriButton('ดูรายละเอียดบนเว็บ', detail, C.ticket)] : [],
    }),
  );
}

// ───────────────────────── ติดตามสถานะ / อุปกรณ์ของฉัน ─────────────────────────

export interface RequisitionCardInput {
  requisitionId: number;
  requisitionNo: string;
  requestType: RequestType;
  overallStatus: ApprovalStatus;
  dueDate?: Date | string | null;
  assetNames: string[];
}

export function statusOverviewMessage(tickets: TicketCardInput[], requisitions: RequisitionCardInput[], webUrl?: string): LineMessage {
  const listRow = (no: string, title: string, status: string, color: string): FlexNode => ({
    type: 'box',
    layout: 'vertical',
    spacing: 'xs',
    contents: [
      {
        type: 'box',
        layout: 'horizontal',
        contents: [text(no, { size: 'xs', color: C.sub, wrap: false, flex: 1, gravity: 'center' }), pill(status, color)],
      },
      text(clip(title, 60), { weight: 'bold' }),
    ],
  });
  const withSeparators = (rows: FlexNode[]) => rows.flatMap((r, i) => (i === 0 ? [r] : [separator(), r]));

  const ticketRows = tickets.map((t) => listRow(t.ticketNo, t.subject, TICKET_STATUS_LABEL[t.status], TICKET_STATUS_COLOR[t.status]));
  const reqRows = requisitions.map((r) =>
    listRow(
      `${r.requisitionNo} · ${REQUEST_TYPE_LABEL[r.requestType]}`,
      r.assetNames.join(', ') || 'คำขอเบิก/ยืม',
      APPROVAL_LABEL[r.overallStatus],
      APPROVAL_COLOR[r.overallStatus],
    ),
  );
  const ticketsWeb = webLink(webUrl, '/support-tickets/mine');
  const reqWeb = webLink(webUrl, '/requisitions');

  return flex(
    'สถานะเรื่องที่แจ้งและคำขอของคุณ',
    {
      type: 'carousel',
      contents: [
        bubble({
          header: header('ติดตามสถานะ', 'แจ้งปัญหา IT ล่าสุด', C.ticket),
          body: ticketRows.length ? withSeparators(ticketRows) : [text('ยังไม่มีเรื่องที่แจ้งไว้', { color: C.sub })],
          footer: ticketsWeb ? [uriButton('ดูทั้งหมดบนเว็บ', ticketsWeb, C.ticket)] : [],
        }),
        bubble({
          header: header('ติดตามสถานะ', 'คำขอเบิก/ยืมล่าสุด', C.borrow),
          body: reqRows.length ? withSeparators(reqRows) : [text('ยังไม่มีคำขอเบิก/ยืม', { color: C.sub })],
          footer: reqWeb ? [uriButton('ดูทั้งหมดบนเว็บ', reqWeb, C.borrow)] : [],
        }),
      ],
    },
    MENU_QUICK_REPLY,
  );
}

export interface MyAssetInput {
  assetName: string;
  assetNo: string;
  serialNumber?: string | null;
  categoryName?: string | null;
  isLoan: boolean;
  dueDate?: Date | string | null;
  issuedDate?: Date | string | null;
}

export function myAssetsMessage(items: MyAssetInput[], todayIso: string): LineMessage {
  if (!items.length) return textMessage('ตอนนี้คุณยังไม่มีอุปกรณ์ที่ถือครองอยู่ในระบบ', true);
  const shown = items.slice(0, 10);
  const cards = shown.map((a) => {
    const due = a.dueDate ? String(a.dueDate).slice(0, 10) : null;
    const overdue = !!due && due < todayIso;
    return bubble({
      size: 'kilo',
      header: header(a.isLoan ? 'ยืมชั่วคราว' : 'ใช้งานประจำ', clip(a.assetName, 60), a.isLoan ? C.borrow : C.ticket),
      body: [
        row('รหัส', a.assetNo),
        row('S/N', a.serialNumber || '-'),
        row('หมวด', a.categoryName || '-'),
        row('รับเมื่อ', thaiDate(a.issuedDate)),
        ...(a.isLoan ? [row('กำหนดคืน', overdue ? `${thaiDate(due)} (เลยกำหนด)` : thaiDate(due), overdue ? C.danger : C.text)] : []),
      ],
    });
  });
  return flex(`อุปกรณ์ที่คุณถือครอง ${items.length} รายการ`, { type: 'carousel', contents: cards }, MENU_QUICK_REPLY);
}

// ───────────────────────── เบิก/ยืมอุปกรณ์ ─────────────────────────

export interface BorrowCategoryInput {
  categoryId: number;
  name: string;
  count: number;
}

export function borrowCategoriesMessage(categories: BorrowCategoryInput[], hrOnlyHidden: boolean, webUrl?: string): LineMessage {
  const web = webLink(webUrl, '/requisitions/new');
  if (!categories.length) {
    return textMessage('ตอนนี้ไม่มีอุปกรณ์ว่างในสต๊อกที่เบิก/ยืมได้ครับ' + (hrOnlyHidden ? '\n(โน้ตบุ๊ก/แท็บเล็ต ต้องให้ HR ทำรายการให้)' : ''), true);
  }
  const shown = categories.slice(0, 10);
  return flex(
    'เลือกประเภทอุปกรณ์ที่ต้องการเบิก/ยืม',
    bubble({
      header: header('เบิก/ยืมอุปกรณ์ · ขั้นที่ 1/3', 'ต้องการอุปกรณ์ประเภทไหน?', C.borrow),
      body: [
        ...shown.map((c) =>
          button(postback(`${c.name}  (ว่าง ${c.count})`, `a=bc&c=${c.categoryId}`, `เบิก/ยืม: ${c.name}`), 'secondary'),
        ),
        ...(categories.length > shown.length ? [text(`และอีก ${categories.length - shown.length} ประเภท ดูได้บนเว็บ`, { size: 'xs', color: C.sub })] : []),
        ...(hrOnlyHidden ? [text('ℹ️ โน้ตบุ๊ก/แท็บเล็ต ต้องให้ HR ทำรายการให้', { size: 'xs', color: C.sub })] : []),
      ],
      footer: web ? [uriButton('ขอหลายรายการพร้อมกัน (เว็บ)', web, C.borrow)] : [],
    }),
  );
}

export interface BorrowAssetInput {
  assetId: number;
  assetName: string;
  assetNo: string;
  brand?: string | null;
  model?: string | null;
  serialNumber?: string | null;
}

export function borrowAssetsMessage(categoryName: string, categoryId: number, assets: BorrowAssetInput[], page: number, hasMore: boolean): LineMessage {
  const cards: FlexNode[] = assets.map((a) =>
    bubble({
      size: 'kilo',
      header: header(clip(categoryName, 40), clip(a.assetName, 60), C.borrow),
      body: [
        row('รหัส', a.assetNo),
        row('ยี่ห้อ', [a.brand, a.model].filter(Boolean).join(' ') || '-'),
        row('S/N', a.serialNumber || '-'),
        { type: 'box', layout: 'horizontal', contents: [pill('ว่าง พร้อมใช้', C.ok)] },
      ],
      footer: [button(postback('เลือกเครื่องนี้', `a=ba&as=${a.assetId}`, `เลือก ${clip(a.assetName, 40)} (${a.assetNo})`), 'primary', C.borrow)],
    }),
  );
  if (hasMore) {
    cards.push({
      type: 'bubble',
      size: 'kilo',
      body: {
        type: 'box',
        layout: 'vertical',
        justifyContent: 'center',
        paddingAll: '18px',
        contents: [button(postback('ดูเครื่องถัดไป →', `a=bc&c=${categoryId}&p=${page + 1}`), 'link', C.borrow)],
      },
    });
  }
  return flex(`เลือกเครื่อง${categoryName}ที่ต้องการ`, { type: 'carousel', contents: cards });
}

export interface BorrowSummary {
  assetName: string;
  assetNo: string;
  requestType?: RequestType;
  dueDate?: string | null;
  approverName?: string | null;
}

const summaryRows = (s: BorrowSummary): FlexNode[] => [
  row('อุปกรณ์', `${s.assetName} (${s.assetNo})`),
  ...(s.requestType ? [row('ประเภท', REQUEST_TYPE_LABEL[s.requestType])] : []),
  ...(s.requestType === RequestType.BORROW ? [row('กำหนดคืน', thaiDate(s.dueDate))] : []),
  ...(s.approverName !== undefined ? [row('ผู้อนุมัติ', s.approverName ?? 'อนุมัติอัตโนมัติ')] : []),
];

/** ขั้นที่ 2: ยืม (เลือกวันคืนจากปฏิทินของ LINE) หรือ เบิกใช้ประจำ */
export function borrowTypeMessage(s: BorrowSummary, assetId: number, minDate: string, initialDate: string): LineMessage {
  return flex(
    'เลือกเบิกหรือยืม',
    bubble({
      header: header('เบิก/ยืมอุปกรณ์ · ขั้นที่ 2/3', 'ยืมชั่วคราว หรือ เบิกใช้ประจำ?', C.borrow),
      body: [
        ...summaryRows(s),
        separator(),
        text('ยืม = ต้องคืนตามกำหนด · เบิก = ใช้งานประจำตำแหน่ง', { size: 'xs', color: C.sub }),
      ],
      footer: [
        button(
          { type: 'datetimepicker', label: '📅 ยืม — เลือกวันคืน', data: `a=bt&as=${assetId}&t=b`, mode: 'date', initial: initialDate, min: minDate },
          'primary',
          C.borrow,
        ),
        button(postback('📦 เบิกใช้งานประจำ', `a=bt&as=${assetId}&t=w`, 'เบิกใช้งานประจำ'), 'secondary'),
        button(postback('ยกเลิก', 'a=bx', 'ยกเลิกการเบิก/ยืม'), 'link', C.sub),
      ],
    }),
  );
}

export function borrowApproverMessage(s: BorrowSummary, approvers: { employeeId: number; fullName: string }[], baseData: string): LineMessage {
  return flex(
    'เลือกผู้อนุมัติ',
    bubble({
      header: header('เบิก/ยืมอุปกรณ์ · ขั้นที่ 3/3', 'ส่งให้ใครอนุมัติ?', C.borrow),
      body: [...summaryRows(s), separator(), text('เลือกผู้ดูแลระบบ IT ที่จะอนุมัติคำขอนี้', { size: 'xs', color: C.sub })],
      footer: [
        ...approvers.slice(0, 8).map((a) => button(postback(a.fullName, `${baseData}&ap=${a.employeeId}`, `ผู้อนุมัติ: ${a.fullName}`), 'secondary')),
        button(postback('ยกเลิก', 'a=bx', 'ยกเลิกการเบิก/ยืม'), 'link', C.sub),
      ],
    }),
  );
}

export function borrowConfirmMessage(s: BorrowSummary, submitData: string): LineMessage {
  return flex(
    'ตรวจสอบและยืนยันคำขอ',
    bubble({
      header: header('ตรวจสอบก่อนส่ง', 'ยืนยันคำขอเบิก/ยืม', C.borrow),
      body: summaryRows(s),
      footer: [
        button(postback('✅ ยืนยันส่งคำขอ', submitData, 'ยืนยันส่งคำขอ'), 'primary', C.borrow),
        button(postback('ยกเลิก', 'a=bx', 'ยกเลิกการเบิก/ยืม'), 'link', C.sub),
      ],
    }),
  );
}

export function requisitionCreatedMessage(
  r: { requisitionId: number; requisitionNo: string; overallStatus: ApprovalStatus },
  s: BorrowSummary,
  webUrl?: string,
): LineMessage {
  const detail = webLink(webUrl, `/requisitions/${r.requisitionId}`);
  const approved = r.overallStatus === ApprovalStatus.APPROVED;
  return flex(
    `ส่งคำขอแล้ว ${r.requisitionNo}`,
    bubble({
      header: header(approved ? '✅ อนุมัติแล้ว' : '✅ ส่งคำขอแล้ว', r.requisitionNo, C.borrow),
      body: [
        { type: 'box', layout: 'horizontal', contents: [pill(APPROVAL_LABEL[r.overallStatus], APPROVAL_COLOR[r.overallStatus])] },
        ...summaryRows(s),
        separator(),
        text(approved ? 'ติดต่อรับอุปกรณ์ได้ที่ฝ่าย IT' : 'ผู้อนุมัติจะได้รับแจ้งเตือนในระบบ ติดตามผลได้ที่เมนู "ติดตามสถานะ"', {
          size: 'xs',
          color: C.sub,
        }),
      ],
      footer: detail ? [uriButton('ดูคำขอบนเว็บ', detail, C.borrow)] : [],
    }),
    MENU_QUICK_REPLY,
  );
}

// ───────────────────────── ฝั่งเจ้าหน้าที่ IT (push งานเข้า LINE) ─────────────────────────

export interface StaffTicketInput extends TicketCardInput {
  description?: string | null;
  locationDetail?: string | null;
  reporterInfo?: { fullName: string; departmentName: string | null; phone: string | null } | null;
}

/** งานแจ้งปัญหาใหม่จาก LINE → เด้งเข้า LINE ของทุกคนที่มี ticket.manage พร้อมปุ่มรับงาน */
export function staffNewTicketMessage(t: StaffTicketInput, webUrl?: string): LineMessage {
  const detail = webLink(webUrl, `/support-tickets/${t.ticketId}`);
  const reporter = t.reporterInfo;
  return flex(
    `🔔 งานใหม่ ${t.ticketNo}: ${t.subject}`,
    bubble({
      header: header('🔔 มีงานแจ้งปัญหาใหม่', t.ticketNo, C.warn),
      body: [
        text(clip(t.subject, 120), { weight: 'bold', size: 'md' }),
        ...(t.description && t.description.trim() !== t.subject ? [text(clip(t.description, 300), { color: C.sub })] : []),
        separator(),
        row('ผู้แจ้ง', reporter ? `${reporter.fullName}${reporter.departmentName ? ` · ${reporter.departmentName}` : ''}` : '-'),
        row('โทร', reporter?.phone || '-'),
        row('สถานที่', clip(t.locationDetail, 80)),
        row('ประเภท', TICKET_CATEGORY_LABEL[t.category]),
      ],
      footer: [
        button(postback('✋ รับงานนี้', `a=sa&id=${t.ticketId}`, `รับงาน ${t.ticketNo}`), 'primary', C.ticket),
        ...(detail ? [uriButton('ดูรายละเอียดบนเว็บ', detail, C.ticket)] : []),
      ],
    }),
  );
}

/** หลังกดรับงาน — ปุ่มปิดงานต่อได้เลย */
export function staffTicketAcceptedMessage(t: TicketCardInput, webUrl?: string): LineMessage {
  const detail = webLink(webUrl, `/support-tickets/${t.ticketId}`);
  return flex(
    `คุณรับงาน ${t.ticketNo} แล้ว`,
    bubble({
      header: header('✅ คุณรับงานนี้แล้ว', t.ticketNo, C.ticket),
      body: [
        text(clip(t.subject, 120), { weight: 'bold', size: 'md' }),
        { type: 'box', layout: 'horizontal', contents: [pill(TICKET_STATUS_LABEL[t.status], TICKET_STATUS_COLOR[t.status])] },
        text('ผู้แจ้งได้รับแจ้งทาง LINE แล้วว่ามีคนรับเรื่อง', { size: 'xs', color: C.sub }),
      ],
      footer: [
        button(postback('🏁 แก้ไขเสร็จแล้ว', `a=sr&id=${t.ticketId}`, `แก้ไขเสร็จ ${t.ticketNo}`), 'primary', C.ok),
        ...(detail ? [uriButton('เปิดบนเว็บ (เพิ่มรายละเอียด/ส่งซ่อม)', detail, C.ticket)] : []),
      ],
    }),
  );
}

/** ปุ่มยืนยันก่อนทำรายการที่ย้อนไม่ได้ (ปิดงาน / อนุมัติ / ไม่อนุมัติ) */
export function confirmActionMessage(title: string, detail: string, confirmLabel: string, confirmData: string, color: string = C.ticket): LineMessage {
  return flex(
    title,
    bubble({
      size: 'kilo',
      body: [text(title, { weight: 'bold', size: 'md' }), text(detail, { color: C.sub })],
      footer: [
        button(postback(confirmLabel, confirmData, confirmLabel), 'primary', color),
        button(postback('ยกเลิก', 'a=noop', 'ยกเลิก'), 'link', C.sub),
      ],
    }),
  );
}

export interface RequisitionApprovalInput extends RequisitionCardInput {
  requesterName: string;
  departmentName?: string | null;
  reason?: string | null;
  approvalLevel?: number;
  totalLevels?: number;
}

/** ใบขอเบิก/ยืมรออนุมัติ → เด้งเข้า LINE ของผู้อนุมัติลำดับปัจจุบัน */
export function staffRequisitionApprovalMessage(r: RequisitionApprovalInput, webUrl?: string): LineMessage {
  const detail = webLink(webUrl, `/requisitions/${r.requisitionId}`);
  const level = r.totalLevels && r.totalLevels > 1 ? ` (ลำดับ ${r.approvalLevel}/${r.totalLevels})` : '';
  return flex(
    `📝 ใบขอรออนุมัติ ${r.requisitionNo}`,
    bubble({
      header: header(`📝 รอคุณอนุมัติ${level}`, r.requisitionNo, C.borrow),
      body: [
        row('ผู้ขอ', `${r.requesterName}${r.departmentName ? ` · ${r.departmentName}` : ''}`),
        row('ประเภท', REQUEST_TYPE_LABEL[r.requestType]),
        row('อุปกรณ์', r.assetNames.join(', ') || '-'),
        ...(r.requestType === RequestType.BORROW ? [row('กำหนดคืน', thaiDate(r.dueDate))] : []),
        ...(r.reason ? [row('เหตุผล', clip(r.reason, 120))] : []),
      ],
      footer: [
        {
          type: 'box',
          layout: 'horizontal',
          spacing: 'sm',
          contents: [
            button(postback('❌ ไม่อนุมัติ', `a=ra&id=${r.requisitionId}&s=r`, `ไม่อนุมัติ ${r.requisitionNo}`), 'secondary'),
            button(postback('✅ อนุมัติ', `a=ra&id=${r.requisitionId}&s=a`, `อนุมัติ ${r.requisitionNo}`), 'primary', C.ok),
          ],
        },
        ...(detail ? [uriButton('ดูรายละเอียดบนเว็บ', detail, C.borrow)] : []),
      ],
    }),
  );
}

/** ผลอนุมัติ → push ถึงผู้ขอ (เฉพาะใบที่ส่งจาก LINE) */
export function requisitionResultMessage(r: RequisitionCardInput, webUrl?: string): LineMessage {
  const detail = webLink(webUrl, `/requisitions/${r.requisitionId}`);
  const approved = r.overallStatus === ApprovalStatus.APPROVED;
  return flex(
    `${r.requisitionNo}: ${APPROVAL_LABEL[r.overallStatus]}`,
    bubble({
      header: header('ผลการพิจารณา', r.requisitionNo, APPROVAL_COLOR[r.overallStatus]),
      body: [
        { type: 'box', layout: 'horizontal', contents: [pill(APPROVAL_LABEL[r.overallStatus], APPROVAL_COLOR[r.overallStatus])] },
        row('อุปกรณ์', r.assetNames.join(', ') || '-'),
        row('ประเภท', REQUEST_TYPE_LABEL[r.requestType]),
        ...(r.requestType === RequestType.BORROW ? [row('กำหนดคืน', thaiDate(r.dueDate))] : []),
        separator(),
        text(approved ? 'ติดต่อรับอุปกรณ์ได้ที่ฝ่าย IT' : 'สอบถามรายละเอียดเพิ่มเติมได้ที่ฝ่าย IT', { size: 'xs', color: C.sub }),
      ],
      footer: detail ? [uriButton('ดูคำขอบนเว็บ', detail, C.borrow)] : [],
    }),
  );
}
