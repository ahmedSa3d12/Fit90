import { Banknote, CircleDollarSign, CreditCard, Target, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { toArabicDigits } from '@/lib/utils';

interface TargetCommissionCardProps {
  target: number;
  collected: number;
  outstanding: number;
  subscriptions: number;
  commissionRate: number;
  commissionAmount: number;
  targetAchievement: number;
  targetRemaining: number;
  locale: string;
  ui: (text: string) => string;
}

function money(value: number, locale: string) {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-US', {
    maximumFractionDigits: 2,
  }).format(value);
}

export function TargetCommissionCard({
  target,
  collected,
  outstanding,
  subscriptions,
  commissionRate,
  commissionAmount,
  targetAchievement,
  targetRemaining,
  locale,
  ui,
}: TargetCommissionCardProps) {
  const hasTarget = target > 0;

  return (
    <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-slate-950 via-primary/90 to-emerald-700 text-white shadow-xl">
      <div className="pointer-events-none absolute -end-16 -top-24 size-72 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -start-20 size-64 rounded-full bg-emerald-300/20 blur-3xl" />
      <CardContent className="relative p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-white/75">
              <TrendingUp className="size-4" />
              <span className="text-sm">{ui('أداء الشهر والعمولة المتوقعة')}</span>
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-1">
              <strong className="text-3xl font-bold nums sm:text-4xl">{money(collected, locale)}</strong>
              <span className="pb-1 text-sm text-white/70">{ui('مدفوع من التارجت')}</span>
            </div>
          </div>

          <div className="min-w-64 rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span>{ui('نسبة تحقيق التارجت')}</span>
              <strong className="text-lg nums">{toArabicDigits(targetAchievement)}%</strong>
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-black/25">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-300 to-emerald-300 transition-all duration-500"
                style={{ width: `${targetAchievement}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-xs text-white/65">
              <span>{ui('التارجت')}: {money(target, locale)}</span>
              <span>{hasTarget ? `${ui('المتبقي')}: ${money(targetRemaining, locale)}` : ui('لا يوجد تارجت')}</span>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric icon={CreditCard} label={ui('اشتراكات الشهر')} value={toArabicDigits(subscriptions)} />
          <Metric icon={Banknote} label={ui('المبلغ المدفوع')} value={money(collected, locale)} />
          <Metric icon={Target} label={ui('المتبقي للتحصيل')} value={money(outstanding, locale)} />
          <div className="rounded-2xl border border-amber-200/30 bg-amber-300/15 p-4">
            <div className="flex items-center justify-between gap-2 text-amber-100">
              <div className="flex items-center gap-2"><CircleDollarSign className="size-4" /><span className="text-xs">{ui('عمولتك المتوقعة')}</span></div>
              <span className="rounded-full bg-amber-200/20 px-2 py-0.5 text-xs font-bold nums">{toArabicDigits(commissionRate)}%</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-amber-200 nums">{money(commissionAmount, locale)}</p>
            <p className="mt-1 text-[11px] text-white/60">{ui('محسوبة على المبلغ المدفوع')}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Target; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
      <div className="flex items-center gap-2 text-white/65"><Icon className="size-4" /><span className="text-xs">{label}</span></div>
      <p className="mt-2 text-xl font-bold nums">{value}</p>
    </div>
  );
}
