import { CalendarDays, ClipboardList } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/common/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFitnessT } from '@/hooks/use-fitness-t';
import { SchedulingCalendarPage } from './scheduling-calendar';
import { BookingsPage } from './bookings';
import { CATEGORY_LABEL, type Category } from './shared';
import { MonthlyScheduleLauncher } from './monthly-schedule-launcher';
import {
  DepartmentAppointmentsAdmin,
  DepartmentAvailableAppointmentsAdmin,
  DepartmentBookingsAdmin,
} from './department-admin';
import { SpaAdditionalServicesAdmin } from './spa-additional-services-admin';
import { NutritionMonthlyScheduleLauncher } from './nutrition-monthly-schedule-launcher';
import { NutritionAppointmentsAdmin } from './nutrition-appointments-admin';

/**
 * Schedule + Bookings for a service, side by side as two tabs. Works either for
 * a whole category (category-scoped routes) or a single service (the dynamic
 * hub passes `serviceId` + `serviceName`). The active tab is mirrored to `?tab=`
 * so it's deep-linkable. `embedded` drops the page header (the hub supplies its
 * own) and lets it live inside the two-pane hub layout.
 */
export function SchedulingWorkspacePage({
  category,
  serviceId,
  serviceName,
  initialTab = 'schedule',
  embedded = false,
}: {
  category?: Category;
  serviceId?: number;
  serviceName?: string;
  initialTab?: 'schedule' | 'bookings';
  embedded?: boolean;
}) {
  const ft = useFitnessT();
  const [params, setParams] = useSearchParams();
  const tab =
    params.get('tab') === 'bookings'
      ? 'bookings'
      : params.get('tab') === 'schedule'
        ? 'schedule'
        : initialTab;
  const requestedView = params.get('view');
  const calendarView = requestedView === 'month' || requestedView === 'day' ? requestedView : 'week';
  const scheduleStatus = params.get('status') === 'available' ? 'available' : undefined;
  const monthlyAdmin = calendarView === 'month' && category != null && ['nutrition', 'spa', 'personal_training'].includes(category);
  const appointmentsAdmin = params.get('mode') === 'appointments' && category != null && ['nutrition', 'spa', 'personal_training'].includes(category);
  const availableAdmin = scheduleStatus === 'available' && category != null && ['nutrition', 'spa', 'personal_training'].includes(category);
  const departmentAdmin = category != null && ['nutrition', 'spa', 'personal_training'].includes(category);
  const spaAdditionalAdmin = category === 'spa' && params.get('tab') === 'additional-services';

  const setTab = (value: string) => {
    const next = new URLSearchParams(params);
    next.set('tab', value);
    setParams(next, { replace: true });
  };

  if (departmentAdmin) {
    const content = (category === 'nutrition' || category === 'spa' || category === 'personal_training') && tab === 'schedule' && monthlyAdmin
      ? <NutritionMonthlyScheduleLauncher category={category} />
      : category === 'nutrition' && tab === 'schedule'
        ? <NutritionAppointmentsAdmin />
      : spaAdditionalAdmin
      ? <SpaAdditionalServicesAdmin />
      : tab === 'bookings'
      ? <DepartmentBookingsAdmin category={category} />
      : monthlyAdmin
        ? <MonthlyScheduleLauncher category={category} />
        : appointmentsAdmin
          ? <DepartmentAppointmentsAdmin category={category} />
          : availableAdmin
            ? <DepartmentAvailableAppointmentsAdmin category={category} />
            : <DepartmentAppointmentsAdmin category={category} />;
    const title = spaAdditionalAdmin
      ? ft('sched.categoryAdditional')
      : tab === 'bookings'
      ? ft('sched.bookingsTitle')
      : monthlyAdmin
        ? ft('sched.monthlySchedules')
        : availableAdmin
          ? ft('sched.availableAppointments')
          : ft('sched.appointmentManagement');
    return <div className="space-y-6"><PageHeader title={`${title} — ${ft(CATEGORY_LABEL[category])}`} description={ft('sched.title')} />{content}</div>;
  }

  return (
    <div className={embedded ? 'space-y-4' : 'space-y-5'}>
      {!embedded && (
        <PageHeader
          title={serviceName ?? (category ? ft(CATEGORY_LABEL[category]) : ft('sched.allClasses'))}
          description={ft('sched.title')}
        />
      )}

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="schedule">
            <CalendarDays className="me-1.5 h-4 w-4" />
            {ft('sched.title')}
          </TabsTrigger>
          <TabsTrigger value="bookings">
            <ClipboardList className="me-1.5 h-4 w-4" />
            {ft('sched.bookingsTitle')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="schedule">
          <SchedulingCalendarPage
            category={category}
            serviceId={serviceId}
            initialView={calendarView}
            status={scheduleStatus}
            embedded
          />
        </TabsContent>
        <TabsContent value="bookings">
          <BookingsPage category={category} serviceId={serviceId} embedded />
        </TabsContent>
      </Tabs>
    </div>
  );
}
