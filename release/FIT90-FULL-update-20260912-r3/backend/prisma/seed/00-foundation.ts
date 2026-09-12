/* eslint-disable no-console */
/**
 * Foundation seed — shared entities everything else references.
 *  company/global settings, country/cities, branches, departments (hr_edarat_aqsam),
 *  job titles, banks, users (with bcrypt passwords), employees + their link rows.
 *
 * Login accounts created (password for ALL demo accounts = "fit90@123"):
 *   admin        -> level 1 (super admin, RBAC bypass)
 *   hr           -> level 1
 *   men.manager  -> level 3 (branch manager)
 *   women.manager-> level 3
 *   plus one user per seeded employee (username = phone) at level 2.
 */
import * as bcrypt from 'bcryptjs';
import type { BrCode } from '@prisma/client';
import {
  prisma, clearTables, log, randInt, pick, chance, round2,
  AR_MALE, AR_FEMALE, AR_FAMILY, fullNameMale, fullNameFemale, phone as randPhone,
  BASE, addDays, ymd, dmy, ymdhms,
} from './_shared';

export const DEMO_PASSWORD = 'fit90@123';

export async function seedFoundation(): Promise<void> {
  console.log('▶ Foundation…');

  // Clear (children first is irrelevant here since we FK-off truncate)
  await clearTables([
    'permissions', 'users',
    'employees_branches', 'hr_finance_employes', 'emp_files', 'employees_settings',
    'employees', 'department_job_relations', 'department_jobs', 'hr_edarat_aqsam',
    'departments', 'banks', 'banks_settings', 'branch_settings', 'store_branch_settings',
    'socity_branch', 'tbl_branches', 'cities', 'tbl_city', 'conf_country_setting',
    'all_defined_setting', 'conf_company_data', 'global_settings',
  ]);

  const pass = await bcrypt.hash(DEMO_PASSWORD, 10);

  // ---- global settings (singleton) ----
  await prisma.global_settings.create({
    data: {
      id: 1,
      institute_name: 'FIT90 GYM',
      institute_code: 'FIT90',
      use_barcode: 'yes',
      reg_prefix: 'FIT90',
      institute_email: '',
      address: '',
      mobileno: '',
      logo: null,
      currency: 'EGP',
      currency_symbol: 'ج.م',
      sms_service_provider: 'none',
      session_id: 1,
      translation: 'ar',
      footer_text: 'FIT90 GYM',
      animations: 'yes',
      timezone: 'Africa/Cairo',
      date_format: 'Y-m-d',
      facebook_url: '',
      twitter_url: '',
      linkedin_url: '',
      youtube_url: '',
      instagram_url: '',
      cms_default_branch: 1,
      updated_at: BASE,
      alert_days_contract: 30,
      alert_days_quest: 30,
    },
  });

  // ---- company / CMS singleton (company page) ----
  await prisma.conf_company_data.create({
    data: {
      nameweb: 'FIT90 GYM',
      abbreviation_name: 'FIT90',
      slogan: '',
      summary_company: '',
      email: '',
      address: '',
      telepon: '',
      hp: '',
      pesan_5: '',
      pesan_6: '',
      status_form_booking: 'Aktif',
      max_room_booking: 20,
      protocol: 'smtp',
      smtp_host: '',
      smtp_port: 587,
      smtp_timeout: 30,
      smtp_user: '',
      smtp_pass: '',
      id_user: 1,
      nama_direktur: '',
      jabatan: '',
    },
  });

  // ---- country / cities ----
  const egypt = await prisma.conf_country_setting.create({
    data: { name: 'مصر', from_id: 0, from_type: 'country', created: BASE },
  });
  const cityNames = ['القاهرة', 'الجيزة', 'الإسكندرية', 'المنصورة', 'طنطا', 'أسيوط', 'الإسماعيلية', 'بورسعيد'];
  for (const c of cityNames) {
    await prisma.conf_country_setting.create({
      data: { name: c, from_id: egypt.main_id, from_type: 'city', created: BASE },
    });
  }
  let order = 0;
  for (const c of cityNames) {
    await prisma.cities.create({ data: { name: c, from_id_fk: 0, in_order: String(order++) } });
    await prisma.tbl_city.create({ data: { city_name: c } });
  }
  log('foundation', `cities: ${cityNames.length}`);

  // ---- branches ----
  // PHAROS CLUB — two branches with codes A1 and B2 (per client spec).
  // Additional legacy branches kept for existing seed data compatibility.
  const branchDefs: Array<{ name: string; code: string }> = [
    { name: 'PHAROS CLUB - فرع A1', code: 'A1' },
    { name: 'PHAROS CLUB - فرع B2', code: 'B2' },
    { name: 'الفرع الرئيسي - مدينة نصر', code: 'A' },
    { name: 'فرع الرجال - المهندسين', code: 'B' },
    { name: 'فرع السيدات - المعادي', code: 'C' },
    { name: 'فرع حي الزمالك', code: 'D' },
    { name: 'فرع الإسكندرية - سموحة', code: 'E' },
  ];
  const branchIds: number[] = [];
  for (const def of branchDefs) {
    const b = await prisma.tbl_branches.create({ data: { branch_name: def.name, from_id: 0 } });
    branchIds.push(b.branch_id);
    await prisma.branch_settings.create({
      data: {
        title: def.name,
        from_id: 0,
        lat_map: String(round2(24.7 + randInt(0, 50) / 100)),
        long_map: String(round2(46.6 + randInt(0, 50) / 100)),
      },
    });
    const brCode: BrCode = def.code === 'A' || def.code === 'B' || def.code === 'C' ? (def.code as BrCode) : 'EMPTY';
    await prisma.store_branch_settings.create({
      data: { title: def.name.slice(0, 15), br_code: brCode, from_id: 0, lat_map: '24.7', long_map: '46.6' },
    });
  }
  await prisma.socity_branch.create({ data: { title: 'المقر الاجتماعي', lat_map: '30.06', long_map: '31.34' } });
  log('foundation', `branches: ${branchIds.length}`);

  // ---- departments (hr_edarat_aqsam is what the Org page reads) ----
  const depDefs = [
    { title: 'الإدارة العليا', from: 0 },
    { title: 'الموارد البشرية', from: 0 },
    { title: 'المالية والحسابات', from: 0 },
    { title: 'التشغيل والصالات', from: 0 },
    { title: 'المبيعات والاستقبال', from: 0 },
    { title: 'التدريب واللياقة', from: 0 },
    { title: 'المخازن والمشتريات', from: 0 },
    { title: 'الصيانة والمرافق', from: 0 },
  ];
  const depIds: number[] = [];
  let dcode = 100;
  for (let i = 0; i < depDefs.length; i++) {
    const d = await prisma.hr_edarat_aqsam.create({
      data: {
        title_id: 0,
        title_code: dcode,
        title: depDefs[i].title,
        from_id_fk: 0,
        trteeb: i + 1,
        from_code: dcode,
        to_code: dcode + 99,
      },
    });
    depIds.push(d.id);
    dcode += 100;
    // legacy departments table (a couple of sub rows for completeness)
    await prisma.departments.create({
      data: {
        main_dep_name: depDefs[i].title,
        main_dep_f_id: '0',
        sub_dep_name: depDefs[i].title,
        detail: depDefs[i].title,
        type: 1,
        suspend: 0,
        date: ymd(BASE),
        date_s: ymd(BASE),
        publisher: '1',
      },
    });
  }
  log('foundation', `departments: ${depIds.length}`);

  // ---- job titles (department_jobs) ----
  const jobDefs = [
    'مدير عام', 'مدير موارد بشرية', 'محاسب', 'أمين صندوق', 'موظف استقبال',
    'مدرب لياقة', 'مدربة لياقة', 'مشرف صالة', 'أخصائي تغذية', 'فني صيانة',
    'أمين مستودع', 'أخصائي مبيعات', 'منسق موارد بشرية', 'مسؤول تسويق',
  ];
  const jobIds: number[] = [];
  for (let i = 0; i < jobDefs.length; i++) {
    const j = await prisma.department_jobs.create({
      data: {
        name: jobDefs[i],
        from_id_fk: 0,
        status: 1,
        in_order: String(i + 1),
        dep_code: 100 + i,
        edara_id: depIds[i % depIds.length],
      },
    });
    jobIds.push(j.id);
    await prisma.department_job_relations.create({
      data: { edara_title: jobDefs[i], edara_id_fk: depIds[i % depIds.length] },
    });
  }
  log('foundation', `job titles: ${jobIds.length}`);

  // ---- banks ----
  const bankNames = ['البنك الأهلي المصري', 'بنك مصر', 'البنك التجاري الدولي (CIB)', 'بنك القاهرة', 'بنك الإسكندرية', 'QNB الأهلي'];
  for (const b of bankNames) {
    await prisma.banks.create({ data: { bank_name: b } });
    await prisma.banks_settings.create({
      data: {
        title: b,
        account_num: `${randInt(1000, 9999)}${randInt(100000, 999999)}`,
        ar_name: b,
        en_name: 'Bank',
        bank_code: String(randInt(10, 99)),
        account_num_length: '24',
      },
    });
  }
  log('foundation', `banks: ${bankNames.length}`);

  // ---- employees_settings (lookup categories used by employee form) ----
  const settingDefs: Array<{ title: string; type: number; type_name: string }> = [
    { title: 'دوام كامل', type: 1, type_name: 'نوع التعاقد' },
    { title: 'دوام جزئي', type: 1, type_name: 'نوع التعاقد' },
    { title: 'بكالوريوس', type: 2, type_name: 'المؤهل' },
    { title: 'دبلوم', type: 2, type_name: 'المؤهل' },
    { title: 'ثانوي', type: 2, type_name: 'المؤهل' },
    { title: 'أعزب', type: 3, type_name: 'الحالة الاجتماعية' },
    { title: 'متزوج', type: 3, type_name: 'الحالة الاجتماعية' },
  ];
  for (const s of settingDefs) {
    await prisma.employees_settings.create({ data: { title_setting: s.title, type: s.type, type_name: s.type_name } });
  }
  const definedDefs = [
    { title: 'مصري', type: 1, tn: 'الجنسية' },
    { title: 'سوداني', type: 1, tn: 'الجنسية' },
    { title: 'سوري', type: 1, tn: 'الجنسية' },
    { title: 'مسلم', type: 2, tn: 'الديانة' },
    // Payroll pay-components (settings/pay-components reads defined_type_title IN allowances/deduction)
    { title: 'بدل سكن', type: 1, tn: 'allowances' },
    { title: 'بدل نقل', type: 1, tn: 'allowances' },
    { title: 'بدل هاتف', type: 1, tn: 'allowances' },
    { title: 'بدل طبيعة عمل', type: 1, tn: 'allowances' },
    { title: 'حافز أداء', type: 1, tn: 'allowances' },
    { title: 'خصم تأمينات', type: 2, tn: 'deduction' },
    { title: 'خصم سلفة', type: 2, tn: 'deduction' },
    { title: 'خصم غياب', type: 2, tn: 'deduction' },
    { title: 'خصم تأخير', type: 2, tn: 'deduction' },
    { title: 'خصم جزاءات', type: 2, tn: 'deduction' },
  ];
  let dorder = 0;
  for (const d of definedDefs) {
    await prisma.all_defined_setting.create({
      data: { defined_title: d.title, defined_type: d.type, defined_type_title: d.tn, in_order: String(dorder++) },
    });
  }

  // ---- employees ----
  // Structured roster: managers + staff spread across branches; men (emp_type=1) & women (emp_type=2).
  const roster: Array<{ name: string; job: string; emp_type: number; branchIdx: number; salary: number }> = [];
  // Leadership
  roster.push({ name: fullNameMale(), job: 'مدير عام', emp_type: 1, branchIdx: 0, salary: 25000 });
  roster.push({ name: fullNameMale(), job: 'مدير موارد بشرية', emp_type: 1, branchIdx: 0, salary: 18000 });
  roster.push({ name: fullNameMale(), job: 'محاسب', emp_type: 1, branchIdx: 0, salary: 12000 });
  roster.push({ name: fullNameFemale(), job: 'منسق موارد بشرية', emp_type: 2, branchIdx: 2, salary: 9000 });
  // Branch staff
  const staffJobs = ['موظف استقبال', 'مدرب لياقة', 'مشرف صالة', 'أخصائي تغذية', 'فني صيانة', 'أمين مستودع', 'أخصائي مبيعات', 'أمين صندوق'];
  for (let i = 0; i < 32; i++) {
    const women = chance(0.4);
    roster.push({
      name: women ? fullNameFemale() : fullNameMale(),
      job: women ? pick(['مدربة لياقة', 'موظف استقبال', 'أخصائي تغذية', 'أخصائي مبيعات']) : pick(staffJobs),
      emp_type: women ? 2 : 1,
      branchIdx: randInt(0, branchIds.length - 1),
      salary: randInt(4000, 11000),
    });
  }

  const empRows: Array<{ id: number; emp_code: number }> = [];
  let empCode = 1001;
  for (let i = 0; i < roster.length; i++) {
    const r = roster[i];
    const hire = addDays(BASE, -randInt(120, 1400));
    const emp = await prisma.employees.create({
      data: {
        employee: r.name,
        emp_code: empCode,
        emp_code_g: empCode,
        branch_id_fk: branchIds[r.branchIdx],
        emp_type: r.emp_type,
        card_num: BigInt(700000000000 + empCode),
        demo_card: String(empCode),
        gender: r.emp_type === 2 ? 2 : 1,
        city_id_fk: 1,
        bank: randInt(1, bankNames.length),
        bank_num: `SA${randInt(10, 99)}${randInt(10000000, 99999999)}${randInt(1000, 9999)}`,
        status: 1,
        phone: randPhone(),
        another_phone: randPhone(),
        department: depDefs[r.branchIdx % depDefs.length].title,
        edara_id: depIds[r.branchIdx % depIds.length],
        edara_n: depDefs[r.branchIdx % depDefs.length].title,
        tamin_mosama_wazefy: r.job,
        degree_id: '1',
        contract: 'دوام كامل',
        birth_date: ymd(addDays(BASE, -randInt(7000, 15000))),
        birth_date_m: ymd(addDays(BASE, -randInt(7000, 15000))),
        email: `emp${empCode}@one80gym.test`,
        nationality: 'مصري',
        deyana: 'مسلم',
        marital_status: pick([1, 2]),
        employee_type: 1,
        leave_emp: 0,
        start_work_date_m: ymd(hire),
        basic_salary: r.salary,
        tamin_rateb: round2(r.salary * 0.9),
        tamin_rkm: 400000000 + empCode,
        khedma_year: randInt(0, 6),
        shahadt_jaish: 'no',
      } as any,
    });
    empRows.push({ id: emp.id, emp_code: empCode });

    // link + finance + a file per employee
    await prisma.employees_branches.create({
      data: { branch_id_fk: branchIds[r.branchIdx], emp_id_fk: emp.id, date: ymd(hire), publisher: 1 },
    });
    await prisma.hr_finance_employes.create({
      data: {
        emp_id: emp.id,
        emp_code: empCode,
        method_to_count: 1,
        badl_discount_id_fk: 0,
        value: r.salary,
        badl_type: 0,
        specific_period: '0',
        insurance_affect: 1,
        dalel_code: BigInt(0),
        dalel_name: 'الراتب الأساسي',
        having_all_value: r.salary as any,
        publisher: 1,
        publisher_name: 'النظام',
      },
    });
    if (chance(0.5)) {
      await prisma.emp_files.create({
        data: {
          emp_id: emp.id,
          emp_code: String(empCode),
          title: pick(['عقد العمل', 'صورة الهوية', 'الشهادة الدراسية', 'الرخصة المهنية']),
          emp_file: `uploads/emp/${empCode}-doc.pdf`,
          have_date: 1,
          from_date: ymd(hire),
          to_date: ymd(addDays(hire, 365)),
        },
      });
    }
    empCode++;
  }
  log('foundation', `employees: ${empRows.length}`);

  // ---- users ----
  // Named admin/manager accounts + linked employee accounts.
  const namedUsers: Array<{ username: string; name: string; level: number; empIdx: number; branchIdx: number }> = [
    { username: 'admin', name: 'مدير النظام', level: 1, empIdx: 0, branchIdx: 0 },
    { username: 'hrmanager', name: 'مدير الموارد البشرية', level: 1, empIdx: 1, branchIdx: 0 },
    { username: 'men.manager', name: 'مدير فرع الرجال', level: 3, empIdx: 2, branchIdx: 1 },
    { username: 'women.manager', name: 'مديرة فرع السيدات', level: 3, empIdx: 3, branchIdx: 2 },
  ];
  for (const u of namedUsers) {
    await prisma.users.create({
      data: {
        username: u.username,
        password: pass,
        name: u.name,
        email: `${u.username}@one80gym.test`,
        level: u.level,
        image: null,
        branch_id_fk: branchIds[u.branchIdx],
        emp_code: empRows[u.empIdx]?.emp_code ?? null,
        approved: 1,
        device_token: '',
      },
    });
  }
  // one login per remaining employee (level 2), username = phone-like unique
  let extra = 0;
  for (let i = 4; i < empRows.length; i++) {
    await prisma.users.create({
      data: {
        username: `emp${empRows[i].emp_code}`,
        password: pass,
        name: `موظف ${empRows[i].emp_code}`,
        email: `emp${empRows[i].emp_code}@one80gym.test`,
        level: 2,
        branch_id_fk: branchIds[randInt(0, branchIds.length - 1)],
        emp_code: empRows[i].emp_code,
        approved: 1,
        device_token: '',
      },
    });
    extra++;
  }
  log('foundation', `users: ${namedUsers.length + extra} (admin/hr/men.manager/women.manager + ${extra} staff)`);

  console.log('✔ Foundation done');
}
