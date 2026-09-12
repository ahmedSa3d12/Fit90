/* eslint-disable no-console */
/**
 * Module 10 — HR Attendance / Shifts.
 *
 * Seeds the attendance tables so the HR side of the app renders:
 *   Attendance board/devices/rules/settings + shifts + check-in records
 *
 * Foundation (branches/employees/users) is already seeded — reused via loaders.
 */
import {
  prisma, clearTables, log, reseed, randInt, chance,
  getBranchIds, getEmployees, getUsers,
  BASE, addDays, ymd, dmy, ymdhms,
} from './_shared';

export async function seedHrAttendance(): Promise<void> {
  console.log('▶ HrAttendance…');
  reseed(20260701);

  // Children first, parents after — only THIS module's tables.
  await clearTables([
    // attendance check-in / config
    'tbl_hdoor_emps_history', 'tbl_hdoor_emps',
    'hr_emp_dwam_details', 'hr_emp_dwam',
    'tbl_hdodr_status', 'tbl_hdodr_setting',
    'attendance_devices', 'attendance_rules', 'attendance_channels',
    'tbl_gym_setting',
  ]);

  const branches = await getBranchIds();
  const employees = await getEmployees(); // {id, emp_code, employee, branch_id_fk, emp_type, basic_salary, phone}
  const users = await getUsers();          // {user_id, emp_code, name, level, branch_id_fk}

  const hrUser = users.find((u) => u.level === 1) ?? users[0];
  const hrUserId = hrUser?.user_id ?? 1;
  const hrUserName = hrUser?.name ?? 'مدير الموارد البشرية';

  // Map emp_code -> its user_id (for approval routing)
  const userByEmpCode = new Map<number, number>();
  for (const u of users) if (u.emp_code != null) userByEmpCode.set(u.emp_code, u.user_id);

  const counts: Record<string, number> = {};
  const bump = (t: string, n = 1) => (counts[t] = (counts[t] ?? 0) + n);

  // =========================================================================
  //  A. ATTENDANCE CONFIG — rules, channels, devices, shifts, shift-status
  // =========================================================================
  const ruleDefs = [
    { key: 'late', enabled: 1, threshold: '15', grace_min: '10', multiplier: '1' },
    { key: 'early_leave', enabled: 1, threshold: '15', grace_min: '10', multiplier: '1' },
    { key: 'absence', enabled: 1, threshold: '1', grace_min: '0', multiplier: '2' },
    { key: 'overtime', enabled: 1, threshold: '30', grace_min: '0', multiplier: '1.5' },
    { key: 'weekly_rest', enabled: 1, threshold: '1', grace_min: '0', multiplier: '1' },
    { key: 'holidays', enabled: 1, threshold: '0', grace_min: '0', multiplier: '2' },
    { key: 'flexible_hours', enabled: 0, threshold: '60', grace_min: '30', multiplier: '1' },
  ];
  for (const r of ruleDefs) { await prisma.attendance_rules.create({ data: r }); bump('attendance_rules'); }

  const channelDefs = [
    { key: 'device', enabled: 1, label: 'جهاز البصمة' },
    { key: 'app', enabled: 1, label: 'تطبيق الجوال' },
    { key: 'gps', enabled: 1, label: 'الموقع الجغرافي' },
    { key: 'qr', enabled: 1, label: 'رمز QR' },
    { key: 'nfc', enabled: 0, label: 'البطاقة الذكية NFC' },
    { key: 'face', enabled: 1, label: 'بصمة الوجه' },
  ];
  for (const c of channelDefs) { await prisma.attendance_channels.create({ data: c }); bump('attendance_channels'); }

  for (let i = 0; i < branches.length + 2; i++) {
    const b = branches[i % branches.length];
    await prisma.attendance_devices.create({
      data: {
        title: `جهاز البصمة - ${i + 1}`,
        ip: `192.168.${10 + i}.${randInt(20, 200)}`,
        branch_id_fk: b,
        last_sync: ymdhms(addDays(BASE, -randInt(0, 2))),
        status: chance(0.8) ? 'online' : 'offline',
        created_at: ymdhms(addDays(BASE, -randInt(60, 400))),
        updated_at: ymdhms(addDays(BASE, -randInt(0, 3))),
      },
    });
    bump('attendance_devices');
  }

  // Shifts (tbl_hdodr_setting) + shift status (tbl_hdodr_status)
  const shiftDefs = [
    { title: 'الدوام الصباحي', hf: '08:00', ht: '09:00', kf: '09:15', ef: '16:00', ekf: '15:45', et: '17:00' },
    { title: 'الدوام المسائي', hf: '15:00', ht: '16:00', kf: '16:15', ef: '22:00', ekf: '21:45', et: '23:00' },
    { title: 'دوام السيدات', hf: '09:00', ht: '10:00', kf: '10:15', ef: '17:00', ekf: '16:45', et: '18:00' },
    { title: 'دوام مرن', hf: '07:00', ht: '11:00', kf: '11:15', ef: '15:00', ekf: '14:45', et: '19:00' },
  ];
  const shiftIds: number[] = [];
  for (const s of shiftDefs) {
    const row = await prisma.tbl_hdodr_setting.create({
      data: {
        title: s.title,
        hdoor_from_time: s.hf, hdoor_to_time: s.ht, hdoor_khasm_from: s.kf,
        ensraf_from_time: s.ef, ensraf_khasm_from: s.ekf, ensraf_to_time: s.et,
      },
    });
    shiftIds.push(row.id);
    bump('tbl_hdodr_setting');
  }
  for (const s of shiftDefs) {
    await prisma.tbl_hdodr_status.create({
      data: { title: s.title.slice(0, 10), active: 'yes', branche: 'all' },
    });
    bump('tbl_hdodr_status');
  }

  // gym settings (targets / classes) — tbl_gym_setting
  const gymTypes: Array<'target' | 'proten' | 'classes'> = ['target', 'proten', 'classes'];
  for (let i = 0; i < 6; i++) {
    const t = gymTypes[i % gymTypes.length];
    await prisma.tbl_gym_setting.create({
      data: {
        ttype: t,
        for_user: randInt(20, 60),
        for_gym: randInt(200, 600),
        date_ar: dmy(addDays(BASE, -randInt(10, 120))),
        date_s: ymd(addDays(BASE, -randInt(10, 120))),
        publisher: hrUserId,
        publisher_name: hrUserName,
      },
    });
    bump('tbl_gym_setting');
  }

  // =========================================================================
  //  B. EMPLOYEE SHIFT ASSIGNMENT (hr_emp_dwam + details)
  // =========================================================================
  const yearStart = new Date('2026-01-01T00:00:00Z');
  const fromEpoch = Math.floor(yearStart.getTime() / 1000);
  const toEpoch = Math.floor(new Date('2026-12-31T00:00:00Z').getTime() / 1000);

  for (let i = 0; i < employees.length; i++) {
    const e = employees[i];
    const shiftIdx = e.emp_type === 2 ? 2 : i % 2; // women -> ladies shift
    const dwamId = shiftIds[shiftIdx];
    const morning = shiftIdx !== 1;
    await prisma.hr_emp_dwam.create({
      data: {
        emp_id: e.id,
        emp_code: String(e.emp_code ?? ''),
        always_id_fk: 0,
        period_id_fk: dwamId,
        attend_time: morning ? '08:00' : '15:00',
        leave_time: morning ? '16:00' : '22:00',
        start_enter: morning ? '07:30' : '14:30',
        end_enter: morning ? '09:00' : '16:00',
        start_out: morning ? '15:30' : '21:30',
        end_out: morning ? '17:00' : '23:00',
        from_date: fromEpoch,
        from_date_ar: dmy(yearStart),
        to_date: toEpoch,
        to_date_ar: dmy(new Date('2026-12-31T00:00:00Z')),
        saturday: 1, sunday: 1, monday: 1, tuesday: 1, wednesday: 1, thursday: 1, friday: 0,
      },
    });
    bump('hr_emp_dwam');

    await prisma.hr_emp_dwam_details.create({
      data: {
        emp_id: e.id,
        emp_code: String(e.emp_code ?? '0'),
        num_in_device: String(1000 + i),
        device_id_fk: String(randInt(1, branches.length + 2)),
        period_id_fk: String(dwamId),
        from_day: 'السبت',
        to_day: 'الخميس',
        no3_dawam: e.emp_type === 2 && chance(0.3) ? 'half' : 'full',
      },
    });
    bump('hr_emp_dwam_details');
  }

  // =========================================================================
  //  C. ATTENDANCE CHECK-IN RECORDS (tbl_hdoor_emps + history)
  //     — cover today (BASE) + prior days for the board & reports
  // =========================================================================
  // Work backwards from BASE over ~20 working days; today first so board shows current.
  const attendanceDays: Date[] = [];
  {
    let d = new Date(BASE);
    while (attendanceDays.length < 22) {
      const dow = d.getUTCDay(); // 5 = Friday off
      if (dow !== 5) attendanceDays.push(new Date(d));
      d = addDays(d, -1);
    }
  }

  for (const day of attendanceDays) {
    const iso = ymd(day);           // 'YYYY-MM-DD' used by action_date / action_date_s range filters
    const month = day.getUTCMonth() + 1;
    const year = day.getUTCFullYear();
    // ~85% of employees checked in each day
    for (const e of employees) {
      if (!chance(0.85)) continue;
      const morning = (e.emp_type === 2) || chance(0.6);
      const dwamHdoor = morning ? '08:00' : '15:00';
      const dwamEnsraf = morning ? '16:00' : '22:00';
      const lateMin = chance(0.25) ? randInt(3, 45) : 0;
      const earlyMin = chance(0.15) ? randInt(3, 30) : 0;
      const hh = morning ? 8 : 15;
      const mm = lateMin;
      const hdoorTime = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      const outH = morning ? 16 : 22;
      const ensrafTime = `${String(outH).padStart(2, '0')}:${String(60 - (earlyMin || 0)).padStart(2, '0')}`.replace(':60', ':00');
      const branch = e.branch_id_fk ?? branches[0];
      const dwamId = e.emp_type === 2 ? shiftIds[2] : shiftIds[0];

      await prisma.tbl_hdoor_emps.create({
        data: {
          member_code: e.emp_code ?? 0,
          member_id: e.id,
          action_date: iso,
          action_date_s: iso,
          hdoor_time: hdoorTime,
          dwam_hdoor_time: dwamHdoor,
          late_min: lateMin,
          ensraf_time: ensrafTime,
          dwam_ensraf_time: dwamEnsraf,
          mobaker_min: earlyMin,
          hdoor_user_id: userByEmpCode.get(e.emp_code ?? -1) ?? hrUserId,
          ensraf_user_id: userByEmpCode.get(e.emp_code ?? -1) ?? hrUserId,
          ttype: 'hdoor',
          action_time: hdoorTime,
          num_min: 0,
          tasgel_type: chance(0.7) ? 'automatic' : 'manual',
          for_month: month,
          for_year: year,
          mobker_hdor: 0,
          sheft_type: 1,
          branch_id_fk: branch,
          dwam_id_fk: dwamId,
        },
      });
      bump('tbl_hdoor_emps');

      // history: a hdoor + ensraf pair for the same record (a few, not all)
      if (chance(0.35)) {
        await prisma.tbl_hdoor_emps_history.create({
          data: {
            member_code: e.emp_code ?? 0, member_id: e.id,
            action_date: iso, action_date_s: iso,
            hdoor_ensraf_time: hdoorTime, dwam_hdoor_time: dwamHdoor,
            setting_time: dwamHdoor, ttype: 'hdoor', action_time: hdoorTime,
          },
        });
        bump('tbl_hdoor_emps_history');
      }
    }
  }

  // ---- report ----
  const summary = Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([t, n]) => `${t}=${n}`)
    .join(', ');
  log('hr-attendance', summary);
  console.log('✔ HrAttendance done');
}

// self-run for standalone testing
if (require.main === module) {
  seedHrAttendance()
    .then(() => prisma.$disconnect())
    .then(() => process.exit(0))
    .catch((e) => { console.error(e); process.exit(1); });
}
