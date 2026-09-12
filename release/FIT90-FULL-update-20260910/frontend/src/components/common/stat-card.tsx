import type { ReactNode } from 'react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatNum } from '@/lib/formatters';
import { cn, withAlpha } from '@/lib/utils';

const COLORS = [
  '#38BDF8',
  '#60A5FA',
  '#22D3EE',
  '#34D399',
  '#FBBF24',
  '#A78BFA',
  '#FB7185',
  '#2DD4BF',
] as const;

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  colorIndex?: number;
  sparkline?: { v: number }[];
  loading?: boolean;
  className?: string;
}

export function StatCard({
  title,
  value,
  subtitle,
  icon,
  colorIndex = 0,
  sparkline,
  loading,
  className,
}: StatCardProps) {
  const color = COLORS[colorIndex % COLORS.length];

  if (loading) {
    return (
      <Card className={cn('border-border/70 p-5 shadow-sm', className)}>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-3 h-8 w-16" />
        <Skeleton className="mt-2 h-3 w-32" />
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        'group relative overflow-hidden border p-5 shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg',
        className,
      )}
      style={{ borderColor: withAlpha(color, 0.32) }}
    >
      {/* Full-card colour wash — the whole card carries the metric's tone, evenly, no glow */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.14] transition-opacity duration-300 group-hover:opacity-[0.2] dark:opacity-[0.27] dark:group-hover:opacity-[0.36]"
        style={{ background: `linear-gradient(150deg, ${color} 0%, ${color} 62%, transparent 105%)` }}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-muted-foreground dark:text-white/90">{title}</p>
          <p className="mt-1.5 text-3xl font-bold nums tabular-nums tracking-tight dark:!text-white" style={{ color }}>
            {typeof value === 'number' ? formatNum(value) : value}
          </p>
          {subtitle && <p className="mt-1.5 text-xs text-muted-foreground dark:text-white/80">{subtitle}</p>}
        </div>
        {icon && (
          <div
            className="flex size-11 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-105"
            style={{ backgroundColor: withAlpha(color, 0.18), color, border: `1px solid ${withAlpha(color, 0.3)}` }}
          >
            {icon}
          </div>
        )}
      </div>
      {sparkline && sparkline.length > 0 && (
        <div className="relative mt-4 h-10 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkline}>
              <Area type="monotone" dataKey="v" stroke={color} fill={color} fillOpacity={0.12} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
