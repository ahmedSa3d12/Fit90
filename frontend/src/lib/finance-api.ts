import type { FinanceDashboard, MonthlyTrendPoint } from '@/types/finance';

/** Backend accepts either dateFrom/dateTo or startDate/endDate. */
export function financeQueryDates(startDate: string, endDate: string) {
  return { dateFrom: startDate, dateTo: endDate, startDate, endDate };
}

function normalizeTrendPoint(raw: Record<string, unknown>): MonthlyTrendPoint {
  return {
    month: String(raw.month ?? ''),
    revenue: Number(raw.revenue ?? raw.revenues ?? 0),
    expense: Number(raw.expense ?? raw.expenses ?? 0),
    profit: Number(raw.profit ?? 0),
  };
}

/** Normalize dashboard payload — tolerates legacy backend field names. */
export function normalizeFinanceDashboard(raw: Record<string, unknown>): FinanceDashboard {
  const monthlyTrend = Array.isArray(raw.monthlyTrend)
    ? raw.monthlyTrend.map((p) => normalizeTrendPoint(p as Record<string, unknown>))
    : [];

  const totalRevenue = Number(raw.totalRevenue ?? raw.totalRevenues ?? 0);
  const totalExpenses = Number(raw.totalExpenses ?? 0);
  const netProfit = Number(raw.netProfit ?? totalRevenue - totalExpenses);

  return {
    totalRevenue,
    totalExpenses,
    netProfit,
    profitMargin: Number(
      raw.profitMargin ?? (totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : 0),
    ),
    revenueCount: Number(raw.revenueCount ?? 0),
    expenseCount: Number(raw.expenseCount ?? 0),
    monthlyTrend,
    expensesByCategory: Array.isArray(raw.expensesByCategory) ? raw.expensesByCategory : [],
    revenuesBySource: Array.isArray(raw.revenuesBySource) ? raw.revenuesBySource : [],
  };
}
