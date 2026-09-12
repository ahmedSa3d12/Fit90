/**
 * Pure date/time helpers for the scheduling engine. All dates are yyyy-mm-dd
 * strings and all times are HH:mm[:ss] strings on a shared lexical scale, so
 * half-open overlap tests can be done as plain string/number comparisons.
 */

/** Minutes since midnight for an HH:mm[:ss] string. */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':');
  return parseInt(h, 10) * 60 + parseInt(m ?? '0', 10);
}

/** HH:mm for a minutes-since-midnight value. */
export function fromMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Normalize HH:mm[:ss] to HH:mm for consistent storage/comparison. */
export function normTime(hhmm: string): string {
  return fromMinutes(toMinutes(hhmm));
}

/**
 * Weekday (0=Sun..6=Sat) for a yyyy-mm-dd string, computed at local noon to
 * avoid DST/timezone edge cases pushing the date across midnight.
 */
export function weekdayOf(dateStr: string): number {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.getDay();
}

/** True when dateStr is a real calendar date (rejects 2025-02-31 etc.). */
export function isValidDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map((n) => parseInt(n, 10));
  const probe = new Date(`${dateStr}T12:00:00`);
  return (
    !Number.isNaN(probe.getTime()) &&
    probe.getFullYear() === y &&
    probe.getMonth() + 1 === m &&
    probe.getDate() === d
  );
}

/**
 * Inclusive list of yyyy-mm-dd strings from `from` to `to`. Iterates by adding
 * days to a Date built at local noon; caps at 366 days to bound runaway input.
 */
export function dateRange(from: string, to: string, maxDays = 366): string[] {
  const out: string[] = [];
  const start = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return out;
  const cursor = new Date(start);
  let guard = 0;
  while (cursor <= end && guard < maxDays) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, '0');
    const d = String(cursor.getDate()).padStart(2, '0');
    out.push(`${y}-${m}-${d}`);
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return out;
}

/** Half-open overlap: [aStart,aEnd) intersects [bStart,bEnd). */
export function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return toMinutes(aStart) < toMinutes(bEnd) && toMinutes(aEnd) > toMinutes(bStart);
}

/**
 * Slice a working window [workStart, workEnd) into fixed-length blocks separated
 * by a break. Returns [start, end] HH:mm pairs; only full-length blocks that fit
 * are emitted.
 */
export function sliceWindow(
  workStart: string,
  workEnd: string,
  durationMin: number,
  breakMin: number,
): Array<{ start: string; end: string }> {
  const out: Array<{ start: string; end: string }> = [];
  if (durationMin <= 0) return out;
  const endBound = toMinutes(workEnd);
  let cursor = toMinutes(workStart);
  let guard = 0;
  while (cursor + durationMin <= endBound && guard < 500) {
    out.push({ start: fromMinutes(cursor), end: fromMinutes(cursor + durationMin) });
    cursor += durationMin + breakMin;
    guard += 1;
  }
  return out;
}
