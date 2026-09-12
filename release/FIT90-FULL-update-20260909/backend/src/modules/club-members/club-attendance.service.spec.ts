import { ClubAttendanceService } from './club-attendance.service';
import { localDateString } from './club-member.utils';

const attendanceRow = {
  id: 41,
  member_id: 12,
  member_code: 'M-0012',
  member_name: 'أحمد علي',
  branch_id: 2,
  check_in_time: new Date('2026-09-09T07:30:00.000Z'),
  check_out_time: null,
  attendance_date: localDateString(),
  status: 'checked_in',
  duration: null,
  notes: null,
  created_by: 7,
  created_at: new Date('2026-09-09T07:30:00.000Z'),
};

type TodayEntryService = ClubAttendanceService & {
  listToday(query: { page: number; pageSize: number; search?: string }): Promise<unknown>;
  checkOutToday(attendanceId: number, userId: number): Promise<unknown>;
};

function createService(overrides: Record<string, unknown> = {}) {
  const prisma = {
    club_attendance: {
      findMany: jest.fn().mockResolvedValue([attendanceRow]),
      findFirst: jest.fn().mockResolvedValue(attendanceRow),
      count: jest.fn().mockResolvedValue(1),
      update: jest.fn().mockResolvedValue({
        ...attendanceRow,
        check_out_time: new Date('2026-09-09T08:10:00.000Z'),
        duration: 40,
        status: 'checked_out',
      }),
    },
    ...overrides,
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  return {
    prisma,
    service: new ClubAttendanceService(
      prisma as never,
      {} as never,
      {} as never,
      audit as never,
      {} as never,
      {} as never,
    ),
  };
}

describe('ClubAttendanceService today entry view', () => {
  it('returns all today records without filtering by the employee who created them', async () => {
    const { service, prisma } = createService();

    const result = await (service as TodayEntryService).listToday({ page: 1, pageSize: 20 });

    expect(result).toMatchObject({
      data: [{ id: 41, memberName: 'أحمد علي', memberCode: 'M-0012' }],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    expect(prisma.club_attendance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [{ attendance_date: localDateString() }],
        },
      }),
    );
  });

  it('allows a different employee to check out a record created today', async () => {
    const { service, prisma } = createService({
      club_attendance: {
        findFirst: jest.fn().mockResolvedValue(attendanceRow),
        update: jest.fn().mockResolvedValue({
          ...attendanceRow,
          check_out_time: new Date('2026-09-09T08:10:00.000Z'),
          duration: 40,
          status: 'checked_out',
        }),
      },
    });

    await expect((service as TodayEntryService).checkOutToday(41, 8)).resolves.toMatchObject({
      id: 41,
      status: 'checked_out',
    });
    expect(prisma.club_attendance.findFirst).toHaveBeenCalledWith({
      where: { id: 41, attendance_date: localDateString() },
    });
  });
});
