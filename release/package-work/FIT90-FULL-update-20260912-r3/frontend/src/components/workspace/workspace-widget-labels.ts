const WIDGET_TITLES: Record<string, string> = {
  recent_checkins: 'آخر الداخلين',
  pending_tasks: 'مهام معلقة',
  expiring_subscriptions: 'اشتراكات تنتهي قريباً',
  outstanding_balances: 'مستحقات',
  club_kpis: 'مؤشرات النادي',
  pending_renewals: 'تجديدات معلقة',
  attendance_rate: 'نسبة الحضور',
  treasury_today: 'خزينة اليوم',
  today_sales: 'مبيعات اليوم',
  pos_shift: 'وردية نقطة البيع',
};

/** Resolves widget labels during render so they follow the active locale. */
export function workspaceWidgetTitle(key: string, ui: (text: string) => string): string {
  return ui(WIDGET_TITLES[key] ?? key);
}
