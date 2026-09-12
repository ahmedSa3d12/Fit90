import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GenerateMonthDto } from './generate-month.dto';
import { UpsertSlotDto } from './upsert-slot.dto';

describe('availability DTO validation', () => {
  it('accepts a valid calendar date and 24-hour start/end times', async () => {
    const dto = plainToInstance(UpsertSlotDto, {
      moduleType: 'spa', slotDate: '2026-08-23', startTime: '15:00', endTime: '16:30',
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('accepts valid recurring template times', async () => {
    const dto = plainToInstance(GenerateMonthDto, {
      moduleType: 'spa', month: '2026-08',
      templates: [{ weekday: 0, startTime: '15:00', endTime: '20:00' }],
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
  });
});
