import { dateTimeRangeWhere } from './mos-reports.shared';

describe('MOS report shared filters', () => {
  it('expands selected dates to complete UTC days for DateTime fields', () => {
    expect(
      dateTimeRangeWhere(
        'created_at',
        { dateFrom: '2026-07-01', dateTo: '2026-07-31' } as never,
      ),
    ).toEqual({
      created_at: {
        gte: new Date('2026-07-01T00:00:00.000Z'),
        lte: new Date('2026-07-31T23:59:59.999Z'),
      },
    });
  });
});
