import type { Locale } from '@/store/locale';

const AR_REPORT_LABELS: Record<string, string> = {
  attendanceCount: 'عدد مرات الحضور',
  avgRating: 'متوسط التقييم',
  basis: 'أساس الاحتساب',
  instructors: 'عدد مدربي الحصص',
  overallRatio: 'نسبة الإغلاق الإجمالية %',
  perClassRate: 'قيمة الحصة الواحدة',
  perTrainer: 'القيمة لكل مدرب',
  salesPersonsCount: 'عدد موظفي المبيعات',
  totalCollected: 'إجمالي المحصّل',
  totalConverted: 'إجمالي العملاء المحوّلين',
  totalDebt: 'إجمالي الديون',
  totalIncidents: 'إجمالي حالات التكرار',
  totalLeads: 'إجمالي العملاء المحتملين',
  totalPayroll: 'إجمالي مستحقات المدربين',
  totalSessions: 'إجمالي الحصص',
  totalUsed: 'إجمالي المستهلك',
  trainers: 'عدد المدربين',
  trainersCount: 'عدد المدربين',
  granted: 'الممنوح',
  totalGranted: 'إجمالي الممنوح',
  action: 'الإجراء', active: 'نشط', actor: 'المستخدم', amount: 'المبلغ', assigned: 'المُسندة',
  benefit: 'الميزة', benefitDate: 'تاريخ الميزة', benefitName: 'اسم الميزة', birthDate: 'تاريخ الميلاد',
  bucket: 'الفترة', callDate: 'تاريخ المكالمة', callsCount: 'عدد المكالمات', capacity: 'السعة',
  checkIns: 'مرات الحضور', classes: 'الحصص', classesAttended: 'الحصص المحضورة', className: 'اسم الحصة',
  classType: 'نوع الحصة', collected: 'المبلغ المحصّل', commission: 'العمولة',
  commissionPercentage: 'نسبة العمولة %', converted: 'تم التحويل', count: 'العدد', createdAt: 'التاريخ والوقت',
  customerName: 'العضو', date: 'التاريخ', detail: 'التفاصيل', discount: 'الخصم', employee: 'الموظف',
  employeeCode: 'كود الموظف', employeeName: 'اسم الموظف', endDate: 'تاريخ الانتهاء', enrollments: 'التسجيلات',
  entityType: 'نوع السجل', entries: 'القيود', entryDate: 'تاريخ القيد', entryType: 'نوع القيد',
  estimatedPayroll: 'الراتب التقديري', fixedAmount: 'العمولة الثابتة', followUp: 'المتابعة',
  fromType: 'من نوع', fromValue: 'القيمة السابقة', inviteeName: 'اسم المدعو', jobTitle: 'المسمى الوظيفي',
  kind: 'جديد / تجديد', lapsed: 'منتهية', lead: 'العميل المحتمل', leadName: 'اسم العميل المحتمل',
  leads: 'العملاء المحتملون', maxEndDate: 'أقصى تاريخ انتهاء', member: 'العضو', memberCode: 'كود العضو',
  memberName: 'اسم العضو', members: 'الأعضاء المتدربون', membersWithMultiple: 'أعضاء بحضور متكرر',
  message: 'معلومة', name: 'الاسم', outcome: 'النتيجة', paid: 'المدفوع', phone: 'رقم الهاتف',
  quantity: 'الكمية', rating: 'التقييم', ratio: 'النسبة %', receiptDate: 'تاريخ الإيصال',
  receiptNumber: 'رقم الإيصال', registrationDate: 'تاريخ التسجيل', remaining: 'المتبقي',
  remainingAmount: 'المبلغ المتبقي', retentionRate: 'نسبة الاحتفاظ %', salesPerson: 'موظف المبيعات',
  sessions: 'الحصص', sessionsConsumed: 'الحصص المستهلكة', sessionsCount: 'عدد الحصص',
  sessionsUsed: 'الحصص المستخدمة', source: 'المصدر', staffName: 'الموظف', startDate: 'تاريخ البدء',
  status: 'الحالة', subscriptionNumber: 'رقم الاشتراك', subscriptionsCount: 'عدد الاشتراكات',
  subscriptionType: 'نوع الاشتراك', target: 'المستهدف', targetAchievement: 'نسبة تحقيق المستهدف %',
  times: 'عدد المرات', title: 'العنوان', total: 'الإجمالي', totalSales: 'إجمالي المبيعات',
  toType: 'إلى نوع', toValue: 'القيمة الجديدة', trainer: 'المدرب', transferDate: 'تاريخ النقل',
  type: 'النوع', upgradeValue: 'قيمة الترقية', used: 'المستهلك', value: 'القيمة', visitDate: 'تاريخ الزيارة',
  days: 'عدد الأيام', employees: 'عدد الموظفين', expenses: 'المصروفات', generatedAt: 'وقت إنشاء التقرير',
  grandTotal: 'الإجمالي العام', groups: 'عدد المجموعات', income: 'الإيرادات', memberships: 'عدد الاشتراكات',
  net: 'صافي الربح', new: 'اشتراكات جديدة', renewed: 'اشتراكات مجددة', revenue: 'الإيراد', since: 'منذ',
  spa: 'السبا', subscriptions: 'الاشتراكات', totalClasses: 'إجمالي الحصص',
  totalCommission: 'إجمالي العمولة', totalConsumed: 'إجمالي المستهلك', totalDiscount: 'إجمالي الخصم',
  totalEnrollments: 'إجمالي التسجيلات', totalMembers: 'إجمالي الأعضاء', totalPaid: 'إجمالي المدفوع',
  totalQuantity: 'إجمالي الكمية', totalRemaining: 'إجمالي المتبقي', totalTarget: 'إجمالي المستهدف',
  totalUpgradeValue: 'إجمالي قيمة الترقية', totalValue: 'إجمالي القيمة', types: 'عدد الأنواع',
  uniqueMembers: 'الأعضاء الفريدون', inbody: 'InBody',
};

const AR_REPORT_VALUES: Record<string, string> = {
  'ice bath': 'حمام ثلج',
  'medical freeze': 'تجميد طبي',
  inbody: 'InBody',
  massage: 'مساج',
  'free days': 'أيام مجانية',
  'nutrition sessions': 'جلسات تغذية',
  'pt sessions': 'جلسات تدريب شخصي',
  'fitness sessions': 'جلسات لياقة',
  freeze: 'مرات التجميد',
  invitations: 'الدعوات',
  advance: 'سلفة',
  archived: 'مؤرشف',
  bank: 'تحويل بنكي',
  bonus: 'مكافأة',
  card: 'بطاقة',
  cash: 'نقدي',
  confirmed: 'مؤكد',
  deduction: 'خصم',
  draft: 'مسودة',
  employee_commission: 'عمولة موظف',
  expense: 'مصروف',
  expired: 'منتهي',
  frozen: 'مجمّد',
  no_show: 'لم يحضر',
  ongoing: 'جارٍ',
  online: 'دفع إلكتروني',
  other_revenue: 'إيراد آخر',
  published: 'منشور',
  salary: 'راتب',
  spa: 'سبا',
  transfer: 'تحويل',
  unpaid: 'غير مدفوع',
  upcoming: 'قادم',
  visa: 'فيزا',
  wait: 'قائمة انتظار',
  wallet: 'محفظة',
  active: 'نشط', approved: 'مقبول', cancelled: 'ملغي', closed: 'مغلق', completed: 'مكتمل',
  converted: 'تم التحويل', declined: 'مرفوض', expenses: 'المصروفات', false: 'لا', inactive: 'غير نشط',
  lost: 'غير مهتم', new: 'جديد', 'net profit': 'صافي الربح', open: 'مفتوح',
  'other revenue': 'إيرادات أخرى', paid: 'مدفوع', pending: 'قيد الانتظار', qualified: 'مؤهل',
  renewed: 'مجدد', 'receipts & payments': 'الإيصالات والمدفوعات', scheduled: 'مجدول',
  sent: 'تم الإرسال', true: 'نعم', unknown: 'غير محدد',
};

export function localizeMosReportLabel(locale: Locale, key: string, fallback = key): string {
  return locale === 'ar' ? (AR_REPORT_LABELS[key] ?? fallback) : fallback;
}

export function localizeMosReportValue(locale: Locale, value: unknown): string {
  if (value == null || value === '') return '—';
  if (typeof value === 'number') {
    return new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 2,
    }).format(value);
  }
  const text = String(value);
  if (locale !== 'ar') return text;
  const normalized = text.toLowerCase();
  const percentageBasis = normalized.match(/^([\d.]+)% of class revenue$/);
  if (percentageBasis) return `${percentageBasis[1]}% من إيراد الحصص`;
  const perClassBasis = normalized.match(/^([\d.]+) per class$/);
  if (perClassBasis) return `${perClassBasis[1]} لكل حصة`;
  return AR_REPORT_VALUES[normalized] ?? text;
}
