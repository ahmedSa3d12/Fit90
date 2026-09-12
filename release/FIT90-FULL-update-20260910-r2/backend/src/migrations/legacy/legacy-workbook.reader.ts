import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import * as ExcelJS from 'exceljs';
import { ImportIssue, SourceCoordinate, issue } from './legacy-import.types';
import { normalizeEgyptPhone, normalizeLegacyText, parseLegacyDate } from './legacy-import.utils';

export interface LegacyImportSources { membersPath: string; exportPath: string }
export interface StagedRow { targetTable: 'club_members' | 'club_subscriptions' | 'club_leads'; source: SourceCoordinate; legacyId: string | null; values: Record<string, unknown>; reasons: string[] }
export interface LegacyAnalysis { inventory: { file: string; sheet: string; rows: number; columns: string[] }[]; fileHashes: Record<string, string>; members: StagedRow[]; subscriptions: StagedRow[]; leads: StagedRow[]; issues: ImportIssue[] }

const value = (v: ExcelJS.CellValue): unknown => {
  if (v && typeof v === 'object' && 'formula' in v) return undefined;
  if (v && typeof v === 'object' && 'text' in v) return (v as ExcelJS.CellHyperlinkValue).text;
  return v as unknown;
};
const headers = (sheet: ExcelJS.Worksheet) => {
  const row = sheet.getRow(1); const out: string[] = [];
  for (let i = 1; i <= sheet.columnCount; i++) out.push(String(value(row.getCell(i).value) ?? '').trim());
  return out;
};
const fileHash = async (path: string) => createHash('sha256').update(await readFile(path)).digest('hex');

function rowValues(sheet: ExcelJS.Worksheet, rowNumber: number, names: string[]) {
  const row = sheet.getRow(rowNumber); const out: Record<string, unknown> = {};
  names.forEach((name, index) => { out[name] = value(row.getCell(index + 1).value); }); return out;
}
function coordinate(file: string, sheet: string, rowNumber: number, columnName?: string): SourceCoordinate { return { sourceFile: file, sheetName: sheet, rowNumber, columnName }; }
function staged(targetTable: StagedRow['targetTable'], file: string, sheet: string, rowNumber: number, values: Record<string, unknown>, issues: ImportIssue[]): StagedRow {
  const reasons: string[] = []; const formulaColumns: string[] = [];
  Object.entries(values).forEach(([k, v]) => { if (v === undefined) { formulaColumns.push(k); issues.push(issue('FORMULA_CELL', 'خلية معادلة تحتاج مراجعة', coordinate(file, sheet, rowNumber, k))); } });
  if (formulaColumns.length) reasons.push('FORMULA_CELL');
  const name = normalizeLegacyText(values.NameAR) ?? normalizeLegacyText(values.NameEng);
  if (!name) reasons.push('NAME_REQUIRED');
  const phone = normalizeEgyptPhone(values.PhoneNo); if (!phone) reasons.push('PHONE_INVALID');
  const gender = String(values.Gender ?? '').trim().toLowerCase(); if (!['male','female','m','f','ذكر','أنثى'].includes(gender)) reasons.push('GENDER_INVALID');
  return { targetTable, source: coordinate(file, sheet, rowNumber), legacyId: normalizeLegacyText(values.ID ?? values.id), values: { ...values, normalizedName: name, normalizedPhone: phone, normalizedBirthDate: parseLegacyDate(values.BirthDate ?? values.birthDate) }, reasons };
}

export async function analyzeLegacyWorkbooks(sources: LegacyImportSources): Promise<LegacyAnalysis> {
  if (!sources.membersPath || !sources.exportPath) throw new Error('source files are required');
  const analysis: LegacyAnalysis = { inventory: [], fileHashes: { members: await fileHash(sources.membersPath), export: await fileHash(sources.exportPath) }, members: [], subscriptions: [], leads: [], issues: [] };
  const jobs: [string, string, 'members' | 'export'][] = [[sources.membersPath, 'Members-07-09-2026-01-17-42-PM.xlsx', 'members'], [sources.exportPath, 'Fit90_Full_Export_2026-09-07.xlsx', 'export']];
  for (const [path, label, kind] of jobs) { const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(path); wb.eachSheet((sheet) => {
    const names = headers(sheet); analysis.inventory.push({ file: label, sheet: sheet.name, rows: Math.max(0, sheet.rowCount - 1), columns: names });
    for (let n = 2; n <= sheet.rowCount; n++) { const values = rowValues(sheet, n, names);
      if ((kind === 'members' && sheet.name === 'Data')) analysis.members.push(staged('club_members', label, sheet.name, n, values, analysis.issues));
      if (kind === 'export' && sheet.name === 'Memberships') analysis.subscriptions.push(staged('club_subscriptions', label, sheet.name, n, values, analysis.issues));
      if (kind === 'export' && sheet.name === 'Potential Members') analysis.leads.push(staged('club_leads', label, sheet.name, n, values, analysis.issues));
    }
  }); }
  return analysis;
}
