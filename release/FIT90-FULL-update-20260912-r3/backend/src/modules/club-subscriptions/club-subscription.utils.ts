import { ClubPaymentMethod, ClubSubStatus } from '@prisma/client';
import { localDateString, parseDateOnly } from '../club-members/club-member.utils';

/** Sentinel end date for session packages (حصص) — no practical expiry by calendar. */
export const OPEN_ENDED_SUBSCRIPTION_END = '2099-12-31';

export function isOpenEndedEndDate(endDate: string | null | undefined): boolean {
  return !!endDate && endDate >= '2099-01-01';
}

/** Normalize any free-text/enum payment method to the ClubPaymentMethod enum (or null). */
export function toClubPaymentMethod(v?: string | null): ClubPaymentMethod | null {
  if (!v) return null;
  const m = v.toLowerCase();
  if (m === 'cash' || m === 'card' || m === 'bank' || m === 'online') return m as ClubPaymentMethod;
  if (m.includes('bank') || m.includes('transfer') || m.includes('تحويل')) return 'bank';
  if (m.includes('card') || m.includes('visa') || m.includes('بطاق')) return 'card';
  if (m.includes('online') || m.includes('wallet') || m.includes('محفظ')) return 'online';
  return 'cash';
}

export function deriveSubStatus(startDate: string, endDate: string): ClubSubStatus {
  const today = parseDateOnly(localDateString());
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  if (today < start) return 'upcoming';
  if (today > end) return 'expired';
  return 'active';
}

/**
 * Date/status for session packages (حصص): no calendar expiry — active from start until
 * sessions are exhausted (when a sessions count is known).
 */
export function deriveSessionAwareStatus(opts: {
  startDate: string;
  endDate: string;
  isLinkedToSessions: boolean;
  sessionsCount?: number | null;
  sessionsUsed?: number | null;
}): ClubSubStatus {
  if (!opts.isLinkedToSessions) {
    return deriveSubStatus(opts.startDate, opts.endDate);
  }
  const today = parseDateOnly(localDateString());
  const start = parseDateOnly(opts.startDate);
  if (today < start) return 'upcoming';
  if (opts.sessionsCount != null) {
    const remaining = Math.max(0, opts.sessionsCount - (opts.sessionsUsed ?? 0));
    if (remaining <= 0) return 'expired';
  }
  return 'active';
}

export function addDays(dateStr: string, days: number): string {
  const d = parseDateOnly(dateStr);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** End date for a new/updated subscription — session packages have no calendar expiry. */
export function resolveSubscriptionEndDate(
  startDate: string,
  days: number,
  isLinkedToSessions: boolean,
): string {
  if (isLinkedToSessions) return OPEN_ENDED_SUBSCRIPTION_END;
  return addDays(startDate, days);
}

/** MySQL UNSIGNED aggregates may return bigint — normalize before arithmetic. */
export function nextSeqFromMax(maxNum: unknown): number {
  if (maxNum == null) return 1;
  if (typeof maxNum === 'bigint') return Number(maxNum) + 1;
  if (typeof maxNum === 'number') return maxNum + 1;
  const n = Number(maxNum);
  return Number.isFinite(n) ? n + 1 : 1;
}

export function daysBetween(start: string, end: string): number {
  const ms = parseDateOnly(end).getTime() - parseDateOnly(start).getTime();
  return Math.ceil(ms / 86400000);
}

/**
 * A selected freeze end date is inclusive: a freeze from 10th through 16th
 * blocks the subscription on all seven dates and resumes on the 17th.
 */
export function resolveFreezePeriod(startDate: string, endDate: string) {
  return {
    startDate,
    endDate,
    days: daysBetween(startDate, endDate) + 1,
    unfreezeDate: addDays(endDate, 1),
  };
}

export function netValue(
  subscriptionValue: number,
  discountEnabled: boolean,
  discountValue: number,
): number {
  return subscriptionValue - (discountEnabled ? discountValue : 0);
}

export function remainingAmount(
  subscriptionValue: number,
  discountEnabled: boolean,
  discountValue: number,
  paidAmount: number,
): number {
  const discount = discountEnabled ? discountValue : 0;
  return Math.max(0, subscriptionValue - discount - paidAmount);
}

export function toNum(v: unknown): number {
  if (v == null) return 0;
  return Number(v);
}

/** Round a monetary value to 2 decimals — same rounding the ledger uses (Math.round(x*100)/100). */
export function roundMoney(v: number): number {
  return Math.round(v * 100) / 100;
}
