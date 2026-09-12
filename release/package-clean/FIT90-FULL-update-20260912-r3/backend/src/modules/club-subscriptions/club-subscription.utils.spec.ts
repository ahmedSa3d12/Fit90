import { resolveFreezePeriod } from './club-subscription.utils';

describe('resolveFreezePeriod', () => {
  it('keeps both selected boundary dates in the freeze period', () => {
    expect(resolveFreezePeriod('2026-09-10', '2026-09-16')).toEqual({
      startDate: '2026-09-10',
      endDate: '2026-09-16',
      days: 7,
      unfreezeDate: '2026-09-17',
    });
  });

  it('treats a same-day freeze as one full frozen day', () => {
    expect(resolveFreezePeriod('2026-09-10', '2026-09-10')).toEqual({
      startDate: '2026-09-10',
      endDate: '2026-09-10',
      days: 1,
      unfreezeDate: '2026-09-11',
    });
  });
});
