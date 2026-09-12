import { BadRequestException } from '@nestjs/common';
import { ClubAttendanceController } from './club-attendance.controller';

describe('ClubAttendanceController personal checkout', () => {
  it('rejects a today checkout request without an attendance id', () => {
    const service = { checkOutToday: jest.fn() };
    const controller = new ClubAttendanceController(service as never);

    const todayController = controller as ClubAttendanceController & {
      checkOutToday({ attendanceId }: { attendanceId?: number }, userId: number): unknown;
    };
    expect(() => todayController.checkOutToday({}, 7)).toThrow(BadRequestException);
    expect(service.checkOutToday).not.toHaveBeenCalled();
  });
});
