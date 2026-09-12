/** Shared types/constants for the Scheduling & Booking engine UI. */

export const CATEGORIES = [
  'class',
  'zumba',
  'nutrition',
  'spa',
  'personal_training',
  'inbody',
  'additional',
] as const;
export type Category = (typeof CATEGORIES)[number];

/** i18n label key (under fitness `sched.*`) for a category. */
export const CATEGORY_LABEL: Record<Category, string> = {
  class: 'sched.categoryClass',
  zumba: 'sched.categoryZumba',
  nutrition: 'sched.categoryNutrition',
  spa: 'sched.categorySpa',
  personal_training: 'sched.categoryPersonalTraining',
  inbody: 'sched.categoryInbody',
  additional: 'sched.categoryAdditional',
};

/** Category-aware copy used by the shared scheduling screens. */
export const CATEGORY_WEEK_LABEL: Record<Category, string> = {
  class: 'sched.classesThisWeek',
  zumba: 'sched.classesThisWeek',
  nutrition: 'sched.nutritionAppointmentsThisWeek',
  spa: 'sched.spaAppointmentsThisWeek',
  personal_training: 'sched.personalTrainingSessionsThisWeek',
  inbody: 'sched.appointmentsThisWeek',
  additional: 'sched.appointmentsThisWeek',
};

export const CATEGORY_DRAG_HINT: Record<Category, string> = {
  class: 'sched.classDragHint',
  zumba: 'sched.classDragHint',
  nutrition: 'sched.nutritionDragHint',
  spa: 'sched.spaDragHint',
  personal_training: 'sched.personalTrainingDragHint',
  inbody: 'sched.appointmentDragHint',
  additional: 'sched.appointmentDragHint',
};

export const CATEGORY_SERVICE_SETTINGS_TITLE: Record<Category, string> = {
  class: 'sched.classServiceSettings',
  zumba: 'sched.serviceSettings',
  nutrition: 'sched.nutritionServiceSettings',
  spa: 'sched.spaServiceSettings',
  personal_training: 'sched.personalTrainingServiceSettings',
  inbody: 'sched.serviceSettings',
  additional: 'sched.serviceSettings',
};

export const SCHEDULE_STATUSES = ['available', 'cancelled', 'hidden'] as const;
export const BOOKING_STATUSES = ['pending', 'confirmed', 'wait', 'completed', 'cancelled', 'no_show'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** Map engine booking status → StatusBadge visual bucket. */
export const BOOKING_BADGE: Record<BookingStatus, string> = {
  pending: 'pending',
  confirmed: 'active',
  wait: 'pending',
  completed: 'active',
  cancelled: 'expired',
  no_show: 'expired',
};

export interface ServiceRow {
  id: number;
  name: string;
  category: Category;
  description: string | null;
  entitlementKey: 'nutrition_session' | 'inbody' | null;
  durationMin: number;
  price: string;
  capacity: number | null;
  color: string | null;
  branchId: number | null;
  isActive: boolean;
}

export interface ScheduleRow {
  id: number;
  monthlyScheduleId?: number | null;
  serviceId: number;
  serviceName: string | null;
  additionalServiceId?: number | null;
  additionalServiceName?: string | null;
  additionalServicePrice?: string | null;
  category: Category | null;
  color: string | null;
  employeeId: number | null;
  employeeName: string | null;
  roomId: number | null;
  roomName: string | null;
  machineId: number | null;
  branchId: number | null;
  slotDate: string;
  startTime: string;
  endTime: string;
  bookingStartAt: string | null;
  bookingEndAt: string | null;
  capacity: number;
  bookedCount: number;
  waitingCount?: number;
  remaining: number;
  status: string;
  notes: string | null;
}

export interface BookingRow {
  id: number;
  bookingNumber: string;
  memberId: number | null;
  memberName: string | null;
  serviceId: number;
  serviceName: string | null;
  category: Category | null;
  color: string | null;
  scheduleId: number;
  employeeId: number | null;
  bookingDate: string;
  startTime: string | null;
  endTime: string | null;
  status: BookingStatus;
  notes: string | null;
  durationMin?: number | null;
  priceSnapshot?: number | null;
  coverageType?: 'subscription' | 'pay_at_branch' | null;
  paymentStatus?: 'not_required' | 'due_at_branch' | 'paid' | null;
  entitlementRestoredAt?: string | null;
  entitlementRestoreReason?: string | null;
  additionalServices?: Array<{ serviceId: number; name: string; status: string }>;
}

export interface InbodyRecordRow {
  id: number;
  memberId: number;
  memberName: string | null;
  recordDate: string;
  employeeId: number | null;
  staffName: string | null;
  fileUrl: string | null;
  weight: string | null;
  bodyFat: string | null;
  muscleMass: string | null;
  bmi: string | null;
  notes: string | null;
}

export interface TrainerRow {
  id: number;
  name: string;
}
