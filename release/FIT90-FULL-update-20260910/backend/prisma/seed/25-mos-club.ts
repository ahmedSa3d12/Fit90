/* eslint-disable no-console */
/**
 * MOS (Member Operations System) demo seed — fills EVERY MOS screen with
 * realistic, idempotent data so the module never shows an empty state.
 *
 * Runs AFTER 20-club.ts so it can reuse the members / trainers / branches /
 * employees that seed created (loaded from the DB — never invents FK ids).
 *
 * Covers:
 *  - club_lookups (all 24 ClubLookupCategory values)
 *  - club_leads (potential members)               - club_calls
 *  - club_tickets (complaints / requests / feedbacks)
 *  - club_invitations                             - club_free_benefits
 *  - club_financial_entries (all 7 entry types across ~90 days)
 *  - club_commission_rules (sales + trainer + package rules with config JSON)
 *  - club_content_items (announcements / faqs / exercises / gym-rules /
 *      gym-images / schedule-images / transformation-images / app-home / notif)
 *  - club_approval_items      - club_reminders        - club_machines
 *  - club_machine_maintenance - club_workouts         - club_training_notes
 *  - club_branch_visits       - club_one_pass_sessions
 *  - club_shifts              - club_class_rooms       - club_employee_requests
 *  - club_closing_transactions
 */
import {
  prisma, clearTables, log, reseed, randInt, pick, pickN, chance, round2,
  getBranchIds, getEmployees,
  BASE, addDays, ymd,
  fullNameMale, fullNameFemale, phone,
} from './_shared';
import { ClubLookupCategory, ClubFinancialType } from '@prisma/client';

// local numeric helper (mirrors 20-club.ts convention)
function rnd01(): number {
  return randInt(0, 1_000_000) / 1_000_000;
}

export async function seedMosClub(): Promise<void> {
  console.log('▶ MOS club…');
  reseed(246813579);

  // Clear ONLY the MOS-owned tables (children first). Idempotent re-runs.
  await clearTables([
    'club_machine_maintenance',
    'club_machines',
    'club_lookups',
    'club_leads',
    'club_calls',
    'club_invitations',
    'club_tickets',
    'club_financial_entries',
    'club_content_items',
    'club_commission_rules',
    'club_free_benefits',
    'club_approval_items',
    'club_reminders',
    'club_workouts',
    'club_training_notes',
    'club_branch_visits',
    'club_one_pass_sessions',
    'club_shifts',
    'club_class_rooms',
    'club_employee_requests',
    'club_closing_transactions',
  ]);

  // ---- context loaded from prior seeds (real FK ids only) ----
  const branchIds = await getBranchIds();
  const branchId = branchIds[0] ?? 1;
  const B = (i: number) => branchIds[i % branchIds.length];

  const employees = await getEmployees();
  const empIds = employees.map((e) => e.id);
  const empPick = () => (empIds.length ? pick(empIds) : null);
  const empName = (id: number | null) =>
    employees.find((e) => e.id === id)?.employee ?? fullNameMale();

  const members = await prisma.club_members.findMany({
    where: { is_deleted: false },
    select: { id: true, name: true, phone: true, branch_id: true },
    orderBy: { id: 'asc' },
  });
  const trainers = await prisma.club_trainers.findMany({
    where: { is_deleted: false },
    select: { id: true, name: true },
    orderBy: { id: 'asc' },
  });
  const trainerName = () => (trainers.length ? pick(trainers).name : fullNameMale());

  // ===================================================================
  // 1. LOOKUPS — every ClubLookupCategory value populated
  // ===================================================================
  const lookupDefs: Array<{ category: keyof typeof ClubLookupCategory; names: Array<[string, string]> }> = [
    { category: 'class_genre', names: [['يوغا', 'Yoga'], ['هيت', 'HIIT'], ['سبينينج', 'Spinning'], ['زومبا', 'Zumba'], ['كروس فيت', 'CrossFit']] },
    { category: 'class_program', names: [['برنامج المبتدئين', 'Beginner'], ['برنامج متوسط', 'Intermediate'], ['برنامج متقدم', 'Advanced'], ['برنامج السيدات', 'Ladies']] },
    { category: 'class_type', names: [['جماعية', 'Group'], ['خاصة', 'Private'], ['شبه خاصة', 'Semi-private'], ['أونلاين', 'Online']] },
    { category: 'gym_section', names: [['كارديو', 'Cardio'], ['أوزان حرة', 'Free weights'], ['وظيفي', 'Functional'], ['كروس فيت', 'CrossFit'], ['استوديو', 'Studio']] },
    { category: 'expense_type', names: [['مرافق', 'Utilities'], ['صيانة', 'Maintenance'], ['مستلزمات', 'Supplies'], ['تسويق', 'Marketing'], ['إيجار', 'Rent'], ['رواتب', 'Payroll']] },
    { category: 'owner', names: [['المالك الرئيسي', 'Primary owner'], ['شريك 1', 'Partner 1'], ['شريك 2', 'Partner 2']] },
    { category: 'nationality', names: [['مصري', 'Egyptian'], ['سوري', 'Syrian'], ['سوداني', 'Sudanese'], ['أردني', 'Jordanian'], ['يمني', 'Yemeni'], ['هندي', 'Indian']] },
    { category: 'region', names: [['القاهرة', 'Cairo'], ['الجيزة', 'Giza'], ['الإسكندرية', 'Alexandria'], ['المنصورة', 'Mansoura'], ['أسيوط', 'Asyut']] },
    { category: 'visa_type', names: [['إقامة عمل', 'Work permit'], ['زيارة', 'Visit'], ['مواطن', 'Citizen'], ['مقيم دائم', 'Permanent resident']] },
    { category: 'job_title', names: [['موظف استقبال', 'Receptionist'], ['مدرب', 'Trainer'], ['مدير فرع', 'Branch manager'], ['مبيعات', 'Sales'], ['محاسب', 'Accountant']] },
    { category: 'call_feedback', names: [['مهتم', 'Interested'], ['معاودة اتصال', 'Callback'], ['غير مهتم', 'Not interested'], ['لا يرد', 'No answer'], ['تم التحويل', 'Converted']] },
    { category: 'class_cancel_reason', names: [['عدد غير كافٍ', 'Low attendance'], ['غياب المدرب', 'Trainer absent'], ['صيانة القاعة', 'Room maintenance'], ['ظروف طارئة', 'Emergency']] },
    { category: 'membership_cancel_reason', names: [['ظروف صحية', 'Health'], ['السفر', 'Relocation'], ['السعر', 'Price'], ['عدم الالتزام', 'No commitment'], ['خدمة العملاء', 'Service']] },
    { category: 'gym_location', names: [['الطابق الأرضي', 'Ground floor'], ['الطابق الأول', 'First floor'], ['قسم السيدات', 'Ladies section'], ['المسبح', 'Pool area']] },
    { category: 'lost_category', names: [['السعر مرتفع', 'Price too high'], ['المسافة', 'Distance'], ['منافس', 'Competitor'], ['بدون سبب', 'No reason'], ['المرافق', 'Facilities']] },
    { category: 'machine_model', names: [['Life Fitness', 'Life Fitness'], ['Technogym', 'Technogym'], ['Precor', 'Precor'], ['Matrix', 'Matrix'], ['Hammer Strength', 'Hammer Strength']] },
    { category: 'package_type', names: [['gym', 'Gym'], ['شهري', 'Monthly'], ['ربع سنوي', 'Quarterly'], ['نصف سنوي', 'Half-year'], ['سنوي', 'Annual'], ['حصص خاصة', 'PT sessions']] },
    { category: 'member_level', names: [['برونزي', 'Bronze'], ['فضي', 'Silver'], ['ذهبي', 'Gold'], ['بلاتيني', 'Platinum'], ['VIP', 'VIP']] },
    { category: 'suit_size', names: [['S', 'S'], ['M', 'M'], ['L', 'L'], ['XL', 'XL'], ['XXL', 'XXL']] },
    { category: 'member_goal', names: [['فقدان الوزن', 'Weight loss'], ['بناء العضلات', 'Muscle gain'], ['اللياقة العامة', 'General fitness'], ['التأهيل', 'Rehab'], ['المرونة', 'Flexibility']] },
    { category: 'session_type', names: [['تدريب شخصي', 'Personal training'], ['تقييم إن بودي', 'InBody'], ['تغذية', 'Nutrition'], ['تقييم مبدئي', 'Assessment']] },
    { category: 'workout_type', names: [['قوة', 'Strength'], ['كارديو', 'Cardio'], ['مرونة', 'Flexibility'], ['وظيفي', 'Functional'], ['هيت', 'HIIT']] },
    { category: 'maintenance_type', names: [['وقائية', 'Preventive'], ['إصلاح', 'Repair'], ['فحص', 'Inspection'], ['قطع غيار', 'Parts replacement']] },
    { category: 'reservation_type', names: [['حصة', 'Class'], ['مدرب خاص', 'Personal trainer'], ['سبا', 'Spa'], ['إن بودي', 'InBody']] },
    { category: 'interest_percentage', names: [['مهتم جداً 90%', 'Very high 90%'], ['مهتم 70%', 'High 70%'], ['متوسط 50%', 'Medium 50%'], ['منخفض 25%', 'Low 25%']] },
  ];

  let lookupCount = 0;
  for (const g of lookupDefs) {
    for (let i = 0; i < g.names.length; i++) {
      const [name, name_en] = g.names[i];
      await prisma.club_lookups.create({
        data: {
          category: g.category as ClubLookupCategory,
          name,
          name_en,
          code: `${g.category}_${i + 1}`,
          sort_order: i + 1,
          is_active: true,
        },
      });
      lookupCount++;
    }
  }

  // ===================================================================
  // 2. LEADS (potential members) — spread across statuses
  // ===================================================================
  const leadStatuses = ['new', 'new', 'contacted', 'contacted', 'converted', 'lost'];
  const leadSources = ['Instagram', 'Facebook', 'Walk-in', 'صديق', 'Google', 'إعلان'];
  const leadGoals = ['فقدان الوزن', 'بناء العضلات', 'اللياقة العامة', 'التأهيل'];
  let leadCount = 0;
  for (let i = 0; i < 15; i++) {
    const male = chance(0.6);
    const status = pick(leadStatuses);
    await prisma.club_leads.create({
      data: {
        name: male ? fullNameMale() : fullNameFemale(),
        phone: phone(),
        email: chance(0.5) ? `lead${1000 + i}@fit90gym.test` : null,
        gender: male ? 'male' : 'female',
        branch_id: B(i),
        status,
        notes: `مصدر: ${pick(leadSources)} — هدف: ${pick(leadGoals)}`,
        follow_up_at: status === 'converted' || status === 'lost' ? null : ymd(addDays(BASE, randInt(1, 14))),
        assigned_to: empPick(),
      },
    });
    leadCount++;
  }

  // ===================================================================
  // 3. CALLS — linked to members / leads with outcomes + dates
  // ===================================================================
  const callSubjects = ['متابعة تجديد الاشتراك', 'مكالمة ترحيبية', 'استفسار عن الباقات', 'متابعة عضو منقطع', 'تأكيد حجز حصة', 'شكوى ومتابعة', 'دعوة لعرض خاص'];
  const callOutcomes = ['مهتم', 'معاودة اتصال', 'غير مهتم', 'لا يرد', 'تم التجديد', 'تم الحجز'];
  let callCount = 0;
  for (let i = 0; i < 20; i++) {
    const useMember = members.length > 0 && chance(0.65);
    const m = useMember ? pick(members) : null;
    await prisma.club_calls.create({
      data: {
        member_id: m?.id ?? null,
        member_name: m ? m.name : (chance(0.5) ? fullNameMale() : fullNameFemale()),
        phone: m?.phone ?? phone(),
        call_date: ymd(addDays(BASE, -randInt(0, 45))),
        call_time: `${String(randInt(9, 20)).padStart(2, '0')}:${String(randInt(0, 59)).padStart(2, '0')}:00`,
        subject: pick(callSubjects),
        notes: chance(0.5) ? 'تمت المتابعة بنجاح' : null,
        outcome: pick(callOutcomes),
        staff_name: empName(empPick()),
        branch_id: m?.branch_id ?? B(i),
      },
    });
    callCount++;
  }

  // ===================================================================
  // 4. TICKETS — complaints / requests / feedbacks
  // ===================================================================
  const ticketDefs: Array<{ type: 'complaint' | 'request' | 'feedback'; subjects: string[] }> = [
    { type: 'complaint', subjects: ['تكييف القاعة ضعيف', 'ازدحام في وقت الذروة', 'جهاز معطل', 'نظافة دورات المياه', 'صوت الموسيقى مرتفع'] },
    { type: 'request', subjects: ['طلب تجميد الاشتراك', 'طلب تغيير المدرب', 'طلب فاتورة ضريبية', 'طلب إضافة حصة سباحة', 'طلب موعد إن بودي'] },
    { type: 'feedback', subjects: ['شكر لطاقم الاستقبال', 'اقتراح إضافة حصص مسائية', 'ملاحظة على جدول الحصص', 'إشادة بالمدرب', 'اقتراح عرض عائلي'] },
  ];
  const ticketStatuses = ['open', 'in_progress', 'resolved', 'closed'];
  const priorities = ['low', 'normal', 'high', 'urgent'];
  let ticketCount = 0;
  for (const def of ticketDefs) {
    for (let i = 0; i < 10; i++) {
      const m = members.length > 0 && chance(0.8) ? pick(members) : null;
      await prisma.club_tickets.create({
        data: {
          ticket_type: def.type,
          member_id: m?.id ?? null,
          member_name: m ? m.name : (chance(0.5) ? fullNameMale() : fullNameFemale()),
          subject: pick(def.subjects),
          body: def.type === 'complaint' ? 'يرجى مراجعة الأمر في أقرب وقت.' : def.type === 'request' ? 'برجاء التنفيذ حسب الإجراءات.' : 'شكراً لملاحظاتكم القيّمة.',
          status: pick(ticketStatuses),
          priority: def.type === 'complaint' ? pick(priorities) : 'normal',
          branch_id: m?.branch_id ?? B(i),
          staff_name: empName(empPick()),
        },
      });
      ticketCount++;
    }
  }

  // ===================================================================
  // 5. INVITATIONS (guest visits)
  // ===================================================================
  const invStatuses = ['sent', 'sent', 'confirmed', 'visited', 'expired'];
  let invCount = 0;
  for (let i = 0; i < 12; i++) {
    const inviter = members.length > 0 ? pick(members) : null;
    const male = chance(0.5);
    await prisma.club_invitations.create({
      data: {
        invitee_name: male ? fullNameMale() : fullNameFemale(),
        invitee_phone: phone(),
        invitee_gender: male ? 'male' : 'female',
        invited_by_id: inviter?.id ?? null,
        invited_by_name: inviter?.name ?? empName(empPick()),
        visit_date: ymd(addDays(BASE, randInt(-10, 14))),
        status: pick(invStatuses),
        branch_id: inviter?.branch_id ?? B(i),
        notes: chance(0.4) ? 'دعوة يوم مجاني' : null,
      },
    });
    invCount++;
  }

  // ===================================================================
  // 6. FREE BENEFITS
  // ===================================================================
  const benefitNames = ['حصة تدريب شخصي مجانية', 'تقييم إن بودي مجاني', 'زجاجة مكملات', 'قميص النادي', 'جلسة ساونا', 'أسبوع تجميد مجاني'];
  let benefitCount = 0;
  for (let i = 0; i < 12; i++) {
    const m = members.length > 0 ? pick(members) : null;
    await prisma.club_free_benefits.create({
      data: {
        member_id: m?.id ?? null,
        member_name: m?.name ?? fullNameMale(),
        benefit_name: pick(benefitNames),
        benefit_date: ymd(addDays(BASE, -randInt(0, 60))),
        quantity: pick([1, 1, 1, 2]),
        branch_id: m?.branch_id ?? B(i),
        notes: chance(0.3) ? 'ضمن عرض التجديد' : null,
      },
    });
    benefitCount++;
  }

  // ===================================================================
  // 7. FINANCIAL ENTRIES — all 7 types across ~90 days (reports data)
  // ===================================================================
  const finDefs: Array<{ type: keyof typeof ClubFinancialType; count: number; titles: string[]; min: number; max: number; withEmp: boolean }> = [
    { type: 'expense', count: 12, titles: ['فاتورة كهرباء', 'فاتورة مياه', 'مستلزمات نظافة', 'صيانة أجهزة', 'حملة تسويق', 'إيجار الفرع', 'مستلزمات مكتبية'], min: 200, max: 6000, withEmp: false },
    { type: 'other_revenue', count: 8, titles: ['بيع مكملات', 'بيع ملابس رياضية', 'رسوم إن بودي', 'إيراد كافيتيريا', 'بيع بطاقات هدايا'], min: 150, max: 2500, withEmp: false },
    { type: 'employee_commission', count: 6, titles: ['عمولة مبيعات اشتراكات', 'عمولة حصص خاصة', 'عمولة تجديدات'], min: 300, max: 3000, withEmp: true },
    { type: 'deduction', count: 2, titles: ['خصم تأخير', 'خصم غياب'], min: 100, max: 500, withEmp: true },
    { type: 'advance', count: 2, titles: ['سلفة راتب', 'سلفة طارئة'], min: 500, max: 3000, withEmp: true },
    { type: 'bonus', count: 2, titles: ['مكافأة أداء', 'مكافأة تحقيق الهدف'], min: 400, max: 2000, withEmp: true },
    { type: 'salary', count: 3, titles: ['راتب شهري', 'راتب + بدلات'], min: 3000, max: 9000, withEmp: true },
  ];
  const payMethods = ['cash', 'card', 'bank', 'online'];
  let finCount = 0;
  for (const def of finDefs) {
    for (let i = 0; i < def.count; i++) {
      const emp = def.withEmp ? empPick() : null;
      await prisma.club_financial_entries.create({
        data: {
          entry_type: def.type as ClubFinancialType,
          title: pick(def.titles),
          amount: round2(randInt(def.min, def.max) + rnd01()),
          entry_date: ymd(addDays(BASE, -randInt(0, 90))),
          employee_id: emp,
          employee_name: emp ? empName(emp) : null,
          branch_id: B(i),
          payment_method: pick(payMethods),
          notes: chance(0.25) ? 'مُراجعة ومعتمدة' : null,
          status: 'posted',
        },
      });
      finCount++;
    }
  }

  // ===================================================================
  // 8. COMMISSION RULES — sales + trainer + package with config JSON
  // ===================================================================
  const commissionRules: Array<{ kind: any; name: string; config: any }> = [
    { kind: 'sales_range', name: 'شرائح عمولة المبيعات', config: { ranges: [{ from: 0, to: 20000, percent: 3 }, { from: 20001, to: 50000, percent: 5 }, { from: 50001, to: null, percent: 7 }] } },
    { kind: 'sales_percentage', name: 'نسبة المبيعات الثابتة', config: { percent: 4, appliesTo: 'net_sales' } },
    { kind: 'sales_target', name: 'هدف مبيعات شهري', config: { target: 60000, bonus: 1500, period: 'monthly' } },
    { kind: 'trainer_range', name: 'شرائح عمولة المدربين', config: { ranges: [{ from: 0, to: 10, percent: 10 }, { from: 11, to: 25, percent: 15 }, { from: 26, to: null, percent: 20 }] } },
    { kind: 'trainer_percentage', name: 'نسبة المدرب من الحصص', config: { percent: 12, appliesTo: 'pt_sessions' } },
    { kind: 'trainer_target', name: 'هدف حصص المدرب', config: { target: 40, bonus: 800, period: 'monthly' } },
    { kind: 'instructor_class_rate', name: 'أجر الحصة للمدرب', config: { perClass: 120, groupBonus: 30 } },
    { kind: 'package_commission', name: 'عمولة الباقات السنوية', config: { packages: [{ name: 'سنوي VIP', amount: 250 }, { name: 'نصف سنوي', amount: 120 }] } },
  ];
  let commissionCount = 0;
  for (const r of commissionRules) {
    await prisma.club_commission_rules.create({
      data: { kind: r.kind, name: r.name, config: r.config, branch_id: branchId, is_active: true },
    });
    commissionCount++;
  }

  // ===================================================================
  // 9. CONTENT ITEMS — announcements / faqs / exercises / rules / images…
  // ===================================================================
  const contentDefs: Array<{ type: any; items: Array<{ title: string; body?: string; imageUrl?: string }> }> = [
    {
      type: 'announcement',
      items: [
        { title: 'افتتاح قسم الكروس فيت الجديد', body: 'يسر النادي الإعلان عن افتتاح قسم الكروس فيت المجهز بأحدث الأجهزة.' },
        { title: 'عرض الصيف: خصم 20% على السنوي', body: 'استمتع بخصم 20% على الاشتراك السنوي حتى نهاية الشهر.' },
        { title: 'جدول حصص رمضان', body: 'تم تحديث جدول الحصص ليتناسب مع أوقات الشهر الكريم.' },
        { title: 'صيانة المسبح', body: 'سيتم إغلاق المسبح للصيانة الدورية يوم الجمعة.' },
      ],
    },
    {
      type: 'faq',
      items: [
        { title: 'كيف يمكنني تجميد اشتراكي؟', body: 'يمكنك طلب التجميد من خلال الاستقبال أو التطبيق، بحد أقصى 14 يوماً للباقات السنوية.' },
        { title: 'ما هي مواعيد قسم السيدات؟', body: 'قسم السيدات مفتوح يومياً من 8 صباحاً حتى 10 مساءً.' },
        { title: 'هل تتوفر حصص تدريب شخصي؟', body: 'نعم، تتوفر باقات حصص تدريب شخصي مع مدربين معتمدين.' },
        { title: 'كيف أحجز موعد إن بودي؟', body: 'عبر التطبيق أو الاستقبال، والخدمة مجانية للأعضاء الجدد.' },
      ],
    },
    {
      type: 'exercise',
      items: [
        { title: 'تمرين السكوات', body: 'تمرين أساسي لعضلات الأرجل، 4 مجموعات × 12 تكرار.' },
        { title: 'تمرين الضغط', body: 'لتقوية الصدر والكتف، 3 مجموعات حتى الإجهاد.' },
        { title: 'العقلة', body: 'لعضلات الظهر والذراعين، 3 مجموعات × 8 تكرار.' },
        { title: 'الرفعة الميتة', body: 'تمرين مركّب لكامل الجسم، ركّز على وضعية الظهر.' },
      ],
    },
    {
      type: 'gym_rule',
      items: [
        { title: 'إرجاع الأوزان بعد الاستخدام', body: 'الرجاء إعادة الأوزان إلى أماكنها احتراماً للأعضاء.' },
        { title: 'استخدام المناشف على الأجهزة', body: 'يجب وضع منشفة على الجهاز أثناء الاستخدام.' },
        { title: 'الالتزام بالزي الرياضي', body: 'يُشترط ارتداء الزي الرياضي والحذاء المناسب.' },
        { title: 'منع التصوير في القاعات', body: 'يمنع التصوير حفاظاً على خصوصية الأعضاء.' },
      ],
    },
    {
      type: 'gym_image',
      items: [
        { title: 'قاعة الأوزان الحرة', imageUrl: 'https://cdn.fit90gym.test/gym/free-weights.jpg' },
        { title: 'منطقة الكارديو', imageUrl: 'https://cdn.fit90gym.test/gym/cardio.jpg' },
        { title: 'استوديو الحصص الجماعية', imageUrl: 'https://cdn.fit90gym.test/gym/studio.jpg' },
        { title: 'قسم السيدات', imageUrl: 'https://cdn.fit90gym.test/gym/ladies.jpg' },
      ],
    },
    {
      type: 'schedule_image',
      items: [
        { title: 'جدول حصص الأسبوع', imageUrl: 'https://cdn.fit90gym.test/schedule/weekly.jpg' },
        { title: 'جدول حصص السيدات', imageUrl: 'https://cdn.fit90gym.test/schedule/ladies.jpg' },
      ],
    },
    {
      type: 'transformation_image',
      items: [
        { title: 'تحول أحمد — 12 أسبوع', imageUrl: 'https://cdn.fit90gym.test/trans/ahmed.jpg' },
        { title: 'تحول سارة — 16 أسبوع', imageUrl: 'https://cdn.fit90gym.test/trans/sara.jpg' },
        { title: 'تحول خالد — 8 أسابيع', imageUrl: 'https://cdn.fit90gym.test/trans/khaled.jpg' },
      ],
    },
    {
      type: 'app_home_section',
      items: [
        { title: 'العروض المميزة', body: 'قسم يعرض أحدث العروض في الصفحة الرئيسية.' },
        { title: 'حصصك القادمة', body: 'يعرض للعضو حصصه المحجوزة.' },
        { title: 'نصيحة اليوم', body: 'نصائح لياقة وتغذية يومية.' },
      ],
    },
    {
      type: 'notification_template',
      items: [
        { title: 'قرب انتهاء الاشتراك', body: 'عزيزنا العضو، يتبقى على انتهاء اشتراكك 3 أيام. جدّد الآن.' },
        { title: 'تذكير بالحصة', body: 'لديك حصة {className} غداً الساعة {time}.' },
        { title: 'ترحيب بالعضو الجديد', body: 'أهلاً بك في نادينا! نتمنى لك رحلة لياقة موفقة.' },
      ],
    },
  ];
  let contentCount = 0;
  for (const def of contentDefs) {
    for (let i = 0; i < def.items.length; i++) {
      const it = def.items[i];
      await prisma.club_content_items.create({
        data: {
          content_type: def.type,
          title: it.title,
          body: it.body ?? null,
          image_url: it.imageUrl ?? null,
          sort_order: i + 1,
          is_active: true,
          branch_id: chance(0.5) ? branchId : null,
        },
      });
      contentCount++;
    }
  }

  // ===================================================================
  // 10. APPROVAL ITEMS (approve / decline queue)
  // ===================================================================
  const approvalDefs = [
    { entity_type: 'refund', title: 'طلب استرداد اشتراك', description: 'استرداد قيمة الأيام المتبقية لعضو منقطع.' },
    { entity_type: 'discount', title: 'خصم استثنائي 15%', description: 'خصم للموظفين على الباقة السنوية.' },
    { entity_type: 'freeze', title: 'تجميد اشتراك 30 يوماً', description: 'تجميد لظروف سفر.' },
    { entity_type: 'expense', title: 'اعتماد مصروف صيانة', description: 'صيانة أجهزة الكارديو.' },
    { entity_type: 'transfer', title: 'نقل اشتراك لفرع آخر', description: 'نقل العضوية للفرع الرئيسي.' },
    { entity_type: 'lead', title: 'اعتماد عرض خاص لعميل محتمل', description: 'عرض ترويجي لإتمام التحويل.' },
  ];
  const approvalStatuses = ['pending', 'pending', 'approved', 'declined'] as const;
  let approvalCount = 0;
  for (let i = 0; i < approvalDefs.length; i++) {
    const d = approvalDefs[i];
    const status = pick([...approvalStatuses]);
    await prisma.club_approval_items.create({
      data: {
        entity_type: d.entity_type,
        entity_id: randInt(1, 50),
        title: d.title,
        description: d.description,
        status,
        requested_by: empName(empPick()),
        reviewed_by: status === 'pending' ? null : empName(empPick()),
        reviewed_at: status === 'pending' ? null : addDays(BASE, -randInt(1, 10)),
        branch_id: B(i),
        metadata: { amount: randInt(200, 3000) },
      },
    });
    approvalCount++;
  }

  // ===================================================================
  // 11. REMINDERS
  // ===================================================================
  const reminderTitles = ['متابعة تجديد الاشتراك', 'تذكير بموعد إن بودي', 'الاتصال بعضو منقطع', 'تهنئة بعيد الميلاد', 'متابعة دفعة متبقية'];
  const channels = ['app', 'sms', 'whatsapp', 'call'];
  const reminderStatuses = ['pending', 'pending', 'done', 'cancelled'];
  let reminderCount = 0;
  for (let i = 0; i < 12; i++) {
    const m = members.length > 0 ? pick(members) : null;
    await prisma.club_reminders.create({
      data: {
        member_id: m?.id ?? null,
        member_name: m?.name ?? fullNameMale(),
        title: pick(reminderTitles),
        reminder_date: ymd(addDays(BASE, randInt(-5, 20))),
        reminder_time: `${String(randInt(9, 19)).padStart(2, '0')}:00:00`,
        channel: pick(channels),
        status: pick(reminderStatuses),
        notes: chance(0.3) ? 'أولوية عالية' : null,
        branch_id: m?.branch_id ?? B(i),
      },
    });
    reminderCount++;
  }

  // ===================================================================
  // 12. MACHINES + MAINTENANCE
  // ===================================================================
  const machineDefs = [
    { name: 'جهاز مشي كهربائي', model: 'Life Fitness' },
    { name: 'دراجة ثابتة', model: 'Technogym' },
    { name: 'جهاز تجديف', model: 'Concept2' },
    { name: 'جهاز ضغط الصدر', model: 'Hammer Strength' },
    { name: 'جهاز سحب أمامي', model: 'Matrix' },
    { name: 'جهاز السكوات سميث', model: 'Precor' },
    { name: 'جهاز الكابل المزدوج', model: 'Life Fitness' },
    { name: 'إليبتيكال', model: 'Precor' },
  ];
  const machines: { id: number; name: string; branch_id: number }[] = [];
  for (let i = 0; i < machineDefs.length; i++) {
    const bId = B(i);
    const row = await prisma.club_machines.create({
      data: {
        name: machineDefs[i].name,
        serial_number: `SN-${10000 + i}`,
        model_name: machineDefs[i].model,
        branch_id: bId,
        status: pick(['active', 'active', 'active', 'maintenance', 'retired']),
      },
    });
    machines.push({ id: row.id, name: machineDefs[i].name, branch_id: bId });
  }
  const maintTypes = ['وقائية', 'إصلاح', 'فحص', 'قطع غيار'];
  const maintStatuses = ['scheduled', 'in_progress', 'completed', 'completed'];
  let maintCount = 0;
  for (let i = 0; i < 10; i++) {
    const mc = pick(machines);
    await prisma.club_machine_maintenance.create({
      data: {
        machine_id: mc.id,
        machine_name: mc.name,
        maintenance_date: ymd(addDays(BASE, -randInt(0, 60))),
        maintenance_type: pick(maintTypes),
        cost: round2(randInt(100, 1500) + rnd01()),
        notes: chance(0.4) ? 'تم استدعاء الفني المعتمد' : null,
        branch_id: mc.branch_id,
        status: pick(maintStatuses),
      },
    });
    maintCount++;
  }

  // ===================================================================
  // 13. WORKOUTS + TRAINING NOTES + BRANCH VISITS + ONE-PASS SESSIONS
  // ===================================================================
  const workoutTitles = ['برنامج تضخيم 4 أيام', 'برنامج تنشيف', 'برنامج مبتدئين', 'كارديو حرق الدهون', 'قوة ورفع أثقال'];
  const workoutTypes = ['قوة', 'كارديو', 'مرونة', 'وظيفي', 'هيت'];
  let workoutCount = 0;
  for (let i = 0; i < 10; i++) {
    const m = members.length > 0 ? pick(members) : null;
    await prisma.club_workouts.create({
      data: {
        title: pick(workoutTitles),
        workout_type: pick(workoutTypes),
        trainer_name: trainerName(),
        member_id: m?.id ?? null,
        member_name: m?.name ?? fullNameMale(),
        workout_date: ymd(addDays(BASE, -randInt(0, 30))),
        notes: chance(0.4) ? 'زيادة الأوزان تدريجياً' : null,
        branch_id: m?.branch_id ?? B(i),
      },
    });
    workoutCount++;
  }

  let noteCount = 0;
  const noteTexts = ['تحسن ملحوظ في الأداء', 'يحتاج إلى ضبط النظام الغذائي', 'إصابة بسيطة في الكتف — تخفيف الأحمال', 'التزام ممتاز بالحضور', 'زيادة في الكتلة العضلية'];
  for (let i = 0; i < 10; i++) {
    const m = members.length > 0 ? pick(members) : null;
    await prisma.club_training_notes.create({
      data: {
        member_id: m?.id ?? null,
        member_name: m?.name ?? fullNameMale(),
        trainer_name: trainerName(),
        note_date: ymd(addDays(BASE, -randInt(0, 40))),
        notes: pick(noteTexts),
        branch_id: m?.branch_id ?? B(i),
      },
    });
    noteCount++;
  }

  let visitCount = 0;
  for (let i = 0; i < 12; i++) {
    const m = members.length > 0 ? pick(members) : null;
    await prisma.club_branch_visits.create({
      data: {
        member_id: m?.id ?? null,
        member_name: m?.name ?? fullNameMale(),
        branch_id: m?.branch_id ?? B(i),
        visit_date: ymd(addDays(BASE, -randInt(0, 20))),
        visit_time: `${String(randInt(7, 21)).padStart(2, '0')}:${String(randInt(0, 59)).padStart(2, '0')}:00`,
        notes: chance(0.2) ? 'زيارة ضيف' : null,
      },
    });
    visitCount++;
  }

  let sessionCount = 0;
  const sessionServices = ['تدريب شخصي', 'تقييم إن بودي', 'استشارة تغذية', 'حصة سباحة'];
  for (let i = 0; i < 12; i++) {
    const m = members.length > 0 ? pick(members) : null;
    await prisma.club_one_pass_sessions.create({
      data: {
        member_id: m?.id ?? null,
        member_name: m?.name ?? fullNameMale(),
        session_date: ymd(addDays(BASE, -randInt(0, 30))),
        service_name: pick(sessionServices),
        amount: round2(pick([75, 100, 150, 200]) + rnd01()),
        branch_id: m?.branch_id ?? B(i),
        status: pick(['active', 'active', 'used', 'expired']),
        notes: null,
      },
    });
    sessionCount++;
  }

  // ===================================================================
  // 14. SHIFTS + CLASS ROOMS + EMPLOYEE REQUESTS + CLOSING TRANSACTIONS
  // ===================================================================
  let shiftCount = 0;
  const shiftDefs = [
    { name: 'الوردية الصباحية', start_time: '06:00', end_time: '14:00' },
    { name: 'الوردية المسائية', start_time: '14:00', end_time: '22:00' },
    { name: 'وردية السيدات', start_time: '08:00', end_time: '16:00' },
  ];
  for (let i = 0; i < shiftDefs.length; i++) {
    await prisma.club_shifts.create({ data: { ...shiftDefs[i], branch_id: B(i), is_active: true } });
    shiftCount++;
  }

  let roomCount = 0;
  const roomDefs = [
    { name: 'استوديو A', code: 'A1', capacity: 25 },
    { name: 'استوديو B', code: 'B1', capacity: 20 },
    { name: 'قاعة السبينينج', code: 'SPN', capacity: 18 },
    { name: 'قاعة الكروس فيت', code: 'CF1', capacity: 15 },
  ];
  for (let i = 0; i < roomDefs.length; i++) {
    await prisma.club_class_rooms.create({ data: { ...roomDefs[i], branch_id: B(i), is_active: true } });
    roomCount++;
  }

  let empReqCount = 0;
  const reqTypes = ['إجازة', 'سلفة', 'تغيير وردية', 'شهادة راتب', 'استقالة'];
  const reqSubjects = ['طلب إجازة اعتيادية', 'طلب سلفة على الراتب', 'طلب تبديل وردية', 'طلب شهادة تعريف بالراتب', 'طلب إجازة مرضية'];
  const reqStatuses = ['pending', 'pending', 'approved', 'rejected'];
  for (let i = 0; i < 10; i++) {
    const emp = empPick();
    await prisma.club_employee_requests.create({
      data: {
        employee_id: emp,
        employee_name: empName(emp),
        request_type: pick(reqTypes),
        subject: pick(reqSubjects),
        body: chance(0.6) ? 'برجاء النظر في الطلب واعتماده.' : null,
        status: pick(reqStatuses),
        branch_id: B(i),
      },
    });
    empReqCount++;
  }

  let closingCount = 0;
  for (let i = 0; i < 14; i++) {
    const cash = randInt(2000, 12000);
    const card = randInt(1000, 9000);
    const other = randInt(0, 1500);
    await prisma.club_closing_transactions.create({
      data: {
        closing_date: ymd(addDays(BASE, -i)),
        branch_id: B(i),
        total_cash: cash,
        total_card: card,
        total_other: other,
        notes: chance(0.2) ? 'إقفال بدون فروقات' : null,
        closed_by: empName(empPick()),
      },
    });
    closingCount++;
  }

  log(
    'mos',
    `lookups:${lookupCount} leads:${leadCount} calls:${callCount} tickets:${ticketCount} invitations:${invCount} ` +
    `free_benefits:${benefitCount} financial:${finCount} commission_rules:${commissionCount} content:${contentCount} ` +
    `approvals:${approvalCount} reminders:${reminderCount} machines:${machines.length} maintenance:${maintCount} ` +
    `workouts:${workoutCount} training_notes:${noteCount} visits:${visitCount} sessions:${sessionCount} ` +
    `shifts:${shiftCount} rooms:${roomCount} emp_requests:${empReqCount} closings:${closingCount}`,
  );
  console.log('✔ MOS club done');
}

// self-run for standalone testing
if (require.main === module) {
  seedMosClub()
    .then(() => prisma.$disconnect())
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
