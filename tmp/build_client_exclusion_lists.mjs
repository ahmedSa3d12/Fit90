import fs from 'node:fs/promises';
import { SpreadsheetFile, Workbook } from '@oai/artifact-tool';

const root = 'E:/final_projects/asmaa/23-8-2026/FIT90_19-8';
const data = JSON.parse(await fs.readFile(`${root}/tmp/invalid_rows.json`, 'utf8'));
const outputDir = `${root}/outputs/data-migration/final-upload-package-20260908`;
const duplicatePhoneReason = 'رقم الهاتف مكرر؛ تم الاحتفاظ بأول عضو صحيح فقط';
const missingMemberReason = 'العضو غير موجود ضمن الأعضاء المقبولين للاستيراد';
const unmatchedTypeReason = 'نوع الاشتراك غير مطابق لأنواع الاشتراكات الموجودة بالنظام';
const normalized = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const hasUnresolvedSubscriptionType = (row) => row['Reason for exclusion'].includes(unmatchedTypeReason) && normalized(row.packageName) !== 'annual';

async function writeWorkbook({ fileName, sheetName, title, summaryLabel, headers, rows, tableName, forceTextColumns = [] }) {
  const workbook = Workbook.create();
  const sheet = workbook.worksheets.add(sheetName);
  const lastColumn = String.fromCharCode(64 + headers.length);
  sheet.getRange('A1').values = [[title]];
  sheet.getRange('A1').format = { font: { name: 'Arial', size: 15, bold: true, color: '#1F2937' } };
  sheet.getRange('A2').values = [[`${summaryLabel}: ${rows.length}`]];
  sheet.getRange('A2').format = { font: { name: 'Arial', size: 10, italic: true, color: '#6B7280' } };
  sheet.getRange(`A4:${lastColumn}4`).values = [headers];
  sheet.getRange(`A4:${lastColumn}4`).format = {
    fill: '#7F1D1D', font: { name: 'Arial', size: 10, bold: true, color: '#FFFFFF' },
    horizontalAlignment: 'center', verticalAlignment: 'center', wrapText: true,
  };
  const textRows = rows.map((row) => row.map((value, index) => {
    const text = value == null ? '' : String(value);
    return forceTextColumns.includes(index) && text ? `\u200B${text}` : text;
  }));
  sheet.getRange(`A5:${lastColumn}${rows.length + 4}`).format.numberFormat = '@';
  sheet.getRange(`A5:${lastColumn}${rows.length + 4}`).values = textRows;
  sheet.getRange(`A5:${lastColumn}${rows.length + 4}`).format = {
    font: { name: 'Arial', size: 10, color: '#111827' }, verticalAlignment: 'middle', wrapText: true,
  };
  sheet.getRange(`B5:B${rows.length + 4}`).format = {
    fill: '#FEF2F2', font: { name: 'Arial', size: 10, color: '#991B1B', bold: true }, wrapText: true,
  };
  sheet.tables.add(`A4:${lastColumn}${rows.length + 4}`, true, tableName);
  sheet.getRange(`A1:${lastColumn}${Math.min(rows.length + 4, 30)}`).format.autofitColumns();
  sheet.getRange(`A1:${lastColumn}${Math.min(rows.length + 4, 30)}`).format.autofitRows();
  sheet.getRange('A:A').format.columnWidth = 12;
  sheet.getRange('B:B').format.columnWidth = 42;
  sheet.freezePanes.freezeRows(4);
  sheet.showGridlines = false;
  workbook.recalculate();
  const preview = await workbook.render({ sheetName, range: `A1:${lastColumn}${Math.min(rows.length + 4, 18)}`, scale: 1.5 });
  await fs.writeFile(`${root}/tmp/${fileName}.png`, new Uint8Array(await preview.arrayBuffer()));
  const xlsx = await SpreadsheetFile.exportXlsx(workbook);
  await xlsx.save(`${outputDir}/${fileName}`);
}

const remainingMembers = data.members.filter((row) => row['Reason for exclusion'] === duplicatePhoneReason);
const addedMemberIds = new Set(data.members
  .filter((row) => row['Reason for exclusion'] !== duplicatePhoneReason)
  .map((row) => String(row.ID)));
const remainingSubscriptions = data.subscriptions.filter((row) => {
  const reason = row['Reason for exclusion'];
  const memberId = String(row.memberId);
  return hasUnresolvedSubscriptionType(row) || (reason.includes(missingMemberReason) && !addedMemberIds.has(memberId));
});

function finalSubscriptionReason(row) {
  const reason = row['Reason for exclusion'];
  const memberId = String(row.memberId);
  const unresolvedType = hasUnresolvedSubscriptionType(row);
  if (unresolvedType && reason.includes(missingMemberReason) && !addedMemberIds.has(memberId)) {
    return 'نوع الاشتراك غير موجود بالنظام، والعضو لم يُرفع لأن رقم هاتفه مكرر في ملف الأعضاء';
  }
  if (unresolvedType) return unmatchedTypeReason;
  return 'العضو لم يُرفع لأن رقم هاتفه مكرر في ملف الأعضاء';
}

const memberHeaders = ['رقم الصف بالمصدر', 'سبب عدم الرفع', 'ID', 'الاسم العربي', 'الاسم الإنجليزي', 'الهاتف', 'النوع', 'البريد الإلكتروني', 'تاريخ الميلاد', 'الرقم القومي', 'الملاحظات'];
const memberRows = remainingMembers.map((row) => [
  row['Source row'], 'رقم الهاتف مكرر؛ تم الاحتفاظ بالسجل الأول فقط', row.ID, row.NameAR, row.NameEng,
  (/^1\d{9}$/.test(String(row.PhoneNo)) ? `0${row.PhoneNo}` : row.PhoneNo), row.Gender, row.Email, row.BirthDate, row.NationalId, row.Comment,
]);

const subscriptionHeaders = ['رقم الصف بالمصدر', 'سبب عدم التسجيل', 'ID', 'Member ID', 'نوع الاشتراك', 'رقم العقد', 'تاريخ البداية', 'تاريخ الانتهاء', 'القيمة', 'الخصم', 'المدفوع', 'المتبقي', 'الحالة', 'ملاحظات'];
const subscriptionRows = remainingSubscriptions.map((row) => [
  row['Source row'], finalSubscriptionReason(row), row.id, row.memberId, row.packageName,
  row.contractNo, row.startDateAsString, row.expirationDateAsString, row.price,
  row.discountByAmount, row.totalAmountPaid, row.totalAmountRemaining, row.statusName, row.notes,
]);

await writeWorkbook({
  fileName: 'members_remaining_for_client.xlsx', sheetName: 'الأعضاء المستبعدون',
  title: 'الأعضاء الذين لم يُرفعوا', summaryLabel: 'إجمالي الأعضاء غير المرفوعين', headers: memberHeaders, rows: memberRows, tableName: 'ExcludedMembersTable', forceTextColumns: [5, 9, 10],
});
await writeWorkbook({
  fileName: 'subscriptions_remaining_for_client.xlsx', sheetName: 'الاشتراكات المستبعدة',
  title: 'الاشتراكات التي لم تُسجل', summaryLabel: 'إجمالي الاشتراكات غير المسجلة', headers: subscriptionHeaders, rows: subscriptionRows, tableName: 'ExcludedSubscriptionsTable',
});

console.log(JSON.stringify({ members: memberRows.length, subscriptions: subscriptionRows.length }));
