/* eslint-disable no-console */
/**
 * Club extras — fills the last few empty club tables so their pages aren't blank:
 *   - club_sales_staff       → /settings/sales-staff
 *   - club_lost_found        → /club/lost-found
 *   - club_inbody_bookings   → /club/fitness/inbody-bookings
 *
 * Also seeds a handful of `tbl_notifications` addressed to the admin account
 * (user_id 1) so the notifications bell/page shows data for the demo login.
 * (tbl_notifications is legacy/foundation data — we only clear the admin's own
 *  rows here, never TRUNCATE the whole table.)
 */
import {
  prisma, clearTables, log, randInt, pick, chance,
  BASE, addDays, ymd, dmy, hms,
  fullNameMale, fullNameFemale, phone,
  getBranchIds, getEmployees,
} from './_shared';

const LOST_ITEMS = [
  'محفظة جلدية سوداء', 'ساعة يد رياضية', 'سماعات لاسلكية', 'مفاتيح سيارة',
  'زجاجة مياه حرارية', 'منشفة زرقاء', 'نظارة شمسية', 'هاتف جوال',
  'حقيبة رياضية', 'قفازات تمرين', 'خاتم فضي', 'شاحن متنقل',
  'حزام رفع أثقال', 'سلسلة مفاتيح', 'بطاقة عضوية',
];
const ACTIONS = [
  'تم تخزينه في مكتب الاستقبال', 'محفوظ في خزانة المفقودات', 'بانتظار المراجعة',
];

export async function seedClubExtras(): Promise<void> {
  console.log('▶ Club extras…');
  await clearTables(['club_inbody_bookings', 'club_lost_found', 'club_sales_staff']);

  const branches = await getBranchIds();
  const employees = await getEmployees();
  const members = await prisma.club_members.findMany({
    where: { is_deleted: false },
    select: { id: true, name: true, branch_id: true },
    orderBy: { id: 'asc' },
    take: 40,
  });

  const staffNames = employees.map((e) => e.employee).filter(Boolean) as string[];
  const pickStaff = () => (staffNames.length ? pick(staffNames) : fullNameMale());

  // ---- club_sales_staff (10) --------------------------------------------
  let salesCount = 0;
  for (let i = 0; i < 10; i++) {
    await prisma.club_sales_staff.create({
      data: {
        name: chance(0.5) ? fullNameMale() : fullNameFemale(),
        phone: phone(),
        branch_id: pick(branches),
        is_active: chance(0.85), // most active, a couple inactive
        is_deleted: false,
      },
    });
    salesCount++;
  }

  // ---- club_lost_found (15) ---------------------------------------------
  // Spread found_date so some stored items are "stale" (>30d before BASE).
  let lostCount = 0;
  for (let i = 0; i < LOST_ITEMS.length; i++) {
    const delivered = chance(0.35);
    const foundAt = addDays(BASE, -randInt(1, 70));
    const deliveredAt = delivered ? addDays(foundAt, randInt(1, 10)) : null;
    await prisma.club_lost_found.create({
      data: {
        item_name: LOST_ITEMS[i],
        description: chance(0.6) ? `${LOST_ITEMS[i]} — عُثر عليه داخل النادي` : null,
        staff_name: pickStaff(),
        found_date: ymd(foundAt),
        found_time: hms(foundAt).slice(0, 5),
        action_taken: pick(ACTIONS),
        branch_id: pick(branches),
        status: delivered ? 'delivered' : 'stored',
        delivered_to: delivered ? (chance(0.5) ? fullNameMale() : fullNameFemale()) : null,
        delivered_phone: delivered ? phone() : null,
        delivered_at: deliveredAt ? ymd(deliveredAt) : null,
        delivered_note: delivered && chance(0.5) ? 'تم التسليم بعد التحقق من الهوية' : null,
        is_deleted: false,
        created_by: 1,
      },
    });
    lostCount++;
  }

  // ---- club_inbody_bookings (14) ----------------------------------------
  // Standalone bookings (no availability slot) spread over the past/future.
  let inbodyCount = 0;
  for (let i = 0; i < 14; i++) {
    const m = members.length ? pick(members) : null;
    const day = addDays(BASE, randInt(-20, 20));
    const startH = randInt(9, 19);
    const status = pick(['booked', 'booked', 'completed', 'completed', 'cancelled'] as const);
    await prisma.club_inbody_bookings.create({
      data: {
        member_id: m?.id ?? null,
        member_name: m?.name ?? (chance(0.5) ? fullNameMale() : fullNameFemale()),
        slot_id: null,
        booking_date: ymd(day),
        start_time: `${String(startH).padStart(2, '0')}:00`,
        end_time: `${String(startH).padStart(2, '0')}:30`,
        staff_name: pickStaff(),
        status,
        notes: chance(0.4) ? 'قياس دوري للتركيب الجسدي' : null,
        branch_id: m?.branch_id ?? pick(branches),
        is_deleted: false,
      },
    });
    inbodyCount++;
  }

  // ---- tbl_notifications for admin (user_id 1) --------------------------
  // So the demo admin login sees a non-empty notifications page.
  await prisma.tbl_notifications.deleteMany({ where: { to_user: 1 } });
  const settings = await prisma.tbl_sys_notifications_settings.findMany({ select: { code: true } });
  const codes = settings.map((s) => s.code).filter((c): c is number => c != null);
  let notifCount = 0;
  for (let i = 0; i < 8; i++) {
    const when = addDays(BASE, -randInt(0, 14));
    await prisma.tbl_notifications.create({
      data: {
        from_user: pick([2, 3, 4]),
        to_user: 1,
        date_ar: dmy(when),
        time_ar: hms(when).slice(0, 5),
        seen: i < 3 ? 0 : 1, // first few unread
        n_code: codes.length ? pick(codes) : null,
      },
    });
    notifCount++;
  }

  log('club-extras', `sales_staff:${salesCount} lost_found:${lostCount} inbody_bookings:${inbodyCount} admin_notifs:${notifCount}`);
  console.log('✔ Club extras done');
}

// self-run for standalone testing
if (require.main === module) {
  seedClubExtras()
    .then(() => prisma.$disconnect())
    .then(() => process.exit(0))
    .catch((e) => { console.error(e); process.exit(1); });
}
