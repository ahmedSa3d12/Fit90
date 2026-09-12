import { formatMigMemberCode, nextSeqFromMax } from './club-member.utils';

describe('MIG member-code utilities', () => {
  it('continues a MIG sequence without changing its number of digits', () => {
    expect(formatMigMemberCode(nextSeqFromMax(22262))).toBe('MIG-22263');
  });
});
