import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

const EGYPT_TZ = 'Africa/Cairo';

/** Local calendar date YYYY-MM-DD (Egypt), not UTC. */
export function localDateString(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: EGYPT_TZ }).format(date);
}

/** True when two time ranges [start, end) overlap (HH:MM or HH:MM:SS strings). */
export function timeOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Add `minutes` to an HH:MM or HH:MM:SS clock string, returning a zero-padded "HH:MM:SS" string
 * that stays lexicographically comparable with `timeOverlap`. Caps at 23:59:59 so a same-day
 * window never wraps past midnight.
 */
export function addMinutes(time: string, minutes: number): string {
  const [h = '0', m = '0', s = '0'] = String(time).split(':');
  const total = Number(h) * 60 + Number(m) + (Number(minutes) || 0);
  const capped = Math.min(Math.max(total, 0), 23 * 60 + 59);
  const hh = Math.floor(capped / 60);
  const mm = capped % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hh)}:${pad(mm)}:${pad(Number(s) || 0)}`;
}

/** Transaction-safe sequential document number: `{prefix}-{padded}`. */
export async function nextNumber(
  prisma: PrismaService | Prisma.TransactionClient,
  table: string,
  column: string,
  prefix: string,
  pad = 6,
): Promise<string> {
  const prefixLen = prefix.length + 1;
  const rows = await prisma.$queryRawUnsafe<{ maxNum: number | null }[]>(
    `SELECT MAX(CAST(SUBSTRING(\`${column}\`, ${prefixLen}) AS UNSIGNED)) AS maxNum
     FROM \`${table}\` WHERE \`${column}\` LIKE ?`,
    `${prefix}-%`,
  );
  const next = (rows[0]?.maxNum ?? 0) + 1;
  return `${prefix}-${String(next).padStart(pad, '0')}`;
}

export const ACTIVE_BOOKING_STATUSES = ['pending', 'confirmed', 'active'] as const;

export function isActiveEnrollment(status: string): boolean {
  return status !== 'cancelled';
}

export function toNum(v: Prisma.Decimal | number | null | undefined): number {
  if (v == null) return 0;
  return Number(v);
}

/** Verify club member exists and is not soft-deleted. */
export async function assertMemberExists(prisma: PrismaService, memberId: number) {
  const member = await prisma.club_members.findFirst({
    where: { id: memberId, is_deleted: false },
    select: { id: true, name: true },
  });
  if (!member) {
    throw new NotFoundException('العضو غير موجود');
  }
  return member;
}
