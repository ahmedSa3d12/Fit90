import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { legacyDateMatchValues, todayIso } from '../../common/utils/legacy-date.util';
import { UpsertShiftDto } from './dto/shift.dto';
import { CheckPunchDto } from './dto/check.dto';
import { AttendanceReportDto } from './dto/report.dto';

/** Minutes-since-midnight from a "h:i A" or "HH:mm" time-string. */
function parseTimeToMinutes(time: string): number {
  const t = (time ?? '').trim();
  const ampm = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const m = parseInt(ampm[2], 10);
    const pm = ampm[3].toUpperCase() === 'PM';
    if (pm && h < 12) h += 12;
    if (!pm && h === 12) h = 0;
    return h * 60 + m;
  }
  const hm = t.match(/^(\d{1,2}):(\d{2})/);
  if (hm) return parseInt(hm[1], 10) * 60 + parseInt(hm[2], 10);
  return 0;
}

/** Legacy stores shift/punch times as "h:i A". Normalise any input to that. */
function formatMinutesAsTime(totalMin: number): string {
  const wrapped = ((totalMin % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * Faithful port of Api::sum_min_late (active variant, l.7531): build same-day
 * datetimes, handle overnight wrap (actual<expected & gap>12h ⇒ +24h),
 * floor((actual-expected)/60), keep when >0.
 */
function sumMinLate(expected: string, actual: string): number {
  const expectedMin = parseTimeToMinutes(expected);
  let actualMin = parseTimeToMinutes(actual);
  if (actualMin < expectedMin && expectedMin - actualMin > 12 * 60) {
    actualMin += 24 * 60;
  }
  const diff = Math.floor(actualMin - expectedMin);
  return diff > 0 ? diff : 0;
}

/** Faithful port of Api::sum_min_mobaker (l.7547): floor((expected-actual)/60), >0. */
function sumMinMobaker(expected: string, actual: string): number {
  const expectedMin = parseTimeToMinutes(expected);
  const actualMin = parseTimeToMinutes(actual);
  const diff = Math.floor(expectedMin - actualMin);
  return diff > 0 ? diff : 0;
}

/**
 * Shift time-window (minutes-since-midnight, with next-day offsets) — port of
 * Api::get_shift_datetimes. Times that fall before hdoor_from are rolled to +1 day
 * so overnight shifts compare correctly.
 */
interface ShiftWindow {
  hdoorFrom: number;
  hdoorTo: number;
  hdoorKhasm: number;
  ensrafFrom: number;
  ensrafTo: number;
  ensrafKhasm: number;
}

function buildShiftWindow(s: {
  hdoor_from_time?: string | null;
  hdoor_to_time?: string | null;
  hdoor_khasm_from?: string | null;
  ensraf_from_time?: string | null;
  ensraf_to_time?: string | null;
  ensraf_khasm_from?: string | null;
}): ShiftWindow {
  const DAY = 24 * 60;
  const hdoorFromRaw = parseTimeToMinutes(s.hdoor_from_time ?? '');
  const hdoorToRaw = parseTimeToMinutes(s.hdoor_to_time ?? '');
  const hdoorKhasmRaw = parseTimeToMinutes(s.hdoor_khasm_from ?? '');
  const ensrafFromRaw = parseTimeToMinutes(s.ensraf_from_time ?? '');
  const ensrafToRaw = parseTimeToMinutes(s.ensraf_to_time ?? '');
  const ensrafKhasmRaw = parseTimeToMinutes(s.ensraf_khasm_from ?? '');

  const hdoorFrom = hdoorFromRaw;
  const hdoorTo = hdoorToRaw < hdoorFromRaw ? hdoorToRaw + DAY : hdoorToRaw;
  const hdoorKhasm = hdoorKhasmRaw < hdoorFromRaw ? hdoorKhasmRaw + DAY : hdoorKhasmRaw;

  // All ensraf times compare against hdoor_from; if earlier ⇒ next day.
  const ensrafFrom = ensrafFromRaw < hdoorFromRaw ? ensrafFromRaw + DAY : ensrafFromRaw;
  const ensrafKhasm = ensrafKhasmRaw < hdoorFromRaw ? ensrafKhasmRaw + DAY : ensrafKhasmRaw;
  // ensraf_to compares against ensraf_from's day.
  const ensrafFromDayOffset = ensrafFrom - ensrafFromRaw; // 0 or DAY
  const ensrafTo =
    ensrafToRaw < ensrafFromRaw
      ? ensrafToRaw + ensrafFromDayOffset + DAY
      : ensrafToRaw + ensrafFromDayOffset;

  return { hdoorFrom, hdoorTo, hdoorKhasm, ensrafFrom, ensrafTo, ensrafKhasm };
}

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------------
  // BOARD
  // -------------------------------------------------------------------------
  async board(q: PaginationDto & { date?: string; source?: string; status?: string }) {
    const date = q.date?.slice(0, 10) ?? todayIso();
    const matches = legacyDateMatchValues(date);
    const where: Prisma.tbl_hdoor_empsWhereInput = { action_date_s: { in: matches } };

    const rows = await this.prisma.tbl_hdoor_emps.findMany({
      where,
      orderBy: { hodoor_id: 'desc' },
    });

    const empCodes = [...new Set(rows.map((r) => r.member_code).filter(Boolean))] as number[];
    const emps = await this.prisma.employees.findMany({
      where: { emp_code: { in: empCodes } },
      select: { id: true, emp_code: true, employee: true, edara_n: true },
    });
    const empByCode = new Map(emps.map((e) => [e.emp_code, e]));

    const dwams = await this.prisma.hr_emp_dwam.findMany({
      where: { emp_id: { in: emps.map((e) => e.id) } },
    });
    const dwamByEmp = new Map(dwams.map((d) => [d.emp_id, d]));

    let mapped = rows.map((r) => {
      const emp = empByCode.get(r.member_code ?? 0);
      const dwam = emp ? dwamByEmp.get(emp.id) : undefined;
      const scheduledIn = dwam?.attend_time ?? r.dwam_hdoor_time ?? undefined;
      const scheduledOut = dwam?.leave_time ?? r.dwam_ensraf_time ?? undefined;
      const lateMin = r.late_min != null ? Math.round(r.late_min) : undefined;
      const earlyLeaveMin = r.mobaker_min != null ? Math.round(r.mobaker_min) : undefined;
      const overtimeMin = r.num_min != null ? Math.round(r.num_min) : undefined;
      const source = r.tasgel_type === 'manual' ? 'app' : 'device';
      let status = 'present';
      if (!r.hdoor_time) status = 'absent';
      else if (lateMin && lateMin > 0) status = 'late';

      return {
        id: r.hodoor_id,
        empCode: r.member_code != null ? String(r.member_code) : undefined,
        employeeName: emp?.employee ?? undefined,
        department: emp?.edara_n ?? undefined,
        scheduledIn,
        scheduledOut,
        checkIn: r.hdoor_time ?? undefined,
        checkOut: r.ensraf_time ?? undefined,
        secondCheckIn: r.second_hdoor_time ?? undefined,
        secondCheckOut: r.second_ensraf_time ?? undefined,
        lateMin,
        earlyLeaveMin,
        overtimeMin,
        status,
        source,
        checkInLat: r.hdoor_lat ? parseFloat(r.hdoor_lat) : undefined,
        checkInLng: r.hdoor_long ? parseFloat(r.hdoor_long) : undefined,
        checkInPhoto: r.hdoor_img_path ?? undefined,
        secondCheckInPhoto: r.second_hdoor_img_path ?? undefined,
      };
    });

    if (q.search?.trim()) {
      const s = q.search.trim().toLowerCase();
      mapped = mapped.filter(
        (r) => r.employeeName?.toLowerCase().includes(s) || r.empCode?.includes(s),
      );
    }
    if (q.source && q.source !== 'all') {
      mapped = mapped.filter((r) => r.source === q.source);
    }
    if (q.status && q.status !== 'all') {
      mapped = mapped.filter((r) => r.status === q.status);
    }

    const total = mapped.length;
    const data = mapped.slice(q.skip, q.skip + q.take);
    return paginated(data, total, q.page, q.pageSize);
  }

  // -------------------------------------------------------------------------
  // RULES (now actually consumed by the check calc)
  // -------------------------------------------------------------------------
  private async getRulesMap(): Promise<
    Map<string, { enabled: boolean; threshold: number; graceMin: number; multiplier: number }>
  > {
    const rows = await this.prisma.attendance_rules.findMany();
    const map = new Map<
      string,
      { enabled: boolean; threshold: number; graceMin: number; multiplier: number }
    >();
    for (const r of rows) {
      map.set(r.key, {
        enabled: r.enabled === 1,
        threshold: r.threshold ? parseInt(r.threshold, 10) || 0 : 0,
        graceMin: r.grace_min ? parseInt(r.grace_min, 10) || 0 : 0,
        multiplier: r.multiplier ? parseFloat(r.multiplier) || 1 : 1,
      });
    }
    return map;
  }

  private async enabledChannels(): Promise<Set<string>> {
    const rows = await this.prisma.attendance_channels.findMany();
    const set = new Set<string>();
    for (const r of rows) if (r.enabled === 1) set.add(r.key);
    return set;
  }

  /**
   * Apply attendance_rules to a raw late value: late-rule grace (graceMin) is an
   * additional tolerance on top of the shift khasm threshold; if the (already
   * khasm-reduced) lateness is within grace, it is forgiven. Mirrors the intent
   * of the legacy 10-min tolerance / khasm grace.
   */
  private applyLateRule(
    rawLate: number,
    rules: Map<string, { enabled: boolean; graceMin: number }>,
  ): number {
    const rule = rules.get('late');
    if (!rule || !rule.enabled) return rawLate;
    const grace = rule.graceMin ?? 0;
    return rawLate > grace ? rawLate - grace : 0;
  }

  private applyEarlyRule(
    rawEarly: number,
    rules: Map<string, { enabled: boolean; graceMin: number }>,
  ): number {
    const rule = rules.get('early_leave');
    if (!rule || !rule.enabled) return rawEarly;
    const grace = rule.graceMin ?? 0;
    return rawEarly > grace ? rawEarly - grace : 0;
  }

  /**
   * Compute overtime minutes on departure: minutes worked past ensraf_khasm (the
   * legacy "احتساب الاضافى" threshold). Scaled by the overtime rule multiplier when
   * the overtime rule is enabled, and only counted once it exceeds the threshold.
   */
  private computeOvertime(
    actualOutMin: number,
    ensrafKhasm: number,
    rules: Map<string, { enabled: boolean; threshold: number; multiplier: number }>,
  ): number {
    let extra = actualOutMin - ensrafKhasm;
    if (extra <= 0) return 0;
    const rule = rules.get('overtime');
    if (rule && rule.enabled) {
      if (extra < rule.threshold) return 0;
      extra = Math.floor(extra * (rule.multiplier || 1));
    }
    return Math.floor(extra);
  }

  async getRules() {
    const rows = await this.prisma.attendance_rules.findMany({ orderBy: { id: 'asc' } });
    return rows.map((r) => ({
      key: r.key,
      enabled: r.enabled === 1,
      threshold: r.threshold ?? '',
      graceMin: r.grace_min ?? '',
      multiplier: r.multiplier ?? '1',
    }));
  }

  async patchRules(body: {
    rules?: Array<{
      key: string;
      enabled?: boolean;
      threshold?: string;
      graceMin?: string;
      multiplier?: string;
    }>;
  }) {
    const rules = Array.isArray(body.rules) ? body.rules : [];
    for (const r of rules) {
      await this.prisma.attendance_rules.upsert({
        where: { key: r.key },
        create: {
          key: r.key,
          enabled: r.enabled ? 1 : 0,
          threshold: r.threshold ?? '',
          grace_min: r.graceMin ?? '',
          multiplier: r.multiplier ?? '1',
        },
        update: {
          enabled: r.enabled ? 1 : 0,
          threshold: r.threshold ?? '',
          grace_min: r.graceMin ?? '',
          multiplier: r.multiplier ?? '1',
        },
      });
    }
    return this.getRules();
  }

  // -------------------------------------------------------------------------
  // CHECK (faithful add_hdor_ensraf: dwam-window gate + late/early/overtime)
  // -------------------------------------------------------------------------
  async manualCheck(body: CheckPunchDto, userId = 1) {
    const code = parseInt(body.empCode ?? '', 10);
    if (Number.isNaN(code)) throw new BadRequestException('كود الموظف غير صالح');

    const emp = await this.prisma.employees.findFirst({ where: { emp_code: code } });
    if (!emp) throw new NotFoundException('الموظف غير موجود');

    // --- channel gate (attendance_channels) ---
    const channel = body.channel ?? 'app';
    const channels = await this.enabledChannels();
    if (channels.size > 0 && !channels.has(channel)) {
      throw new BadRequestException('قناة التسجيل غير مفعّلة');
    }
    const tasgelType = channel === 'device' ? 'automatic' : 'manual';

    const dwam = await this.prisma.hr_emp_dwam.findFirst({ where: { emp_id: emp.id } });

    // Resolve the shift window. Prefer a tbl_hdodr_setting linked via the employee's
    // dwam assignment; otherwise fall back to hr_emp_dwam attend/leave times.
    type ShiftRow = {
      id: number;
      title: string | null;
      hdoor_from_time: string | null;
      hdoor_to_time: string | null;
      hdoor_khasm_from: string | null;
      ensraf_from_time: string | null;
      ensraf_to_time: string | null;
      ensraf_khasm_from: string | null;
    };
    let shift: ShiftRow | null = await this.prisma.tbl_hdodr_setting.findFirst({
      where: dwam?.always_id_fk ? { id: dwam.always_id_fk } : { id: -1 },
    });
    if (!shift && dwam) {
      // Synthesize a window from hr_emp_dwam so the gate still functions.
      shift = {
        id: 0,
        title: null,
        hdoor_from_time: dwam.start_enter || dwam.attend_time,
        hdoor_to_time: dwam.end_enter || dwam.attend_time,
        hdoor_khasm_from: dwam.attend_time,
        ensraf_from_time: dwam.start_out || dwam.leave_time,
        ensraf_to_time: dwam.end_out || dwam.leave_time,
        ensraf_khasm_from: dwam.leave_time,
      };
    }
    if (!shift) {
      throw new BadRequestException('خارج إعدادات الدوام الأن');
    }

    const win = buildShiftWindow(shift);

    const explicitTime = body.type === 'out' ? body.checkOut : body.checkIn;
    const punchMin = explicitTime ? parseTimeToMinutes(explicitTime) : nowMinutes();
    const currentTimeStr = formatMinutesAsTime(punchMin);

    // --- auto-detect direction within the dwam window (port of add_hdor_ensraf step 2) ---
    const inWindow = (val: number, from: number, to: number) => {
      // window may straddle midnight (to > 1440); also test val+1440.
      return (val >= from && val <= to) || (val + 1440 >= from && val + 1440 <= to);
    };
    const ensrafMaxLimit = win.ensrafFrom + 60; // legacy: +1 hour grace on ensraf detection

    let detected: 'in' | 'out' | null = null;
    if (body.type) {
      detected = body.type;
    } else if (inWindow(punchMin, win.hdoorFrom, win.hdoorTo)) {
      detected = 'in';
    } else if (inWindow(punchMin, win.ensrafFrom, ensrafMaxLimit)) {
      detected = 'out';
    }

    const date = todayIso();
    const matches = legacyDateMatchValues(date);
    const existing = await this.prisma.tbl_hdoor_emps.findFirst({
      where: { member_code: code, action_date_s: { in: matches } },
    });

    // Late-departure rule: a punch ≥60 min after an open check-in counts as ensraf
    // even outside the detected window (port of add_hdor_ensraf step 3).
    if (!detected && existing?.hdoor_time && !existing.ensraf_time) {
      const inMin = parseTimeToMinutes(existing.hdoor_time);
      let delta = punchMin - inMin;
      if (delta < 0) delta += 1440;
      if (delta >= 60) detected = 'out';
    }

    if (!detected) {
      throw new BadRequestException('خارج نطاق أي دوام متاح حالياً للموظف');
    }

    // --- duplicate guards (step 4) ---
    if (existing) {
      if (detected === 'in' && existing.hdoor_time) {
        throw new BadRequestException('لقد سجلت حضورك بالفعل، انتظر ساعة على الأقل لتسجيل انصراف');
      }
      if (detected === 'out' && existing.ensraf_time) {
        throw new BadRequestException('لقد قمت بتسجيل الانصراف مسبقاً لهذا اليوم');
      }
    }

    const rules = await this.getRulesMap();
    const expectedHdoor = formatMinutesAsTime(win.hdoorFrom);
    const expectedEnsraf = formatMinutesAsTime(win.ensrafKhasm % 1440);

    let row = existing;
    if (!row) {
      row = await this.prisma.tbl_hdoor_emps.create({
        data: {
          member_code: code,
          member_id: emp.id,
          action_date_s: date,
          action_date: date,
          for_month: new Date().getMonth() + 1,
          for_year: new Date().getFullYear(),
          sheft_type: dwam?.always_id_fk ?? 0,
          branch_id_fk: emp.branch_id_fk ?? 0,
          dwam_id_fk: shift.id || dwam?.id || 0,
          tasgel_type: tasgelType,
        },
      });
    }

    if (detected === 'out') {
      // early-leave vs ensraf_khasm (calculate_early_minutes / sum_min_mobaker)
      const earlyRaw = sumMinMobaker(expectedEnsraf, currentTimeStr);
      const mobakerMin = this.applyEarlyRule(earlyRaw, rules);
      const overtime = this.computeOvertime(
        punchMin < win.hdoorFrom ? punchMin + 1440 : punchMin,
        win.ensrafKhasm,
        rules,
      );
      await this.prisma.tbl_hdoor_emps.update({
        where: { hodoor_id: row.hodoor_id },
        data: {
          ensraf_time: currentTimeStr,
          dwam_ensraf_time: expectedEnsraf,
          mobaker_min: mobakerMin,
          num_min: overtime,
          ensraf_user_id: userId,
          ensraf_lat: body.long != null ? body.lat : row.ensraf_lat,
          ensraf_long: body.long ?? row.ensraf_long,
          ensraf_img_path: body.photo ?? row.ensraf_img_path,
          ttype: 'ensraf',
          tasgel_type: tasgelType,
        },
      });
      return { id: row.hodoor_id, type: 'out', mobakerMin, overtimeMin: overtime };
    }

    // check-in: late vs khasm (calculate_late_minutes), then late-rule grace
    const lateRaw = sumMinLate(formatMinutesAsTime(win.hdoorKhasm % 1440), currentTimeStr);
    const lateMin = this.applyLateRule(lateRaw, rules);
    await this.prisma.tbl_hdoor_emps.update({
      where: { hodoor_id: row.hodoor_id },
      data: {
        hdoor_time: currentTimeStr,
        dwam_hdoor_time: expectedHdoor,
        late_min: lateMin,
        hdoor_user_id: userId,
        hdoor_lat: body.lat ?? row.hdoor_lat,
        hdoor_long: body.long ?? row.hdoor_long,
        hdoor_img_path: body.photo ?? row.hdoor_img_path,
        ttype: 'hdoor',
        tasgel_type: tasgelType,
      },
    });
    return { id: row.hodoor_id, type: 'in', lateMin };
  }

  // -------------------------------------------------------------------------
  // SHIFT CRUD (tbl_hdodr_setting — all 7 fields)
  // -------------------------------------------------------------------------
  async listShifts(q: PaginationDto) {
    const where: Prisma.tbl_hdodr_settingWhereInput = {};
    if (q.search?.trim()) {
      where.title = { contains: q.search.trim() };
    }
    const [rows, total] = await Promise.all([
      this.prisma.tbl_hdodr_setting.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.tbl_hdodr_setting.count({ where }),
    ]);
    const data = rows.map((r) => this.mapShift(r));
    return paginated(data, total, q.page, q.pageSize);
  }

  private mapShift(r: {
    id: number;
    title: string | null;
    hdoor_from_time: string | null;
    hdoor_to_time: string | null;
    hdoor_khasm_from: string | null;
    ensraf_from_time: string | null;
    ensraf_to_time: string | null;
    ensraf_khasm_from: string | null;
  }) {
    return {
      id: r.id,
      title: r.title ?? undefined,
      hdoorFromTime: r.hdoor_from_time ?? undefined,
      hdoorToTime: r.hdoor_to_time ?? undefined,
      hdoorKhasmFrom: r.hdoor_khasm_from ?? undefined,
      ensrafFromTime: r.ensraf_from_time ?? undefined,
      ensrafToTime: r.ensraf_to_time ?? undefined,
      ensrafKhasmFrom: r.ensraf_khasm_from ?? undefined,
      // legacy-compatible aliases kept for the existing board/grid consumers
      startTime: r.hdoor_from_time ?? undefined,
      endTime: r.ensraf_to_time ?? undefined,
      graceMin: r.hdoor_khasm_from ? parseInt(r.hdoor_khasm_from, 10) || 0 : 0,
    };
  }

  /** Normalise a free-form time to legacy "h:i A" (date("h:i A", strtotime(...))). */
  private toLegacyTime(raw: string, fallback: string): string {
    const v = (raw ?? '').trim();
    if (!v) return fallback;
    return formatMinutesAsTime(parseTimeToMinutes(v));
  }

  private shiftData(dto: UpsertShiftDto) {
    return {
      title: dto.title?.trim() || 'الدوام الصباحي',
      hdoor_from_time: this.toLegacyTime(dto.hdoorFromTime, '08:00 AM'),
      hdoor_to_time: this.toLegacyTime(dto.hdoorToTime, '09:00 AM'),
      hdoor_khasm_from: this.toLegacyTime(dto.hdoorKhasmFrom, '08:15 AM'),
      ensraf_from_time: this.toLegacyTime(dto.ensrafFromTime, '11:00 AM'),
      ensraf_to_time: this.toLegacyTime(dto.ensrafToTime, '06:00 PM'),
      ensraf_khasm_from: this.toLegacyTime(dto.ensrafKhasmFrom, '12:40 PM'),
    };
  }

  async createShift(dto: UpsertShiftDto) {
    const row = await this.prisma.tbl_hdodr_setting.create({ data: this.shiftData(dto) });
    return this.mapShift(row);
  }

  async updateShift(id: number, dto: UpsertShiftDto) {
    const exist = await this.prisma.tbl_hdodr_setting.findUnique({ where: { id } });
    if (!exist) throw new NotFoundException('الوردية غير موجودة');
    const row = await this.prisma.tbl_hdodr_setting.update({
      where: { id },
      data: this.shiftData(dto),
    });
    return this.mapShift(row);
  }

  async removeShift(id: number) {
    const row = await this.prisma.tbl_hdodr_setting.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('الوردية غير موجودة');
    await this.prisma.tbl_hdodr_setting.delete({ where: { id } });
    return { id };
  }

  // -------------------------------------------------------------------------
  // SETTINGS / CHANNELS
  // -------------------------------------------------------------------------
  async getSettings() {
    const rows = await this.prisma.attendance_channels.findMany();
    const channels: Record<string, boolean> = {};
    for (const r of rows) channels[r.key] = r.enabled === 1;
    return { channels };
  }

  async patchSettings(body: { channels?: Record<string, boolean> }) {
    const channels = body.channels ?? {};
    for (const [key, enabled] of Object.entries(channels)) {
      await this.prisma.attendance_channels.upsert({
        where: { key },
        create: { key, enabled: enabled ? 1 : 0 },
        update: { enabled: enabled ? 1 : 0 },
      });
    }
    return this.getSettings();
  }

  // -------------------------------------------------------------------------
  // DEVICES
  // -------------------------------------------------------------------------
  async listDevices(q: PaginationDto) {
    const where: Prisma.attendance_devicesWhereInput = {};
    if (q.search?.trim()) {
      const s = q.search.trim();
      where.OR = [{ title: { contains: s } }, { ip: { contains: s } }];
    }
    const [rows, total] = await Promise.all([
      this.prisma.attendance_devices.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.attendance_devices.count({ where }),
    ]);
    const branchIds = [...new Set(rows.map((r) => r.branch_id_fk).filter(Boolean))] as number[];
    const branches = await this.prisma.tbl_branches.findMany({
      where: { branch_id: { in: branchIds } },
    });
    const branchMap = new Map(branches.map((b) => [b.branch_id, b.branch_name]));
    const data = rows.map((r) => ({
      id: r.id,
      title: r.title ?? undefined,
      ip: r.ip ?? undefined,
      branchTitle: r.branch_id_fk ? (branchMap.get(r.branch_id_fk) ?? undefined) : undefined,
      lastSync: r.last_sync ?? undefined,
      status: r.status ?? 'offline',
    }));
    return paginated(data, total, q.page, q.pageSize);
  }

  async createDevice(body: { title?: string; ip?: string; branchId?: number }) {
    const now = new Date().toISOString();
    const row = await this.prisma.attendance_devices.create({
      data: {
        title: body.title ?? '',
        ip: body.ip ?? '',
        branch_id_fk: body.branchId ?? null,
        status: 'offline',
        created_at: now,
        updated_at: now,
      },
    });
    return { id: row.id };
  }

  async removeDevice(id: number) {
    const row = await this.prisma.attendance_devices.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('الجهاز غير موجود');
    await this.prisma.attendance_devices.delete({ where: { id } });
    return { id };
  }

  async syncDevice(id: number) {
    const row = await this.prisma.attendance_devices.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('الجهاز غير موجود');
    const now = new Date().toISOString();
    await this.prisma.attendance_devices.update({
      where: { id },
      data: { last_sync: now, status: 'online', updated_at: now },
    });
    return { id, lastSync: now };
  }

  async syncAllDevices() {
    const now = new Date().toISOString();
    await this.prisma.attendance_devices.updateMany({
      data: { last_sync: now, status: 'online', updated_at: now },
    });
    return { synced: true, lastSync: now };
  }

  // -------------------------------------------------------------------------
  // REPORTS (date-range + employee + branch)
  // -------------------------------------------------------------------------

  /** R1 — Basma report (Hdoor_m::get_hdoor_actions): in/out per emp/branch over a range. */
  async basmaReport(q: AttendanceReportDto) {
    const where: Prisma.tbl_hdoor_empsWhereInput = {};
    if (q.dateFrom && q.dateTo) {
      where.action_date = { gte: q.dateFrom.slice(0, 10), lte: q.dateTo.slice(0, 10) };
    } else {
      where.action_date = todayIso();
    }
    if (q.empCode && q.empCode !== 'all') where.member_code = parseInt(q.empCode, 10) || 0;
    if (q.branchId && q.branchId !== 'all') where.branch_id_fk = parseInt(q.branchId, 10) || 0;

    const [rows, total] = await Promise.all([
      this.prisma.tbl_hdoor_emps.findMany({
        where,
        orderBy: { hodoor_id: 'asc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.tbl_hdoor_emps.count({ where }),
    ]);
    const codes = [...new Set(rows.map((r) => r.member_code).filter(Boolean))] as number[];
    const emps = await this.prisma.employees.findMany({
      where: { emp_code: { in: codes } },
      select: { emp_code: true, employee: true, edara_n: true },
    });
    const byCode = new Map(emps.map((e) => [e.emp_code, e]));
    const data = rows.map((r) => {
      const e = byCode.get(r.member_code ?? 0);
      return {
        id: r.hodoor_id,
        empCode: r.member_code,
        empName: e?.employee ?? '—',
        department: e?.edara_n ?? undefined,
        actionDate: r.action_date,
        checkIn: r.hdoor_time ?? undefined,
        checkOut: r.ensraf_time ?? undefined,
        lateMin: r.late_min != null ? Math.round(r.late_min) : 0,
        earlyLeaveMin: r.mobaker_min != null ? Math.round(r.mobaker_min) : 0,
        overtimeMin: r.num_min != null ? Math.round(r.num_min) : 0,
      };
    });
    return paginated(data, total, q.page, q.pageSize);
  }

  /**
   * R3 — Late report (Hdoor_m::get_datatables_late): per-employee total lateness
   * over the range, filtered by employee/branch.
   */
  async lateReport(q: AttendanceReportDto) {
    const empWhere: Prisma.employeesWhereInput = {};
    if (q.empCode && q.empCode !== 'all') empWhere.emp_code = parseInt(q.empCode, 10) || 0;
    if (q.branchId && q.branchId !== 'all') empWhere.branch_id_fk = parseInt(q.branchId, 10) || 0;

    const employees = await this.prisma.employees.findMany({
      where: empWhere,
      select: {
        emp_code: true,
        employee: true,
        edara_n: true,
        qsm_n: true,
        phone: true,
      },
    });

    const results: Array<{
      empCode: number | null;
      empName: string;
      department?: string;
      section?: string;
      phone?: string;
      totalLate: number;
    }> = [];

    for (const emp of employees) {
      if (emp.emp_code == null) continue;

      const lateWhere: Prisma.tbl_hdoor_empsWhereInput = {
        member_code: emp.emp_code,
        late_min: { gt: 0 },
      };
      if (q.dateFrom && q.dateTo) {
        lateWhere.action_date = { gte: q.dateFrom.slice(0, 10), lte: q.dateTo.slice(0, 10) };
      }
      const lateRows = await this.prisma.tbl_hdoor_emps.findMany({
        where: lateWhere,
        select: { late_min: true, action_date: true },
      });

      let totalLate = 0;
      for (const r of lateRows) {
        totalLate += Math.trunc(r.late_min ?? 0);
      }

      if (totalLate > 0) {
        results.push({
          empCode: emp.emp_code,
          empName: emp.employee ?? '—',
          department: emp.edara_n ?? undefined,
          section: emp.qsm_n ?? undefined,
          phone: emp.phone ?? undefined,
          totalLate,
        });
      }
    }

    const totals = results.reduce(
      (acc, r) => {
        acc.total += r.totalLate;
        return acc;
      },
      { total: 0 },
    );

    const total = results.length;
    const data = results.slice(q.skip, q.skip + q.take);
    const page = paginated(data, total, q.page, q.pageSize);
    return { ...page, totals };
  }

  // -------------------------------------------------------------------------
  // LATE RECALC (best-effort — recompute late_min from current shift rules)
  // -------------------------------------------------------------------------
  /**
   * Recompute `late_min` for every checked-in punch in a date range using the
   * CURRENT shift windows + late rule. Reuses the exact check-in late logic
   * (buildShiftWindow + sumMinLate + applyLateRule) so a shift-rule change can
   * be applied retroactively. Rows without a hdoor_time are skipped (no punch).
   * Additive & guarded: only `late_min` is written; failures per row are counted
   * and never abort the batch.
   */
  async recalcLate(dateFrom: string, dateTo: string) {
    const from = (dateFrom ?? '').slice(0, 10);
    const to = (dateTo ?? '').slice(0, 10);
    if (!from || !to) throw new BadRequestException('نطاق التاريخ مطلوب');

    const rows = await this.prisma.tbl_hdoor_emps.findMany({
      where: {
        action_date: { gte: from, lte: to },
        hdoor_time: { not: null },
      },
    });

    const rules = await this.getRulesMap();

    // Cache resolved shift windows per employee's dwam to avoid re-querying.
    const dwamByEmp = new Map<number, Awaited<ReturnType<typeof this.prisma.hr_emp_dwam.findFirst>>>();
    const shiftById = new Map<number, Awaited<ReturnType<typeof this.prisma.tbl_hdodr_setting.findFirst>>>();

    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const r of rows) {
      try {
        if (!r.hdoor_time || r.member_id == null) {
          skipped++;
          continue;
        }

        let dwam = dwamByEmp.get(r.member_id);
        if (dwam === undefined) {
          dwam = await this.prisma.hr_emp_dwam.findFirst({ where: { emp_id: r.member_id } });
          dwamByEmp.set(r.member_id, dwam);
        }

        // Resolve shift window (same precedence as manualCheck): dwam-linked
        // tbl_hdodr_setting, else synthesize from hr_emp_dwam times.
        let shift: {
          hdoor_from_time: string | null;
          hdoor_to_time: string | null;
          hdoor_khasm_from: string | null;
          ensraf_from_time: string | null;
          ensraf_to_time: string | null;
          ensraf_khasm_from: string | null;
        } | null = null;

        if (dwam?.always_id_fk) {
          let s = shiftById.get(dwam.always_id_fk);
          if (s === undefined) {
            s = await this.prisma.tbl_hdodr_setting.findFirst({ where: { id: dwam.always_id_fk } });
            shiftById.set(dwam.always_id_fk, s);
          }
          shift = s;
        }
        if (!shift && dwam) {
          shift = {
            hdoor_from_time: dwam.start_enter || dwam.attend_time,
            hdoor_to_time: dwam.end_enter || dwam.attend_time,
            hdoor_khasm_from: dwam.attend_time,
            ensraf_from_time: dwam.start_out || dwam.leave_time,
            ensraf_to_time: dwam.end_out || dwam.leave_time,
            ensraf_khasm_from: dwam.leave_time,
          };
        }
        if (!shift) {
          skipped++;
          continue;
        }

        const win = buildShiftWindow(shift);
        const lateRaw = sumMinLate(formatMinutesAsTime(win.hdoorKhasm % 1440), r.hdoor_time);
        const lateMin = this.applyLateRule(lateRaw, rules);

        if (Math.round(r.late_min ?? 0) !== Math.round(lateMin)) {
          await this.prisma.tbl_hdoor_emps.update({
            where: { hodoor_id: r.hodoor_id },
            data: { late_min: lateMin },
          });
          updated++;
        }
      } catch {
        failed++;
      }
    }

    return { scanned: rows.length, updated, skipped, failed, dateFrom: from, dateTo: to };
  }
}
