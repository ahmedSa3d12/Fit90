import { ForbiddenException } from '@nestjs/common';
import { ExportService } from './export.service';

describe('ExportService', () => {
  it('rejects every server-side Excel export', async () => {
    await expect(
      new ExportService().toXlsx([{ name: 'Data', columns: [], rows: [] }]),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
