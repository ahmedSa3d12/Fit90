import { SchedulesService } from './schedules.service';

describe('SchedulesService appointment cancellation', () => {
  it.each(['spa', 'personal_training'] as const)(
    'cancels the %s appointment, active bookings, waitlist, and add-ons atomically',
    async (category) => {
      const schedule = {
        id: 12,
        employee_id: 4,
        slot_date: '2026-08-10',
        start_time: '18:00:00',
        status: 'available',
        service: { name: category === 'spa' ? 'Massage' : 'PT Session', category },
        bookings: [
          { id: 31, member_id: 7, member_name: 'Member A', branch_id: 1 },
          { id: 32, member_id: 8, member_name: 'Member B', branch_id: 1 },
        ],
      };
      const tx = {
        club_schedules: { update: jest.fn().mockResolvedValue({}) },
        club_bookings: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
        club_appt_booking_additional_services: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      const prisma: any = {
        club_schedules: { findFirst: jest.fn().mockResolvedValue(schedule) },
        $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
      };
      const employeeScope = { assertProviderAccess: jest.fn().mockResolvedValue(undefined) };
      const notifications = {
        bookingCancelled: jest.fn().mockRejectedValue(new Error('notifications unavailable')),
      };
      const service = new SchedulesService(
        prisma,
        {} as any,
        employeeScope as any,
        notifications as any,
      );

      await expect(service.cancel(schedule.id)).resolves.toEqual({
        success: true,
        notifiedBookingsCount: 2,
      });
      expect(tx.club_schedules.update).toHaveBeenCalledWith({
        where: { id: schedule.id },
        data: { status: 'cancelled', booked_count: 0 },
      });
      expect(tx.club_bookings.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [31, 32] } },
        data: { status: 'cancelled' },
      });
      expect(tx.club_appt_booking_additional_services.updateMany).toHaveBeenCalledWith({
        where: { booking_id: { in: [31, 32] }, status: { not: 'cancelled' } },
        data: { status: 'cancelled' },
      });
      expect(employeeScope.assertProviderAccess).toHaveBeenCalledWith(undefined, 4);
    },
  );
});
