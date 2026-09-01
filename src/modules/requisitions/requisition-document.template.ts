import { Requisition } from './entities/requisition.entity';
import { RequisitionItem } from './entities/requisition-item.entity';
import { RequestType } from '@common/enums';

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

function formatThaiDate(value: Date | string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} พ.ศ. ${d.getFullYear() + 543}`;
}

function esc(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function checkbox(checked: boolean, label: string): string {
  return `<span class="checkbox">${checked ? '☑' : '☐'} ${esc(label)}</span>`;
}

function itemRow(item: RequisitionItem, seq: number): string {
  const name = item.asset?.assetName ?? item.stockItem?.itemName ?? '-';
  const brand = item.asset?.brand ?? '-';
  const model = item.asset?.model ?? '-';
  const serialNumber = item.asset?.serialNumber ?? '-';
  return `
    <tr>
      <td class="center">${seq}</td>
      <td>${esc(name)}</td>
      <td>${esc(brand)}</td>
      <td>${esc(model)}</td>
      <td>${esc(serialNumber)}</td>
      <td>${esc(item.note ?? '')}</td>
    </tr>`;
}

/**
 * เรนเดอร์ "ใบส่งมอบ-ส่งคืนทรัพย์สินของบริษัท" จากข้อมูล requisition ที่ผ่าน snapshot ไว้แล้วใน
 * documentInfo (ดู RequisitionsService.create) — ตั้งใจให้เป็น HTML (ไม่ใช่ PDF) ในรอบแรกเพื่อให้ตรวจ
 * เทียบ layout กับฟอร์มกระดาษต้นฉบับได้ตรงๆ ก่อน ถ้าต้องการไฟล์ PDF ให้แปลงเพิ่มเป็นขั้นถัดไป
 */
export function renderRequisitionDocumentHtml(r: Requisition): string {
  const employee = r.requestedByEmployee;
  const companyName = employee?.department?.company?.companyName ?? 'บริษัท มิลลิเมด จำกัด';
  const info = r.documentInfo;
  const accessories = info?.accessories;
  const items = r.items ?? [];
  const rows = items.length > 0
    ? items.map((item, idx) => itemRow(item, idx + 1)).join('')
    : Array.from({ length: 5 }, (_, idx) => itemRow({} as RequisitionItem, idx + 1)).join('');

  return `
<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8" />
<title>${esc(r.requisitionNo)}</title>
<style>
  body { font-family: 'Sarabun', 'Tahoma', sans-serif; font-size: 14px; color: #111; max-width: 820px; margin: 24px auto; padding: 0 16px; }
  h1 { text-align: center; font-size: 18px; margin-bottom: 4px; }
  h2 { text-align: center; font-size: 16px; margin-top: 0; }
  .doc-date { text-align: right; margin: 12px 0; }
  .field-grid { display: grid; grid-template-columns: 1fr 1fr; row-gap: 6px; margin-bottom: 16px; }
  .field-grid .full { grid-column: 1 / span 2; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  th, td { border: 1px solid #333; padding: 6px 8px; font-size: 13px; }
  th { background: #eee; }
  td.center { text-align: center; }
  .checkbox { margin-right: 16px; }
  .terms { font-size: 13px; line-height: 1.6; margin-top: 16px; }
  .terms ol { padding-left: 20px; }
  .sign-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 24px; border: 1px solid #333; }
  .sign-col { padding: 12px; border-right: 1px solid #333; }
  .sign-col:last-child { border-right: none; }
  .sign-line { margin-top: 40px; border-top: 1px dotted #333; padding-top: 4px; }
  .sign-label { font-weight: bold; margin-top: 16px; }
</style>
</head>
<body>
  <h1>ใบส่งมอบ - ส่งคืน ทรัพย์สินของบริษัท</h1>
  <h2>${esc(companyName)}</h2>
  <div class="doc-date">วันที่ ${formatThaiDate(r.createdAt)}</div>

  <div class="field-grid">
    <div>ชื่อ-นามสกุล ผู้รับทรัพย์สิน : ${esc(employee?.fullName)}</div>
    <div>เบอร์ติดต่อ : ${esc(info?.contactPhone)}</div>
    <div>ชื่อ-นามสกุล ผู้รับทรัพย์สิน (ภาษาอังกฤษ) : ${esc(info?.employeeNameEn)}</div>
    <div></div>
    <div>วันที่เริ่มงาน : ${esc(formatThaiDate(info?.startDate))} ตำแหน่ง : ${esc(info?.position)}</div>
    <div>ฝ่าย : ${esc(info?.department)}</div>
    <div class="full">รหัสพนักงาน : ${esc(employee?.employeeCode)}</div>
    <div class="full">เลขที่เอกสาร : ${esc(r.requisitionNo)} (${r.requestType === RequestType.BORROW ? 'ยืม' : 'เบิก'})</div>
  </div>

  <p><u>รายการทรัพย์สินที่บริษัทให้ไว้เพื่อใช้ในการทำงานให้แก่บริษัท ซึ่งถือเป็นรายการทรัพย์สินที่พนักงาน<br />ต้องรับผิดชอบในระหว่างการทำงาน</u></p>
  <table>
    <thead>
      <tr>
        <th>ลำดับที่</th>
        <th>รายการ</th>
        <th>ยี่ห้อ</th>
        <th>รุ่น</th>
        <th>หมายเลขเครื่อง</th>
        <th>หมายเหตุ</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div>
    อุปกรณ์ต่อพ่วง :
    ${checkbox(!!accessories?.adapter, 'Adapter')}
    ${checkbox(!!accessories?.mouse, 'Mouse')}
    ${checkbox(!!accessories?.pen, 'Pen')}
    ${checkbox(!!accessories?.bag, 'กระเป๋า')}
    ${checkbox(!!accessories?.other, `อื่นๆ ${esc(accessories?.other ?? '')}`)}
  </div>

  <div class="terms">
    <u>ข้อกำหนดการรักษาและใช้ทรัพย์สินของบริษัท</u>
    <ol>
      <li>พนักงานจะต้องใช้งานและดูแลทรัพย์สินของบริษัทอย่างเหมาะสม ไม่ให้เกิดการชำรุดเสียหาย หรือสูญหาย หากเกิดความเสียหายจากการใช้งานพนักงานจะต้องรับผิดชอบและชดใช้ทุกกรณี</li>
      <li>กรณีทรัพย์สินประเภทอุปกรณ์อิเล็กทรอนิกส์ หรือเครื่องมือสื่อสารใดๆ
        <ol type="a">
          <li>หากพนักงานประสงค์จะติดตั้งโปรแกรมเพิ่มเติมต้องแจ้งให้ฝ่าย IT เป็นผู้ดำเนินการให้</li>
          <li>พนักงานจะต้องรักษาและดูแลข้อมูลที่อยู่ภายในอุปกรณ์ หากเกิดความเสียหายจากการใช้งาน หรือเกิดความไม่ปลอดภัยหรือไม่ถูกต้องตามกฎหมายของข้อมูล เช่น การใช้ software ละเมิดลิขสิทธิ์ การนำเข้าข้อมูลอันเป็นเท็จหรือผิดกฎหมาย พนักงานจะเป็นผู้รับผิดชอบและชดใช้ความเสียหายในทุกกรณี</li>
        </ol>
      </li>
      <li>เมื่อสิ้นสุดการใช้งาน หรือเมื่อสิ้นสุดสถานการเป็นพนักงานของบริษัทไม่ว่าด้วยเหตุใด พนักงานต้องส่งทรัพย์สินทั้งหมดคืนบริษัททันที และพนักงานจะต้องส่งคืนทรัพย์สินในสภาพที่ใช้การได้เรียบร้อย หากเกิดการชำรุดเสียหาย หรือใช้การไม่ได้ หรือสูญหาย พนักงานจะต้องซ่อมแซมให้คงสภาพเดิมโดยค่าใช้จ่ายของตนเอง หรือชดใช้คืนเป็นทรัพย์สิน โดยใช้ยี่ห้อเดิมหรือเทียบเคียง ประเภท ชนิด ขนาด ลักษณะ และคุณภาพอย่างเดียวกัน หรือชดใช้เป็นเงินตามราคาที่เป็นอยู่ในขณะรับทรัพย์สิน</li>
      <li>ห้ามผู้ใช้งานนำข้อมูลในแท็บเล็ตเผยแพร่ต่อ บริษัทคู่แข่ง หรือบุคลากรที่เกี่ยวข้องกับบริษัทคู่แข่ง</li>
    </ol>
  </div>

  <div class="sign-grid">
    <div class="sign-col">
      <div class="sign-label">ช่องสำหรับรับมอบทรัพย์สิน</div>
      <div><strong>พนักงาน/ผู้รับมอบทรัพย์สิน :</strong></div>
      <div>ข้าพเจ้าขอรับรองว่าได้รับทรัพย์สินตามรายการข้างต้นไว้ครบถ้วนแล้วและจะนำส่งคืนทรัพย์สินให้ตรงตามเวลาที่กำหนด และปฏิบัติตามข้อกำหนดการรักษาและใช้ทรัพย์สินของบริษัทอย่างเคร่งครัด</div>
      <div class="sign-line">(ลงลายมือชื่อ) ${esc(employee?.fullName)}</div>
      <div class="sign-label">ผู้ส่งมอบทรัพย์สิน :</div>
      <div class="sign-line">(ลงลายมือชื่อ)</div>
      <div class="sign-label">พยาน : ฝ่ายบุคคล</div>
      <div class="sign-line">(ลงลายมือชื่อ)</div>
    </div>
    <div class="sign-col">
      <div class="sign-label">ช่องสำหรับส่งคืนทรัพย์สิน</div>
      <div><strong>พนักงาน/ผู้ส่งคืนทรัพย์สิน :</strong></div>
      <div class="sign-line">(ลงลายมือชื่อ)</div>
      <div class="sign-label">สภาพทรัพย์สินที่ส่งคืน</div>
      <div>${checkbox(false, 'ใช้งานได้, สภาพสมบูรณ์, อุปกรณ์ต่อพ่วงครบ (ถ้ามี)')}</div>
      <div>${checkbox(false, 'ชำรุด, ใช้งานไม่ได้, สูญหาย, อุปกรณ์ไม่ครบ')}</div>
      <div class="sign-label">ผู้ตรวจรับคืนทรัพย์สิน :</div>
      <div class="sign-line">(ลงลายมือชื่อ)</div>
      <div class="sign-label">พยาน : ฝ่ายบุคคล</div>
      <div class="sign-line">(ลงลายมือชื่อ)</div>
    </div>
  </div>
</body>
</html>`;
}
