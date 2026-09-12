import { readFile } from 'fs/promises';
import { PrismaClient } from '@prisma/client';

const packageDir = 'E:/final_projects/asmaa/23-8-2026/FIT90_19-8/outputs/data-migration/final-upload-package-20260908';
const prisma = new PrismaClient();
const csvRows = async (file: string) => {
  const text = (await readFile(`${packageDir}/${file}`, 'utf8')).replace(/^\uFEFF/, '');
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) { const c = text[i];
    if (quoted && c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
    else if (c === '"') quoted = !quoted;
    else if (!quoted && c === ',') { row.push(cell); cell = ''; }
    else if (!quoted && c === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  const [headers, ...data] = rows.filter((r) => r.length > 1); return data.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
};
const number = (v: string) => Number(v || 0);
const status = (start: string, end: string) => start > '2026-09-08' ? 'upcoming' : end < '2026-09-08' ? 'expired' : 'active';

async function main() {
  const [members, subscriptions, leads] = await Promise.all([csvRows('members_final.csv'), csvRows('subscriptions_final.csv'), csvRows('potential_members_final.csv')]);
  const duplicatePhones = new Set<string>(); const keptMembers = members.filter((m) => { if (duplicatePhones.has(m.phone)) return false; duplicatePhones.add(m.phone); return true; });
  const result = await prisma.$transaction(async (tx) => {
    await tx.club_class_bookings.deleteMany(); await tx.club_member_points_transactions.deleteMany(); await tx.club_subscription_refunds.deleteMany(); await tx.club_subscription_transfers.deleteMany(); await tx.club_subscription_freezes.deleteMany(); await tx.club_receipts.deleteMany(); await tx.club_attendance.deleteMany(); await tx.club_subscriptions.deleteMany(); await tx.club_members.deleteMany(); await tx.club_leads.deleteMany();
    for (let i = 0; i < keptMembers.length; i += 500) await tx.club_members.createMany({ data: keptMembers.slice(i, i + 500).map((m) => ({ member_code: `MIG-${m.legacy_member_id}`, name: m.name, phone: m.phone, email: m.email || null, gender: m.gender as 'male'|'female', card_number: m.national_id || null, date_of_birth: m.date_of_birth || null, address: m.address || null, job_title: m.job_title || null, notes: m.notes || null, branch_id: 1, is_active: true, is_deleted: false })) });
    const created = await tx.club_members.findMany({ where: { member_code: { startsWith: 'MIG-' } }, select: { id: true, member_code: true, name: true } }); const memberMap = new Map(created.map((m) => [m.member_code.slice(4), m]));
    const keptSubscriptions = subscriptions.filter((s) => memberMap.has(s.legacy_member_id) && number(s.paid_amount) <= Math.max(0, number(s.subscription_value) - number(s.discount_value)));
    for (const s of keptSubscriptions) await tx.club_subscriptions.create({ data: { subscription_number: s.subscription_number, registration_date: s.registration_date || s.subscription_start_date, branch_id: 1, member_id: memberMap.get(s.legacy_member_id)!.id, customer_name: memberMap.get(s.legacy_member_id)!.name, subscription_type_id: Number(s.subscription_type_id), subscription_type: s.subscription_type_name, subscription_start_date: s.subscription_start_date, subscription_end_date: s.subscription_end_date, subscription_value: number(s.subscription_value), discount_enabled: number(s.discount_value) > 0, discount_value: number(s.discount_value), paid_amount: number(s.paid_amount), remaining_amount: number(s.remaining_amount), status: status(s.subscription_start_date, s.subscription_end_date), is_special: false, is_linked_to_sessions: false, sessions_used: 0, allow_multiple_daily_entries: false, is_time_based: false, benefits: {} } });
    const createdSubs = await tx.club_subscriptions.findMany({ select: { id: true, subscription_number: true, member_id: true, customer_name: true, paid_amount: true, subscription_type: true, registration_date: true } });
    await tx.club_receipts.createMany({ data: createdSubs.filter((s) => Number(s.paid_amount) > 0).map((s) => ({ receipt_number: `MIG-R-${s.id}`, subscription_id: s.id, member_id: s.member_id, member_name: s.customer_name ?? '', amount: s.paid_amount, type: s.subscription_type, receipt_date: s.registration_date, status: 'مدفوعة', description: 'Legacy migration opening payment' })) });
    for (let i = 0; i < leads.length; i += 500) await tx.club_leads.createMany({ data: leads.slice(i, i + 500).map((l) => ({ name: l.name, phone: l.phone || null, email: l.email || null, gender: l.gender || null, branch_id: 1, status: 'new', follow_up_at: l.follow_up_at || null, notes: l.notes || null, is_deleted: false })) });
    return { members: keptMembers.length, memberDuplicatesSkipped: members.length - keptMembers.length, subscriptions: keptSubscriptions.length, subscriptionsSkipped: subscriptions.length - keptSubscriptions.length, receipts: createdSubs.filter((s) => Number(s.paid_amount) > 0).length, leads: leads.length };
  }, { maxWait: 10000, timeout: 180000 });
  console.log(JSON.stringify(result, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
