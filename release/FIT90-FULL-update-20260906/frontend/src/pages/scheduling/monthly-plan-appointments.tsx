import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useFitnessT } from '@/hooks/use-fitness-t';
import { api } from '@/lib/api';
import { SELECT_CLS } from '../club/fitness/shared';
import { SchedulingCalendarPage } from './scheduling-calendar';
import type { Category } from './shared';

type Plan = {
  id: number;
  service_id: number;
  employee_id: number;
  month: number;
  year: number;
  status: 'draft' | 'published' | 'archived';
  service: { id: number; name: string };
  trainer: { id: number; name: string };
};

export function MonthlyPlanAppointments({ category }: { category: Category }) {
  const ft = useFitnessT();
  const [planId, setPlanId] = useState('');
  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['service-monthly-schedules', category],
    queryFn: async () => (await api.get<Plan[]>('/scheduling/monthly-schedules', { params: { category } })).data,
  });
  const plan = plans.find((item) => item.id === Number(planId));

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="grid gap-3 pt-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div className="space-y-1.5">
            <Label>{ft('sched.selectMonthlySchedule')}</Label>
            <select className={SELECT_CLS} value={planId} onChange={(event) => setPlanId(event.target.value)}>
              <option value="">{isLoading ? ft('sched.loadingSchedules') : ft('sched.selectMonthlySchedule')}</option>
              {plans.map((item) => (
                <option key={item.id} value={item.id}>
                  #{item.id} · {item.service.name} · {item.month}/{item.year} · {item.trainer.name} · {ft(`sched.${item.status}`)}
                </option>
              ))}
            </select>
          </div>
          {plan && <p className="pb-2 text-sm text-muted-foreground">{plan.service.name} · {plan.trainer.name}</p>}
        </CardContent>
      </Card>

      {plan ? (
        <SchedulingCalendarPage
          category={category}
          serviceId={plan.service_id}
          employeeId={plan.employee_id}
          monthlyScheduleId={plan.id}
          initialDate={new Date(plan.year, plan.month - 1, 1)}
          initialView="week"
          readOnly={plan.status === 'archived'}
          embedded
        />
      ) : (
        <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">{ft('sched.chooseScheduleToManage')}</div>
      )}
    </div>
  );
}
