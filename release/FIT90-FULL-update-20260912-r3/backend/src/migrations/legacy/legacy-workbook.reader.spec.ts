import { analyzeLegacyWorkbooks } from './legacy-workbook.reader';

describe('legacy workbook reader', () => {
  it('requires both explicitly supplied source files', async () => {
    await expect(analyzeLegacyWorkbooks({ membersPath: '', exportPath: '' })).rejects.toThrow('source');
  });
});
