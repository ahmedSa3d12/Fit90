import { writeCsv } from './legacy-import.reports';

describe('legacy import reports', () => {
  it('escapes formula-looking fields in review CSV rows', () => {
    expect(writeCsv(['value'], [{ value: '=SUM(1,1)' }], true)).toContain("'=SUM(1,1)");
  });
});
