import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { LegacyAnalysis, StagedRow } from './legacy-workbook.reader';
import { escapeSpreadsheetFormula } from './legacy-import.utils';

function csv(value: unknown, review: boolean): string { const text = value == null ? '' : String(value); const safe = review ? escapeSpreadsheetFormula(text) : text; return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe; }
export function writeCsv(headers: string[], rows: Record<string, unknown>[], review = false): string { return `\uFEFF${headers.join(',')}\r\n${rows.map((r) => headers.map((h) => csv(r[h], review)).join(',')).join('\r\n')}\r\n`; }
const clean = (rows: StagedRow[]) => rows.map((r) => ({ legacyId: r.legacyId, sourceFile: r.source.sourceFile, sheet: r.source.sheetName, row: r.source.rowNumber, reasons: r.reasons.join('|'), ...r.values }));
export async function writeImportPackage(analysis: LegacyAnalysis, outputDir: string) {
  await mkdir(outputDir, { recursive: true }); const all = [...analysis.members, ...analysis.subscriptions, ...analysis.leads];
  const write = (name: string, text: string) => writeFile(join(outputDir, name), text, 'utf8');
  await Promise.all([
    write('data-analysis-report.json', JSON.stringify({ inventory: analysis.inventory, issues: analysis.issues.length }, null, 2)),
    write('mapping.md', '# Legacy import mapping\nMembers → club_members\nSubscriptions → club_subscriptions\nPotential Members → club_leads\n'),
    write('members-clean.csv', writeCsv(Object.keys(clean(analysis.members)[0] ?? {}), clean(analysis.members))),
    write('subscriptions-clean.csv', writeCsv(Object.keys(clean(analysis.subscriptions)[0] ?? {}), clean(analysis.subscriptions))),
    write('leads-clean.csv', writeCsv(Object.keys(clean(analysis.leads)[0] ?? {}), clean(analysis.leads))),
    write('invalid-records.csv', writeCsv(['code','message','sourceFile','sheet','row','column'], analysis.issues.map((i) => ({ code:i.code,message:i.message,sourceFile:i.source.sourceFile,sheet:i.source.sheetName,row:i.source.rowNumber,column:i.source.columnName ?? '' })), true)),
    write('reconciliation.json', JSON.stringify({ members: analysis.members.length, subscriptions: analysis.subscriptions.length, leads: analysis.leads.length, rejected: all.filter((x) => x.reasons.length).length, issues: analysis.issues.length }, null, 2)),
  ]);
  return outputDir;
}
