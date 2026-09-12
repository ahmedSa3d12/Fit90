import {
  availableAppointmentTimes,
  intervalsOverlap,
  toClock,
  toMinutes,
} from './appointment-time.util';

describe('appointment time utilities', () => {
  it('converts clock values to minutes and back', () => {
    expect(toMinutes('15:30')).toBe(930);
    expect(toMinutes('15:30:00')).toBe(930);
    expect(toClock(930)).toBe('15:30');
  });

  it('treats touching half-open intervals as non-overlapping', () => {
    expect(intervalsOverlap('15:00', '15:30', '15:30', '16:15')).toBe(false);
  });

  it('detects partial overlap', () => {
    expect(intervalsOverlap('15:00', '15:45', '15:30', '16:15')).toBe(true);
  });

  it('adds an existing booking end as an available candidate', () => {
    const result = availableAppointmentTimes(
      { startTime: '15:00', endTime: '20:00' },
      30,
      [{ startTime: '15:30', endTime: '16:15' }],
    );

    expect(result).toContainEqual({ startTime: '15:00', endTime: '15:30' });
    expect(result).toContainEqual({ startTime: '16:15', endTime: '16:45' });
    expect(result).not.toContainEqual({ startTime: '15:15', endTime: '15:45' });
    expect(result).not.toContainEqual({ startTime: '15:30', endTime: '16:00' });
  });

  it('keeps only candidates whose full duration fits in the window', () => {
    expect(availableAppointmentTimes(
      { startTime: '15:00', endTime: '16:00' },
      45,
      [],
    )).toEqual([
      { startTime: '15:00', endTime: '15:45' },
      { startTime: '15:15', endTime: '16:00' },
    ]);
  });

  it('rejects invalid windows and durations', () => {
    expect(() => availableAppointmentTimes(
      { startTime: '16:00', endTime: '15:00' }, 30, [],
    )).toThrow('Availability window end must be after start.');
    expect(() => availableAppointmentTimes(
      { startTime: '15:00', endTime: '16:00' }, 0, [],
    )).toThrow('Service duration must be positive.');
  });
});