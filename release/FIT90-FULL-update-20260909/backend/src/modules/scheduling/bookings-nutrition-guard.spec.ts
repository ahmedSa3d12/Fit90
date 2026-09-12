import { BadRequestException } from '@nestjs/common';
import { BookingsService } from './bookings.service';

describe('BookingsService nutrition mutation guard', () => {
  const prisma: any = {
    club_bookings: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };
  const branchScope: any = {};
  const notifications: any = {};
  const employeeScope: any = { assertProviderAccess: jest.fn() };
  const service = new BookingsService(prisma, branchScope, notifications, employeeScope);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.club_bookings.findFirst.mockResolvedValue({
      id: 51,
      employee_id: 3,
      service: { category: 'nutrition' },
    });
  });

  it('rejects generic updates for nutrition bookings', async () => {
    await expect(service.update(51, { status: 'cancelled' } as any))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects generic deletes for nutrition bookings', async () => {
    await expect(service.remove(51)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
