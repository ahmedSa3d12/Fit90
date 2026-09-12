import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartCard, chartColor } from '@/components/common/chart-card';
import { formatNum } from '@/lib/formatters';
import { useClubT } from '@/hooks/use-club-t';
import { localizeMosReportLabel } from '@/lib/mos-report-labels';
import type { Locale } from '@/store/locale';

interface ReportPayload {
  key: string;
  summary: Record<string, number | string>;
  columns: { key: string; label: string }[];
  rows: Record<string, unknown>[];
}

function numericSummaryPie(summary: Record<string, number | string>) {
  const skip = new Set(['count', 'total', 'totalDebt', 'net', 'since', 'totalCommission']);
  return Object.entries(summary)
    .filter(([k, v]) => typeof v === 'number' && !skip.has(k) && Number(v) > 0)
    .map(([name, value]) => ({ name, value: Number(value) }));
}

export function MosReportChart({
  reportKey,
  data,
  locale,
}: {
  reportKey: string;
  data: ReportPayload;
  locale: Locale;
}) {
  const ct = useClubT();
  const barData = useMemo(() => {
    const rows = data.rows ?? [];
    if (!rows.length) return null;

    if (reportKey === 'daybydayprofit' || rows[0]?.date != null) {
      return rows
        .filter((r) => r.date != null)
        .slice(0, 31)
        .map((r) => ({ name: String(r.date).slice(5), value: Number(r.amount ?? r.income ?? 0) }));
    }

    const commissionKey = rows[0]?.commission != null ? 'commission' : rows[0]?.amount != null ? 'amount' : null;
    const nameKey =
      rows[0]?.personName != null
        ? 'personName'
        : rows[0]?.customerName != null
          ? 'customerName'
          : rows[0]?.title != null
            ? 'title'
            : null;

    if (commissionKey && nameKey) {
      return rows.slice(0, 12).map((r) => ({
        name: String(r[nameKey]).slice(0, 18),
        value: Number(r[commissionKey]),
      }));
    }

    return null;
  }, [data.rows, reportKey]);

  const pieData = useMemo(() => {
    if (barData?.length) return null;
    const fromSummary = numericSummaryPie(data.summary ?? {}).map((item) => ({
      ...item,
      name: localizeMosReportLabel(locale, item.name),
    }));
    if (fromSummary.length >= 2) return fromSummary;
    return null;
  }, [barData, data.summary, locale]);

  if (barData?.length) {
    return (
      <ChartCard title={ct('mos.visualSummary')} height={280}>
        <BarChart data={barData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={50} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatNum(v)} width={48} />
          <Tooltip formatter={(v: number) => formatNum(v)} />
          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
            {barData.map((_, i) => (
              <Cell key={i} fill={chartColor(i)} />
            ))}
          </Bar>
        </BarChart>
      </ChartCard>
    );
  }

  if (pieData?.length) {
    return (
      <ChartCard title={ct('mos.breakdown')} height={280}>
        <PieChart>
          <Pie
            data={pieData}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={90}
            label={({ value }) => formatNum(Number(value))}
          >
            {pieData.map((_, i) => (
              <Cell key={i} fill={chartColor(i)} />
            ))}
          </Pie>
          <Tooltip formatter={(v: number) => formatNum(v)} />
        </PieChart>
      </ChartCard>
    );
  }

  return null;
}
