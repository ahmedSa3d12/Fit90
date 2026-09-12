export interface TimeInterval {
  startTime: string;
  endTime: string;
}

export interface AvailableAppointmentTime extends TimeInterval {}

const CLOCK_RE = /^(\d{2}):(\d{2})(?::\d{2})?$/;

export function toMinutes(value: string): number {
  const match = CLOCK_RE.exec(value);
  if (!match) throw new Error(`Invalid clock value: ${value}`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new Error(`Invalid clock value: ${value}`);
  return hours * 60 + minutes;
}

export function toClock(totalMinutes: number): string {
  if (!Number.isInteger(totalMinutes) || totalMinutes < 0 || totalMinutes >= 24 * 60) {
    throw new Error(`Invalid minute value: ${totalMinutes}`);
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function intervalsOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return toMinutes(aStart) < toMinutes(bEnd) && toMinutes(aEnd) > toMinutes(bStart);
}

export function availableAppointmentTimes(
  window: TimeInterval,
  durationMin: number,
  occupied: TimeInterval[],
  stepMin = 15,
): AvailableAppointmentTime[] {
  const windowStart = toMinutes(window.startTime);
  const windowEnd = toMinutes(window.endTime);
  if (windowEnd <= windowStart) throw new Error('Availability window end must be after start.');
  if (!Number.isInteger(durationMin) || durationMin <= 0) {
    throw new Error('Service duration must be positive.');
  }
  if (!Number.isInteger(stepMin) || stepMin <= 0) throw new Error('Time step must be positive.');

  const candidates = new Set<number>();
  for (let start = windowStart; start < windowEnd; start += stepMin) candidates.add(start);
  for (const interval of occupied) {
    const end = toMinutes(interval.endTime);
    if (end >= windowStart && end < windowEnd) candidates.add(end);
  }

  return [...candidates]
    .sort((left, right) => left - right)
    .filter((start) => {
      const end = start + durationMin;
      if (end > windowEnd) return false;
      return occupied.every((interval) => (
        start >= toMinutes(interval.endTime) || end <= toMinutes(interval.startTime)
      ));
    })
    .map((start) => ({ startTime: toClock(start), endTime: toClock(start + durationMin) }));
}