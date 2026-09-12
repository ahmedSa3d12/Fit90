import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { EmployeeListItem } from '@/types/employees';

export function useEmployeeOptions(enabled = true) {
  return useQuery({
    queryKey: ['employees', 'options'],
    queryFn: async () => {
      const { data } = await api.get<{ data: EmployeeListItem[] }>('/employees', {
        params: { page: 1, pageSize: 500, status: 1 },
      });
      return (data.data ?? []).map((e) => ({
        value: String(e.id),
        label: `${e.employee ?? '—'} (${e.emp_code ?? '—'})`,
      }));
    },
    enabled,
    staleTime: 60_000,
  });
}
