import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { paginated } from '../../common/dto/list-result';
import { mapRow, toNum } from './mos-camel.util';
import { ListMosReportDto } from './dto/list-mos-entity.dto';

/** Shared contract for every MOS report. */
export interface MosReportResult {
  key: string;
  title: string;
  summary: Record<string, number | string>;
  columns: { key: string; label: string }[];
  rows: Record<string, unknown>[];
  total?: number;
  page?: number;
  pageSize?: number;
}

export type ReportHandler = (prisma: PrismaService, q: ListMosReportDto) => Promise<MosReportResult>;

/** `{ field: { gte, lte } }` when a date range is supplied, else undefined. */
export function dateRangeWhere(
  field: string,
  q: ListMosReportDto,
): Record<string, unknown> | undefined {
  if (!q.dateFrom && !q.dateTo) return undefined;
  const range: Record<string, string> = {};
  if (q.dateFrom) range.gte = q.dateFrom;
  if (q.dateTo) range.lte = q.dateTo;
  return { [field]: range };
}

/** DateTime range covering the complete selected calendar days (UTC). */
export function dateTimeRangeWhere(
  field: string,
  q: ListMosReportDto,
): Record<string, unknown> | undefined {
  if (!q.dateFrom && !q.dateTo) return undefined;
  const range: Record<string, Date> = {};
  if (q.dateFrom) range.gte = new Date(`${q.dateFrom}T00:00:00.000Z`);
  if (q.dateTo) range.lte = new Date(`${q.dateTo}T23:59:59.999Z`);
  return { [field]: range };
}

export function branchWhere(q: ListMosReportDto): Record<string, unknown> {
  return q.branchId != null ? { branch_id: q.branchId } : {};
}

/** ISO yyyy-mm-dd for `d` (defaults to today) — safe for VarChar date columns. */
export function isoDate(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

export { Prisma, PrismaService, paginated, mapRow, toNum, ListMosReportDto };
