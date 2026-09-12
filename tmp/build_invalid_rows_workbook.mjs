import fs from 'node:fs/promises';
import { SpreadsheetFile, Workbook } from '@oai/artifact-tool';

const root = 'E:/final_projects/asmaa/23-8-2026/FIT90_19-8';
const inputPath = `${root}/tmp/invalid_rows.json`;
const outputPath = `${root}/outputs/data-migration/final-upload-package-20260908/rows_excluded_from_import.xlsx`;
const source = JSON.parse(await fs.readFile(inputPath, 'utf8'));

function columnName(index) {
  let out = '';
  let value = index;
  while (value >= 0) {
    out = String.fromCharCode((value % 26) + 65) + out;
    value = Math.floor(value / 26) - 1;
  }
  return out;
}

function valuesFor(rows) {
  const headers = rows.length ? Object.keys(rows[0]) : ['Source row', 'Reason for exclusion'];
  return { headers, matrix: rows.map((row) => headers.map((header) => row[header] ?? '')) };
}

function styleSheet(sheet, title, rows) {
  const { headers, matrix } = valuesFor(rows);
  const lastColumn = columnName(headers.length - 1);
  sheet.getRange('A1').values = [[title]];
  sheet.getRange('A1').format = {
    font: { name: 'Arial', size: 14, bold: true, color: '#1F2937' },
  };
  sheet.getRange('A2').values = [[`عدد الصفوف المستبعدة: ${rows.length}`]];
  sheet.getRange('A2').format = { font: { name: 'Arial', size: 10, italic: true, color: '#6B7280' } };
  sheet.getRange(`A4:${lastColumn}4`).values = [headers];
  sheet.getRange(`A4:${lastColumn}4`).format = {
    fill: '#7F1D1D',
    font: { name: 'Arial', size: 10, bold: true, color: '#FFFFFF' },
    horizontalAlignment: 'center',
    verticalAlignment: 'center',
    wrapText: true,
  };
  if (matrix.length) {
    sheet.getRange(`A5:${lastColumn}${matrix.length + 4}`).values = matrix;
    sheet.getRange(`A5:${lastColumn}${matrix.length + 4}`).format = {
      font: { name: 'Arial', size: 10, color: '#111827' },
      verticalAlignment: 'middle',
    };
    sheet.getRange(`B5:B${matrix.length + 4}`).format = {
      fill: '#FEF2F2',
      font: { name: 'Arial', size: 10, color: '#991B1B', bold: true },
      wrapText: true,
      verticalAlignment: 'top',
    };
    sheet.tables.add(`A4:${lastColumn}${matrix.length + 4}`, true, `tbl_${sheet.name.replace(/[^A-Za-z0-9]/g, '') || 'rows'}`);
  }
  sheet.getRange(`A4:${lastColumn}${Math.min(matrix.length + 4, 25)}`).format.autofitColumns();
  sheet.getRange(`A4:${lastColumn}${Math.min(matrix.length + 4, 25)}`).format.autofitRows();
  sheet.getRange('A:A').format.columnWidth = 12;
  sheet.getRange('B:B').format.columnWidth = 42;
  sheet.freezePanes.freezeRows(4);
  sheet.showGridlines = false;
}

const workbook = Workbook.create();
const summary = workbook.worksheets.add('ملخص');
summary.getRange('A1').values = [['صفوف Excel المستبعدة من استيراد FIT90']];
summary.getRange('A1').format = { font: { name: 'Arial', size: 16, bold: true, color: '#1F2937' } };
summary.getRange('A2').values = [['هذا الملف يعرض الصف الأصلي وسبب الاستبعاد لكل سجل لم يتم رفعه.']];
summary.getRange('A2').format = { font: { name: 'Arial', size: 10, italic: true, color: '#6B7280' } };
const summaryHeaders = ['المصدر', 'عدد الصفوف المستبعدة', 'سبب الاستبعاد'];
const summaryRows = source.summary.map((row) => [row['File / sheet'], row['Invalid rows'], row['Reason summary']]);
summary.getRange('A4:C4').values = [summaryHeaders];
summary.getRange('A5:C7').values = summaryRows;
summary.getRange('A4:C4').format = { fill: '#7F1D1D', font: { name: 'Arial', size: 10, bold: true, color: '#FFFFFF' }, horizontalAlignment: 'center', verticalAlignment: 'center', wrapText: true };
summary.getRange('A5:C7').format = { font: { name: 'Arial', size: 10, color: '#111827' }, verticalAlignment: 'middle', wrapText: true };
summary.getRange('B5:B7').format.numberFormat = '#,##0';
summary.tables.add('A4:C7', true, 'SummaryTable');
summary.getRange('A1:C7').format.autofitColumns();
summary.getRange('A1:C7').format.autofitRows();
summary.getRange('A:A').format.columnWidth = 54;
summary.getRange('B:B').format.columnWidth = 18;
summary.getRange('C:C').format.columnWidth = 62;
summary.showGridlines = false;

styleSheet(workbook.worksheets.add('أعضاء غير صالحين'), 'الأعضاء المستبعدون', source.members);
styleSheet(workbook.worksheets.add('اشتراكات غير صالحة'), 'الاشتراكات المستبعدة', source.subscriptions);
styleSheet(workbook.worksheets.add('محتملون غير صالحين'), 'الأعضاء المحتملون المستبعدون', source.leads);

workbook.recalculate();
const preview = await workbook.render({ sheetName: 'ملخص', range: 'A1:C7', scale: 2 });
await fs.writeFile(`${root}/tmp/invalid_rows_summary.png`, new Uint8Array(await preview.arrayBuffer()));
const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(outputPath);
console.log(JSON.stringify({ outputPath, counts: { members: source.members.length, subscriptions: source.subscriptions.length, leads: source.leads.length } }));
