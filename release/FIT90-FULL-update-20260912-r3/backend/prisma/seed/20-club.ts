/* eslint-disable no-console */
/**
 * CLUB + FITNESS domain seed — the flagship feature.
 *
 * Seeds the club_* dataset: members, subscriptions (with receipts as the
 * source-of-truth for paid/remaining), refunds/transfers, attendance,
 * trainers, classes + enrollments + waitlist, InBody measurements/invoices,
 * SPA services/bookings/invoices, and customer sources.
 *
 * Foundation (branches / employees / users) is already seeded — reused via loaders.
 */
import {
  prisma, clearTables, log, randInt, pick, pickN, chance, round2, reseed,
  getBranchIds, getEmployees,
  BASE, addDays, ymd, hms,
  fullNameMale, fullNameFemale, phone,
} from './_shared';

export async function seedClub(): Promise<void> {
  console.log('▶ Club…');
  reseed();

  // Clear ONLY our tables, children first.
  await clearTables([
    'club_inbody_invoices',
    'club_spa_invoices',
    'club_spa_bookings',
    'club_spa_services',
    'club_inbody_measurements',
    'club_class_waitlist',
    'club_class_enrollments',
    'club_classes',
    'club_trainers',
    'club_subscription_transfers',
    'club_subscription_refunds',
    'club_receipts',
    'club_subscriptions',
    'club_attendance',
    'club_members',
    'club_subscription_types',
    'club_membership_types',
  ]);

  const branchIds = await getBranchIds();
  const employees = await getEmployees();
  const empIds = employees.map((e) => e.id);
  const B = (i: number) => branchIds[i % branchIds.length];

  // ===================================================================
  // 1. CATALOGS / SETTINGS
  // ===================================================================

  // ---- membership types ----
  const membershipTypeDefs = [
    { name: 'عضوية شهرية', price: 300, duration_days: 30 },
    { name: 'عضوية ربع سنوية', price: 800, duration_days: 90 },
    { name: 'عضوية نصف سنوية', price: 1500, duration_days: 180 },
    { name: 'عضوية سنوية', price: 2700, duration_days: 365 },
    { name: 'عضوية طلابية', price: 200, duration_days: 30 },
  ];
  const membershipTypes: number[] = [];
  for (const m of membershipTypeDefs) {
    const row = await prisma.club_membership_types.create({
      data: {
        name: m.name,
        description: `باقة ${m.name} تشمل دخول القاعات والمرافق`,
        price: m.price,
        duration_days: m.duration_days,
        is_active: true,
      },
    });
    membershipTypes.push(row.id);
  }

  // ---- subscription types (the sellable plans) ----
  const subTypeDefs = [
    { name: 'اشتراك شهر واحد', price: 350, days: 30, includes_spa: false, sessions: null },
    { name: 'اشتراك 3 أشهر', price: 900, days: 90, includes_spa: false, sessions: null },
    { name: 'اشتراك 6 أشهر', price: 1600, days: 180, includes_spa: true, sessions: null },
    { name: 'اشتراك سنوي VIP', price: 3000, days: 365, includes_spa: true, sessions: null },
    { name: 'باقة 12 حصة تدريب خاص', price: 1200, days: 60, includes_spa: false, sessions: 12 },
    { name: 'اشتراك طلابي شهري', price: 220, days: 30, includes_spa: false, sessions: null, students: true },
    { name: 'عرض الصيف الخاص', price: 500, days: 45, includes_spa: false, sessions: null, offer: true },
  ];
  const subTypes: { id: number; price: number; days: number; name: string }[] = [];
  for (const s of subTypeDefs) {
    const row = await prisma.club_subscription_types.create({
      data: {
        name: s.name,
        branch_id: pick(branchIds),
        price: s.price,
        days: s.days,
        is_special_offer: !!s.offer,
        is_for_students: !!s.students,
        show_in_app: true,
        wallet_points: chance(0.5) ? s.days : null,
        offer_validity: s.offer ? ymd(addDays(BASE, 60)) : null,
        is_linked_to_sessions: !!s.sessions,
        sessions_count: s.sessions ?? null,
        is_linked_to_freeze: s.days >= 90,
        freeze_days: s.days >= 90 ? 14 : null,
        includes_spa: !!s.includes_spa,
        spa_count: s.includes_spa ? 2 : null,
        is_active: true,
      },
    });
    subTypes.push({ id: row.id, price: s.price, days: s.days, name: s.name });
  }

  // ---- spa services ----
  const spaDefs = [
    { name: 'مساج استرخائي', duration: 60, price: 250 },
    { name: 'مساج رياضي علاجي', duration: 45, price: 300 },
    { name: 'جلسة ساونا', duration: 30, price: 100 },
    { name: 'جلسة بخار', duration: 30, price: 100 },
    { name: 'تدليك الأنسجة العميقة', duration: 75, price: 400 },
  ];
  const spaServices: { id: number; duration: number; price: number }[] = [];
  for (let i = 0; i < spaDefs.length; i++) {
    const s = spaDefs[i];
    const row = await prisma.club_spa_services.create({
      data: {
        name: s.name,
        description: `خدمة ${s.name} في مركز السبا`,
        duration: s.duration,
        price: s.price,
        branch_id: B(i),
        is_active: true,
      },
    });
    spaServices.push({ id: row.id, duration: s.duration, price: s.price });
  }

  // ===================================================================
  // 2. MEMBERS (45 across branches, both genders, statuses)
  // ===================================================================
  const MEMBER_COUNT = 45;
  const members: {
    id: number;
    code: string;
    name: string;
    gender: 'male' | 'female';
    branch_id: number;
    phone: string;
    is_active: boolean;
    start: string;
    end: string;
  }[] = [];

  // Branch-letter member codes: branch 1 -> A000001, branch 2 -> B000001, ...
  const branchCodePrefix = (branchId: number): string => {
    let n = Math.max(1, Math.floor(branchId));
    let out = '';
    while (n > 0) {
      const rem = (n - 1) % 26;
      out = String.fromCharCode(65 + rem) + out;
      n = Math.floor((n - 1) / 26);
    }
    return out;
  };
  const branchSeq: Record<number, number> = {};

  for (let i = 0; i < MEMBER_COUNT; i++) {
    const gender: 'male' | 'female' = chance(0.62) ? 'male' : 'female';
    const name = gender === 'male' ? fullNameMale() : fullNameFemale();
    const bid = B(i);
    const mType = pick(membershipTypes);
    // spread statuses: ~65% active, ~20% expired, ~15% upcoming/inactive
    const roll = rnd01();
    let startOffset: number;
    let durationDays = pick([30, 90, 180, 365]);
    let isActive = true;
    if (roll < 0.2) {
      // expired
      startOffset = -randInt(200, 400);
      durationDays = pick([30, 90]);
      isActive = false;
    } else if (roll < 0.35) {
      // upcoming (starts in future) OR recently inactive
      startOffset = chance(0.5) ? randInt(3, 25) : -randInt(10, 40);
      isActive = startOffset < 0 ? chance(0.5) : true;
    } else {
      // active
      startOffset = -randInt(5, 120);
      isActive = true;
    }
    const startDate = addDays(BASE, startOffset);
    const endDate = addDays(startDate, durationDays);
    const seq = (branchSeq[bid] = (branchSeq[bid] ?? 0) + 1);
    const code = `${branchCodePrefix(bid)}${String(seq).padStart(6, '0')}`;
    const memberPhone = phone();
    const row = await prisma.club_members.create({
      data: {
        member_code: code,
        name,
        phone: memberPhone,
        email: `member${1000 + i}@fit90gym.test`,
        gender: gender as any,
        card_number: `CARD-${100000 + i}`,
        date_of_birth: ymd(addDays(BASE, -randInt(6570, 16425))), // 18-45 yrs
        address: 'القاهرة - جمهورية مصر العربية',
        branch_id: bid,
        membership_type_id: mType,
        start_date: ymd(startDate),
        end_date: ymd(endDate),
        notes: chance(0.3) ? 'عضو مميز' : null,
        is_active: isActive,
        is_deleted: false,
        created_by: pick(empIds),
      },
    });
    members.push({
      id: row.id,
      code,
      name,
      gender,
      branch_id: bid,
      phone: memberPhone,
      is_active: isActive,
      start: ymd(startDate),
      end: ymd(endDate),
    });
  }

  // ===================================================================
  // 3. SUBSCRIPTIONS + RECEIPTS + REFUNDS + TRANSFERS
  // ===================================================================
  const subscriptions: {
    id: number;
    member_id: number;
    member_name: string;
    branch_id: number;
    value: number;
    paid: number;
    start: string;
    end: string;
    status: 'active' | 'expired' | 'upcoming';
    typeName: string;
    typeId: number;
    receiptNumber: string;
  }[] = [];

  let subCounter = 0;
  let receiptCounter = 0;
  for (const m of members) {
    // most members have exactly 1 current subscription; some have 2 (history)
    const subN = chance(0.25) ? 2 : 1;
    for (let s = 0; s < subN; s++) {
      const st = pick(subTypes);
      subCounter++;
      const isHistory = s === 0 && subN === 2;
      let startOffset: number;
      let status: 'active' | 'expired' | 'upcoming';
      if (isHistory) {
        startOffset = -(st.days + randInt(30, 120));
        status = 'expired';
      } else {
        const roll = rnd01();
        if (roll < 0.2) {
          startOffset = -(st.days + randInt(5, 60));
          status = 'expired';
        } else if (roll < 0.32) {
          startOffset = randInt(3, 20);
          status = 'upcoming';
        } else {
          startOffset = -randInt(1, Math.max(2, st.days - 5));
          status = 'active';
        }
      }
      const startDate = addDays(BASE, startOffset);
      const endDate = addDays(startDate, st.days);
      const discountEnabled = chance(0.25);
      const discountValue = discountEnabled ? round2(st.price * pick([0.05, 0.1, 0.15])) : 0;
      const value = round2(st.price - discountValue);
      // paid: most fully paid, some partial (source of truth = receipts)
      const payRoll = rnd01();
      let paid: number;
      if (payRoll < 0.7) paid = value; // fully paid
      else if (payRoll < 0.9) paid = round2(value * pick([0.5, 0.6, 0.75])); // partial
      else paid = 0; // unpaid
      const remaining = round2(value - paid);
      const receiptNumber = `RCP-${20260 + subCounter}`;
      const paymentMethod = pick(['cash', 'card', 'bank', 'online'] as const);

      const sub = await prisma.club_subscriptions.create({
        data: {
          subscription_number: `SUB-${20000 + subCounter}`,
          registration_date: ymd(startDate),
          branch_id: m.branch_id,
          member_id: m.id,
          customer_name: m.name,
          subscription_type_id: st.id,
          subscription_type: st.name,
          subscription_start_date: ymd(startDate),
          subscription_end_date: ymd(endDate),
          subscription_value: st.price,
          discount_enabled: discountEnabled,
          discount_value: discountValue,
          paid_amount: paid,
          remaining_amount: remaining,
          gender: m.gender as any,
          employee_id: pick(empIds),
          sales_id: pick(empIds),
          payment_method: paymentMethod as any,
          receipt_number: receiptNumber,
          status: status as any,
          is_special: st.name.includes('VIP'),
          is_linked_to_sessions: st.name.includes('حصة'),
          sessions_count: st.name.includes('حصة') ? 12 : null,
          sessions_used: st.name.includes('حصة') ? randInt(0, 8) : 0,
          is_time_based: chance(0.1),
          time_from: null,
          time_to: null,
          created_by: pick(empIds),
        },
      });

      subscriptions.push({
        id: sub.id,
        member_id: m.id,
        member_name: m.name,
        branch_id: m.branch_id,
        value,
        paid,
        start: ymd(startDate),
        end: ymd(endDate),
        status,
        typeName: st.name,
        typeId: st.id,
        receiptNumber,
      });

      // ---- receipts (source of truth for paid amount) ----
      if (paid > 0) {
        // primary receipt for the (possibly partial) payment
        receiptCounter++;
        await prisma.club_receipts.create({
          data: {
            receipt_number: receiptNumber,
            subscription_id: sub.id,
            member_id: m.id,
            member_name: m.name,
            amount: paid,
            type: 'subscription',
            receipt_date: ymd(startDate),
            status: 'مدفوعة',
            description: `دفعة اشتراك ${st.name}`,
          },
        });
      }
    }
  }

  // ---- a couple of time-based subscriptions with explicit windows ----
  const timeBasedSubs = subscriptions.filter((_, idx) => idx % 11 === 0).slice(0, 4);
  for (const tb of timeBasedSubs) {
    await prisma.club_subscriptions.update({
      where: { id: tb.id },
      data: { is_time_based: true, time_from: '06:00:00', time_to: '12:00:00' },
    });
  }

  // ---- refunds (a handful of stopped subscriptions) ----
  const refundSubs = pickN(subscriptions.filter((s) => s.status !== 'upcoming'), 6);
  let refundCounter = 0;
  for (const rs of refundSubs) {
    refundCounter++;
    const remainingDays = randInt(10, 60);
    const dailyRate = round4(rs.value / 90);
    const refundAmount = round2(dailyRate * remainingDays);
    await prisma.club_subscription_refunds.create({
      data: {
        subscription_id: rs.id,
        member_id: rs.member_id,
        customer_name: rs.member_name,
        subscription_type: rs.typeName,
        original_start_date: rs.start,
        original_end_date: rs.end,
        stop_date: ymd(addDays(BASE, -randInt(1, 20))),
        remaining_days: remainingDays,
        original_value: rs.value,
        daily_rate: dailyRate,
        refund_amount: refundAmount,
        invoice_number: `REF-${30000 + refundCounter}`,
        refund_date: ymd(addDays(BASE, -randInt(1, 15))),
        reason: pick(['ظروف صحية', 'سفر خارج المدينة', 'عدم القدرة على الالتزام', 'طلب العميل']),
        status: pick(['pending', 'completed', 'completed', 'cancelled'] as const) as any,
        branch_id: rs.branch_id,
        created_by: pick(empIds),
      },
    });
  }

  // ---- transfers (a handful) ----
  const transferSubs = pickN(subscriptions.filter((s) => s.status === 'active'), 5);
  let transferCounter = 0;
  for (const ts of transferSubs) {
    transferCounter++;
    const toType = pick(subTypes.filter((t) => t.name !== ts.typeName));
    await prisma.club_subscription_transfers.create({
      data: {
        subscription_id: ts.id,
        member_id: ts.member_id,
        customer_name: ts.member_name,
        from_subscription_type: ts.typeName,
        to_subscription_type: toType.name,
        from_start_date: ts.start,
        from_end_date: ts.end,
        to_start_date: ymd(addDays(BASE, -randInt(1, 10))),
        to_end_date: ymd(addDays(BASE, toType.days)),
        from_value: ts.value,
        to_value: toType.price,
        transfer_date: ymd(addDays(BASE, -randInt(1, 10))),
        reason: pick(['ترقية الباقة', 'تغيير مدة الاشتراك', 'رغبة العميل']),
        branch_id: ts.branch_id,
        created_by: pick(empIds),
      },
    });
  }

  // ===================================================================
  // 4. ATTENDANCE (recent check-ins for active members)
  // ===================================================================
  let attCount = 0;
  const activeMembers = members.filter((m) => m.is_active);
  for (const m of activeMembers) {
    const visits = randInt(2, 6);
    for (let v = 0; v < visits; v++) {
      const dayOffset = -randInt(0, 21);
      const checkInDate = addDays(BASE, dayOffset);
      const inHour = randInt(6, 20);
      const checkIn = new Date(checkInDate);
      checkIn.setHours(inHour, randInt(0, 59), 0, 0);
      // most checked out, today's may still be checked in
      const isToday = dayOffset === 0;
      const stillIn = isToday && chance(0.4);
      const durationMin = randInt(45, 120);
      const checkOut = stillIn ? null : new Date(checkIn.getTime() + durationMin * 60000);
      attCount++;
      await prisma.club_attendance.create({
        data: {
          member_id: m.id,
          member_code: m.code,
          member_name: m.name,
          branch_id: m.branch_id,
          check_in_time: checkIn,
          check_out_time: checkOut,
          attendance_date: ymd(checkInDate),
          status: stillIn ? 'checked_in' : 'checked_out',
          duration: stillIn ? null : durationMin,
          notes: null,
          created_by: pick(empIds),
        },
      });
    }
  }

  // ===================================================================
  // 5. TRAINERS
  // ===================================================================
  const specializations = [
    'كمال الأجسام والقوة',
    'اللياقة العامة',
    'الكارديو وفقدان الوزن',
    'الكروس فيت',
    'اليوغا والبيلاتس',
    'تدريب السيدات',
    'التأهيل الرياضي',
  ];
  const trainers: { id: number; name: string }[] = [];
  const trainerEmpPool = pickN(empIds, Math.min(4, empIds.length));
  for (let i = 0; i < 8; i++) {
    const isMale = i < 6;
    const name = isMale ? fullNameMale() : fullNameFemale();
    const linkedEmp = i < trainerEmpPool.length ? trainerEmpPool[i] : null;
    const trainer = await prisma.club_trainers.create({
      data: {
        employee_id: linkedEmp,
        name,
        email: `trainer${i + 1}@fit90gym.test`,
        phone: phone(),
        specialization: pick(specializations),
        experience: `${randInt(2, 15)} سنوات`,
        bio: 'مدرب معتمد بخبرة واسعة في مجال اللياقة البدنية والتدريب الشخصي',
        rating_avg: round2(3.5 + rnd01() * 1.5),
        is_active: true,
        is_deleted: false,
      },
    });
    trainers.push({ id: trainer.id, name });
  }

  // ===================================================================
  // 6. CLASSES + ENROLLMENTS + WAITLIST
  // ===================================================================
  const classNameDefs = [
    'كارديو صباحي',
    'كروس فيت مكثف',
    'يوغا مسائية',
    'تمارين الحديد للمبتدئين',
    'أيروبيك السيدات',
    'HIIT حرق الدهون',
    'بيلاتس',
    'تدريب دائري',
    'تمارين البطن والقوة',
    'سبينينج',
    'زومبا',
    'ملاكمة لياقة',
  ];
  const classes: { id: number; cap: number; date: string }[] = [];
  for (let i = 0; i < classNameDefs.length; i++) {
    const trainer = pick(trainers);
    const classBranchId = pick(branchIds);
    // spread across past (completed), today/soon (scheduled), future
    const roll = rnd01();
    let dayOffset: number;
    let status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
    if (roll < 0.35) {
      dayOffset = -randInt(1, 20);
      status = 'completed';
    } else if (roll < 0.85) {
      dayOffset = randInt(0, 14);
      status = 'scheduled';
    } else {
      dayOffset = randInt(1, 10);
      status = 'cancelled';
    }
    const classDate = addDays(BASE, dayOffset);
    const startHour = randInt(7, 19);
    const cap = pick([10, 12, 15, 20]);
    const cls = await prisma.club_classes.create({
      data: {
        class_name: classNameDefs[i],
        description: `حصة ${classNameDefs[i]} بإشراف مدرب متخصص`,
        trainer_id: trainer.id,
        branch_id: classBranchId,
        hall_id: null,
        class_date: ymd(classDate),
        start_time: `${String(startHour).padStart(2, '0')}:00:00`,
        end_time: `${String(startHour + 1).padStart(2, '0')}:00:00`,
        max_capacity: cap,
        price: pick([0, 0, 50, 75, 100]),
        status: status as any,
        is_active: true,
        is_deleted: false,
      },
    });
    classes.push({ id: cls.id, cap, date: ymd(classDate) });

    // enrollments (respect capacity + uniqueness)
    const enrolCount = Math.min(cap, randInt(4, cap));
    const enrolled = pickN(members, enrolCount);
    for (const em of enrolled) {
      let attStatus: 'registered' | 'attended' | 'absent' | 'cancelled';
      if (status === 'completed') attStatus = pick(['attended', 'attended', 'absent'] as const);
      else if (status === 'cancelled') attStatus = 'cancelled';
      else attStatus = 'registered';
      await prisma.club_class_enrollments.create({
        data: {
          class_id: cls.id,
          member_id: em.id,
          enrollment_date: ymd(addDays(classDate, -randInt(1, 7))),
          attendance_status: attStatus as any,
          attendance_time: attStatus === 'attended' ? `${String(startHour).padStart(2, '0')}:05:00` : null,
          notes: null,
        },
      });
    }

    // waitlist for a few "full" scheduled classes
    if (status === 'scheduled' && chance(0.4)) {
      const waitlisted = pickN(
        members.filter((mm) => !enrolled.some((e) => e.id === mm.id)),
        randInt(1, 3),
      );
      let pos = 1;
      for (const wm of waitlisted) {
        await prisma.club_class_waitlist.create({
          data: {
            class_id: cls.id,
            member_id: wm.id,
            position: pos++,
            status: 'waiting',
            notes: null,
          },
        });
      }
    }
  }

  // ===================================================================
  // 7. INBODY MEASUREMENTS + INVOICES
  // ===================================================================

  // ---- inbody measurements + invoices ----
  const inbodyMembers = pickN(members, 16);
  let inbodyInvCounter = 0;
  for (const im of inbodyMembers) {
    const measDate = addDays(BASE, -randInt(1, 45));
    const weight = round2(60 + rnd01() * 40);
    const bmi = round2(weight / 3.0);
    await prisma.club_inbody_measurements.create({
      data: {
        member_id: im.id,
        measurement_date: ymd(measDate),
        weight,
        body_fat: round2(14 + rnd01() * 16),
        muscle_mass: round2(weight * 0.42),
        bmi,
        notes: 'قياس InBody دوري',
      },
    });
    // matching invoice
    inbodyInvCounter++;
    const price = pick([50, 75, 100]);
    await prisma.club_inbody_invoices.create({
      data: {
        invoice_number: `INB-${50000 + inbodyInvCounter}`,
        is_member: true,
        member_id: im.id,
        customer_name: im.name,
        service_id: null,
        branch_id: im.branch_id,
        unit_price: price,
        total_amount: price,
        invoice_date: ymd(measDate),
        invoice_time: hms(new Date()),
        status: 'paid',
        is_active: true,
      },
    });
  }
  // a couple of non-member (walk-in) inbody invoices
  for (let i = 0; i < 3; i++) {
    inbodyInvCounter++;
    const price = pick([75, 100]);
    await prisma.club_inbody_invoices.create({
      data: {
        invoice_number: `INB-${50000 + inbodyInvCounter}`,
        is_member: false,
        member_id: null,
        customer_name: fullNameMale(),
        service_id: null,
        branch_id: pick(branchIds),
        unit_price: price,
        total_amount: price,
        invoice_date: ymd(addDays(BASE, -randInt(1, 20))),
        invoice_time: '10:30:00',
        status: 'paid',
        is_active: true,
      },
    });
  }

  // ===================================================================
  // 8. SPA BOOKINGS + INVOICES
  // ===================================================================

  // ---- spa bookings ----
  let spaBookingCounter = 0;
  for (let i = 0; i < 16; i++) {
    spaBookingCounter++;
    const svc = pick(spaServices);
    const mm = chance(0.8) ? pick(members) : null;
    const dayOffset = randInt(-10, 14);
    const bookDate = addDays(BASE, dayOffset);
    const startHour = randInt(10, 19);
    let status: 'pending' | 'confirmed' | 'active' | 'completed' | 'cancelled';
    let payStatus: 'unpaid' | 'paid' | 'partial';
    if (dayOffset < 0) {
      status = pick(['completed', 'cancelled'] as const);
      payStatus = status === 'completed' ? 'paid' : 'unpaid';
    } else {
      status = pick(['pending', 'confirmed', 'confirmed'] as const);
      payStatus = pick(['unpaid', 'paid', 'partial'] as const);
    }
    await prisma.club_spa_bookings.create({
      data: {
        booking_number: `SPA-${60000 + spaBookingCounter}`,
        member_id: mm?.id ?? null,
        customer_name: mm ? mm.name : fullNameFemale(),
        customer_phone: mm ? mm.phone : phone(),
        service_id: svc.id,
        branch_id: mm ? mm.branch_id : pick(branchIds),
        booking_date: ymd(bookDate),
        booking_time: `${String(startHour).padStart(2, '0')}:30:00`,
        duration: svc.duration,
        price: svc.price,
        status: status as any,
        payment_status: payStatus as any,
        notes: null,
        is_active: true,
      },
    });
  }

  // ---- spa invoices (members only, service_id required) ----
  let spaInvCounter = 0;
  const spaInvMembers = pickN(members, 12);
  for (const sm of spaInvMembers) {
    spaInvCounter++;
    const svc = pick(spaServices);
    const qty = pick([1, 1, 1, 2]);
    await prisma.club_spa_invoices.create({
      data: {
        invoice_number: `SPI-${70000 + spaInvCounter}`,
        member_id: sm.id,
        service_id: svc.id,
        branch_id: sm.branch_id,
        quantity: qty,
        unit_price: svc.price,
        total_amount: round2(svc.price * qty),
        invoice_date: ymd(addDays(BASE, -randInt(1, 30))),
        status: 'paid',
        is_active: true,
      },
    });
  }

  // ---- customer sources (for subscription lead-source dropdown) ----
  const customerSources = ['Facebook', 'Instagram', 'صديق', 'إعلان', 'Google', 'Walk-in'];
  for (const name of customerSources) {
    const exists = await prisma.club_customer_sources.findFirst({ where: { name } });
    if (!exists) {
      await prisma.club_customer_sources.create({ data: { name, is_active: true } });
    }
  }

  log('club', `membership_types: ${membershipTypes.length}, sub_types: ${subTypes.length}, members: ${members.length}, subscriptions: ${subscriptions.length}, receipts: ${receiptCounter}, attendance: ${attCount}, trainers: ${trainers.length}, classes: ${classes.length}, customer_sources: ${customerSources.length}`);
  console.log('✔ Club done');
}

// local numeric helpers (kept here to avoid touching _shared)
function rnd01(): number {
  // reuse the shared PRNG via randInt for determinism
  return randInt(0, 1_000_000) / 1_000_000;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// self-run for standalone testing
if (require.main === module) {
  seedClub()
    .then(() => prisma.$disconnect())
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
