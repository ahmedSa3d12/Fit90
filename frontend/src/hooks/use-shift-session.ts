import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface ShiftSessionCurrent {
  id: number;
  shiftId: number;
  branchId: number | null;
  status: string;
  openingBalance: number;
  totalSales: number;
  totalCash: number;
  transactionsCount: number;
  expectedClosingBalance: number | null;
}

export function useCurrentShiftSession(branchId?: string | number) {
  return useQuery({
    queryKey: ['shift-sessions', 'current', branchId],
    queryFn: async () => {
      const { data } = await api.get<ShiftSessionCurrent | null>('/shift-sessions/current', {
        params: branchId ? { branchId } : {},
      });
      return data;
    },
    enabled: !!branchId,
    refetchInterval: 30_000,
  });
}
