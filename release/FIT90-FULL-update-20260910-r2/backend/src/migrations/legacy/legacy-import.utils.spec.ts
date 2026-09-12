import {
  assertLocalDatabaseUrl,
  escapeSpreadsheetFormula,
  normalizeEgyptPhone,
  normalizeLegacyText,
  parseLegacyDate,
} from './legacy-import.utils';

describe('legacy import safety utilities', () => {
  it('accepts loopback database URLs and rejects remote URLs without exposing them', () => {
    expect(() => assertLocalDatabaseUrl('mysql://user:pass@127.0.0.1:3306/fit90_local')).not.toThrow();
    expect(() => assertLocalDatabaseUrl('mysql://user:pass@144.76.74.208:3306/fit90')).toThrow('محلية');
  });

  it('normalizes Arabic digits and an Egyptian country prefix to a local mobile number', () => {
    expect(normalizeEgyptPhone('٢٠١٠ ١٢٣٤ ٥٦٧٨')).toBe('01012345678');
  });

  it('does not turn an invalid phone number into a guessed number', () => {
    expect(normalizeEgyptPhone('01234')).toBeNull();
  });

  it('parses only unambiguous dates and retains Arabic text after cleanup', () => {
    expect(parseLegacyDate('2026-09-07')).toBe('2026-09-07');
    expect(parseLegacyDate('07/09/2026')).toBeNull();
    expect(normalizeLegacyText('  أحمد\u200b علي  ')).toBe('أحمد علي');
  });

  it('escapes review values that Excel could execute', () => {
    expect(escapeSpreadsheetFormula('=SUM(1,1)')).toBe("'=SUM(1,1)");
    expect(escapeSpreadsheetFormula('01012345678')).toBe('01012345678');
  });
});
