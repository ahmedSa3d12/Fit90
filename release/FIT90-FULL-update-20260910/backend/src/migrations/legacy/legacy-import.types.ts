export type ImportTargetTable =
  | 'club_members'
  | 'club_leads'
  | 'club_subscriptions'
  | 'club_receipts';

export interface SourceCoordinate {
  sourceFile: string;
  sheetName: string;
  rowNumber: number;
  columnName?: string;
}

export interface ImportIssue {
  code: string;
  message: string;
  source: SourceCoordinate;
}

export function issue(code: string, message: string, source: SourceCoordinate): ImportIssue {
  return { code, message, source };
}
