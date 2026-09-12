import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Category, TrainerRow } from './shared';

const PAGE_SIZE = 200;

export function useSchedulingProviders(category?: Category) {
  const query = useQuery({
    queryKey: ['scheduling-providers', category ?? 'all'],
    queryFn: async () => {
      const providerJobTitle =
        category === 'nutrition'
          ? 'أخصائي تغذية'
          : category === 'personal_training'
            ? 'مدرب'
            : null;

      if (providerJobTitle) {
        const response = await api.post<TrainerRow[]>('/club-trainers/providers/sync', {
          jobTitle: providerJobTitle,
        });
        return response.data;
      }

      let page = 1;
      let providers: TrainerRow[] = [];
      let total = 0;
      do {
        const response = await api.get<{ data: TrainerRow[]; total: number }>('/club-trainers', {
          params: { page, pageSize: PAGE_SIZE, isActive: true },
        });
        providers = [...providers, ...response.data.data];
        total = response.data.total;
        page += 1;
      } while (providers.length < total && page <= 50);
      return providers;
    },
  });

  return {
    providers: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
