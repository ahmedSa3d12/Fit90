import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface AdmsUploadResult {
  received: number;
  created: number;
  duplicates: number;
  unknownMembers: number;
  invalid: number;
}

type AttendanceLog = {
  pin: string;
  timestamp: Date;
  date: string;
  verify: string | null;
};

@Injectable()
export class AdmsAttendanceService {
  private readonly logger = new Logger(AdmsAttendanceService.name);

  constructor(private readonly prisma: PrismaService) {}

  assertDeviceAllowed(serial: string) {
    const allowed = (process.env.ADMS_ALLOWED_SERIALS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (allowed.length > 0 && !allowed.includes(serial)) {
      throw new UnauthorizedException('Unknown ADMS device');
    }
  }

  async ingest(serial: string, table: string | undefined, body: unknown): Promise<AdmsUploadResult> {
    this.assertDeviceAllowed(serial);
    const raw = typeof body === 'string' ? body : '';
    const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const result: AdmsUploadResult = {
      received: lines.length,
      created: 0,
      duplicates: 0,
      unknownMembers: 0,
      invalid: 0,
    };

    // USERINFO/OPERLOG and other PUSH tables are acknowledged but are not attendance.
    if (table && table.toUpperCase() !== 'ATTLOG' && !lines.some((line) => line.startsWith('ATTLOG'))) {
      return result;
    }

    for (const line of lines) {
      const parsed = this.parseAttendanceLine(line);
      if (!parsed) {
        result.invalid += 1;
        continue;
      }

      const member = await this.prisma.club_members.findFirst({
        where: {
          is_deleted: false,
          OR: [{ member_code: parsed.pin }, { card_number: parsed.pin }],
        },
      });
      if (!member) {
        result.unknownMembers += 1;
        this.logger.warn(`ADMS ${serial}: member PIN ${parsed.pin} was not found`);
        continue;
      }

      const existing = await this.prisma.club_attendance.findFirst({
        where: { member_id: member.id, attendance_date: parsed.date },
        orderBy: { check_in_time: 'desc' },
      });
      if (existing) {
        result.duplicates += 1;
        continue;
      }

      await this.prisma.club_attendance.create({
        data: {
          member_id: member.id,
          member_code: member.member_code,
          member_name: member.name,
          branch_id: member.branch_id,
          check_in_time: parsed.timestamp,
          attendance_date: parsed.date,
          status: 'checked_in',
          notes: `ADMS SN=${serial}${parsed.verify ? ` verify=${parsed.verify}` : ''}`,
        },
      });
      result.created += 1;
    }

    this.logger.log(`ADMS ${serial}: ${JSON.stringify(result)}`);
    return result;
  }

  private parseAttendanceLine(line: string): AttendanceLog | null {
    const fields = line.replace(/^ATTLOG[\t ]+/, '').split(/\t+/);
    if (fields.length < 2) return null;
    const pin = fields[0]?.trim();
    const rawTimestamp = fields[1]?.trim();
    if (!pin || !rawTimestamp) return null;

    const match = rawTimestamp.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
    if (!match) return null;
    const [, year, month, day, hour, minute, second] = match;
    const timestamp = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    );
    if (Number.isNaN(timestamp.getTime())) return null;

    return {
      pin,
      timestamp,
      date: `${year}-${month}-${day}`,
      verify: fields[3]?.trim() || null,
    };
  }
}
