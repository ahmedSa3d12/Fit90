import * as XLSX from 'xlsx';

export interface ExportColumn<T extends Record<string, unknown> = Record<string, unknown>> {
  key: keyof T & string;
  header: string;
}

/** Download rows as Excel (.xlsx) — client-side, like SwatGym but typed. */
export function downloadExcel<T extends Record<string, unknown>>(
  rows: T[],
  columns: ExportColumn<T>[],
  filename: string,
  sheetName = 'Sheet1',
) {
  const mapped = rows.map((row) =>
    Object.fromEntries(columns.map((c) => [c.header, row[c.key] ?? ''])),
  );
  const ws = XLSX.utils.json_to_sheet(mapped);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

/** Download multiple sheets in one workbook. */
export function downloadMultiSheetExcel(
  sheets: Array<{ name: string; columns: ExportColumn[]; rows: Record<string, unknown>[] }>,
  filename: string,
) {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const mapped = sheet.rows.map((row) =>
      Object.fromEntries(sheet.columns.map((c) => [c.header, row[c.key] ?? ''])),
    );
    const ws = XLSX.utils.json_to_sheet(mapped);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

/** Trigger browser download of a blob (server-generated export). */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Fetch server export endpoint and download. */
export async function downloadFromApi(apiUrl: string, filename: string, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(apiUrl, { headers, credentials: 'include' });
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  downloadBlob(blob, filename);
}

/** Open browser print dialog for a DOM element. */
export function printElement(element: HTMLElement, title?: string) {
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`
    <html dir="rtl"><head><title>${title ?? 'Print'}</title>
    <style>body{font-family:Tajawal,sans-serif;padding:20px}table{width:100%;border-collapse:collapse}
    th,td{border:1px solid #ddd;padding:8px;text-align:right}th{background:#f5f5f5}</style></head>
    <body>${element.innerHTML}</body></html>`);
  win.document.close();
  win.focus();
  win.print();
}
